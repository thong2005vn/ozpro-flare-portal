import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { ethers } from "ethers";
import { QRCodeSVG } from "qrcode.react";
import { createWeb3Modal, defaultConfig } from "@web3modal/ethers/react";
import SwapModal from "./components/SwapModal";
// SDK chính thức của Flare để thao tác P-Chain (staking)
import { Network, EIP1193WalletController, Amount } from "@flarenetwork/flare-tx-sdk";
import {
  WNAT, REWARD_MANAGER, CLAIM_SETUP_MANAGER, CYCLE_SECONDS,
  FLARE_PARAMS, COLORS, PROVIDERS, styles
} from "./constants";
import quocHuyImg from "./assets/quoc-huy.png";
import { useLanguage } from "./i18n";

// ============================================================================
// CONSTANTS
// ============================================================================

const FLR_NETWORK = Network.FLARE;
// C-Chain dùng "/ext/C/rpc", P-Chain dùng "/ext/bc/P" — hai endpoint khác định dạng, không suy ra lẫn nhau
// ============================================================================
// FIX #4 — Danh sách RPC dự phòng cho P-Chain (đã tra cứu). "flare-api.flare.network" là node
// CHÍNH THỨC DUY NHẤT của Flare Foundation public miễn phí, không cần API key, cho các API
// platform.* (getStake, getCurrentValidators...). Các provider RPC khác (Ankr, QuickNode, dRPC...)
// có hỗ trợ P-Chain nhưng đều yêu cầu tài khoản/API key riêng, nên KHÔNG thể nhét thẳng một URL công
// khai vào đây làm fallback hoàn chỉnh. Nếu sau này có node dự phòng riêng (self-host, hoặc RPC trả
// phí kèm key), chỉ cần thêm URL vào mảng bên dưới — fetchPChainRPC() sẽ tự thử lần lượt.
// Trong lúc chưa có endpoint dự phòng, mảng chỉ có 1 phần tử nhưng vẫn có lợi: mọi lệnh gọi P-Chain
// giờ đi qua CÙNG một hàm có retry (kể cả lỗi 503, không chỉ 429 như trước), thay vì có chỗ retry
// có chỗ không như bản cũ.
// ============================================================================
const P_CHAIN_RPC_URLS = [
  "https://flare-api.flare.network/ext/bc/P"
  // "https://<endpoint-du-phong-cua-ban>/ext/bc/P", // thêm vào đây nếu có node dự phòng
];
const PRIMARY_SUBNET_ID = "11111111111111111111111111111111LpoYY";
const MIN_STAKE_FLR = 50_000;
const MIN_STAKE_DAYS = 14;
const FLARE_CHAIN_ID_HEX = "0xe";
const FLARE_EPOCH_ANCHOR = 1672945200;
const VALIDATOR_NAMES_URL = "https://raw.githubusercontent.com/flare-foundation/reward-scripts/main/ftso-address.csv";

const USDT0_ADDRESS = "0xe7cd86e13AC4309349F30B3435a9d337750fC82D";
const USDT_ADDRESS = "0x0B38e83B86d491735fEaa0a791F65c2B99535396";

const goldGradientBg = "linear-gradient(to bottom, #8A641C 0%, #F4D573 25%, #9A761C 50%, #FFF1A0 75%, #7B5611 100%)";
const goldTextStyle = {
  background: goldGradientBg,
  WebkitBackgroundClip: "text",
  WebkitTextFillColor: "transparent",
  backgroundClip: "text",
  color: "transparent"
};
const SOLID_GOLD = "#F4D573";
const STAKE_COLOR = "#00C2FF";

const projectId = "60e0395fcb2e23586895a5b421c97875";
const metadata = {
  name: "FLARE VN PORTAL",
  description: "Flare Delegation Account Rewards Manager",
  url: typeof window !== "undefined" ? window.location.origin : "http://localhost:5173",
  icons: ["https://avatars.githubusercontent.com/u/37784886"]
};
const flareNetworkConfig = {
  chainId: FLARE_PARAMS.chainId,
  name: FLARE_PARAMS.chainName,
  currency: "FLR",
  explorerUrl: FLARE_PARAMS.blockExplorerUrls[0],
  rpcUrl: FLARE_PARAMS.rpcUrls[0]
};
const modal = createWeb3Modal({
  ethersConfig: defaultConfig({ metadata, enableEIP6963: true, enableInjected: true, enableCoinbase: false }),
  chains: [flareNetworkConfig],
  projectId,
  enableAnalytics: false,
  themeMode: "dark",
  themeVariables: { "--w3m-z-index": "9999" }
});

const ABI = {
  pdaOwner: ["function owner() view returns (address)"],
  wnat: [
    "function balanceOf(address) view returns (uint256)",
    "function delegatesOf(address) view returns (address[], uint256[], uint256, uint256)",
    "function deposit() payable",
    "function withdraw(uint256)",
    "function transfer(address,uint256)"
  ],
  rewardManager: [
    "function getStateOfRewards(address) view returns (tuple(uint24, bytes20, uint120, uint8, bool)[][])",
    "function claim(address,address,uint24,bool,tuple(bytes32[],tuple(uint24,bytes20,uint120,uint8))[])",
    "function getRewardEpochIdsWithClaimableRewards() view returns (uint24,uint24)"
  ],
  erc20Balance: ["function balanceOf(address) view returns (uint256)"],
  csm: [
    "function accountToDelegationAccount(address) view returns (address)",
    "function enableDelegationAccount() external returns (address)",
    "function withdraw(uint256) external",
    "function delegate(address,uint256) external",
    "function undelegateAll() external"
  ]
};

// ============================================================================
// HELPERS
// ============================================================================

const getErrMsg = (e) => e?.shortMessage || e?.info?.error?.message || e?.reason || e?.message || "failed";

const shadeColor = (hex, percent) => {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const num = parseInt(h, 16);
  let r = (num >> 16) + percent;
  let g = ((num >> 8) & 0x00ff) + percent;
  let b = (num & 0x0000ff) + percent;
  r = Math.max(Math.min(255, r), 0);
  g = Math.max(Math.min(255, g), 0);
  b = Math.max(Math.min(255, b), 0);
  return "#" + (0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1);
};

// Tạo dải gradient ánh kim từ chính màu gốc, không đổi tông màu
const shineGradient = (hex) => {
  if (!hex || typeof hex !== "string" || !hex.startsWith("#")) return hex;
  return `linear-gradient(to bottom, ${shadeColor(hex, 50)} 0%, ${shadeColor(hex, 15)} 25%, ${hex} 50%, ${shadeColor(hex, -20)} 75%, ${shadeColor(hex, -45)} 100%)`;
};

const renderCountdown = (seconds) => {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n) => n.toString().padStart(2, "0");
  return (
    <div style={{ display: "flex", gap: "6px", alignItems: "baseline", fontFamily: "monospace" }}>
      <span>{pad(d)}</span><small style={{ fontSize: "10px", color: COLORS.TEXT_MUTE, marginRight: "2px" }}>d</small>
      <span>{pad(h)}</span><small style={{ fontSize: "10px", color: COLORS.TEXT_MUTE, marginRight: "2px" }}>h</small>
      <span>{pad(m)}</span><small style={{ fontSize: "10px", color: COLORS.TEXT_MUTE, marginRight: "2px" }}>m</small>
      <span style={{ color: COLORS.PINK }}>{pad(s)}</span><small style={{ fontSize: "10px", color: COLORS.TEXT_MUTE }}>s</small>
    </div>
  );
};

const formatCurrentTime = (date) => {
  const pad = (n) => n.toString().padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
};

// ============================================================================
// SHARED UI COMPONENTS
// ============================================================================

const GlowButton = ({ onClick, disabled, baseColor, textColor = "white", hoverTextColor, customStyle, children }) => {
  const gradient = shineGradient(baseColor);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{ ...styles.btnBase, background: gradient, color: textColor, ...(disabled ? { opacity: 0.5, cursor: "not-allowed" } : {}), ...customStyle }}
      onMouseOver={(e) => {
        if (disabled) return;
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.borderColor = baseColor;
        e.currentTarget.style.color = hoverTextColor || baseColor;
        e.currentTarget.style.boxShadow = `0 0 15px ${baseColor}88`;
      }}
      onMouseOut={(e) => {
        if (disabled) return;
        e.currentTarget.style.background = gradient;
        e.currentTarget.style.borderColor = "transparent";
        e.currentTarget.style.color = textColor;
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      {children}
    </button>
  );
};

// Nút hành động lớn với viền màu riêng + hiệu ứng "///" ở góc, dùng cho 2 nút nạp (PDA / P-Chain)
const AccentActionButton = ({ onClick, disabled, accentColor, label }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{
      ...styles.btnBase,
      width: "100%",
      padding: "15px",
      background: COLORS.PINK,
      color: "white",
      border: `3px solid ${accentColor}`,
      position: "relative",
      overflow: "hidden",
      ...(disabled ? { opacity: 0.5, cursor: "not-allowed" } : {})
    }}
    onMouseOver={(e) => {
      if (disabled) return;
      e.currentTarget.style.background = "transparent";
      e.currentTarget.style.color = accentColor;
      e.currentTarget.style.boxShadow = `0 0 15px ${accentColor}88`;
    }}
    onMouseOut={(e) => {
      if (disabled) return;
      e.currentTarget.style.background = COLORS.PINK;
      e.currentTarget.style.color = "white";
      e.currentTarget.style.boxShadow = "none";
    }}
  >
    <span style={{ position: "absolute", top: -6, right: 6, display: "flex", fontSize: 34, fontWeight: "900", color: accentColor, opacity: 0.85, lineHeight: 1, letterSpacing: "-6px" }}>///</span>
    <span style={{ position: "relative", zIndex: 1 }}>{label}</span>
  </button>
);

const RewardClaimBox = ({ message, amount, onClaim, baseColor, textColor = "black", pulse = false }) => (
  <div style={{
    background: "#0a0a0a",
    border: `1px solid ${baseColor}88`,
    borderRadius: 10,
    padding: "10px 12px",
    marginBottom: 14,
    ...(pulse ? { animation: "rewardClaimPulse 1.6s ease-in-out infinite" } : {})
  }}>
    <div style={{ fontSize: 11, color: COLORS.TEXT_MUTE, marginBottom: 8 }}>{message}</div>
    <GlowButton onClick={onClaim} baseColor={baseColor} textColor={textColor} customStyle={{ width: "100%", padding: "13px", fontSize: 14, fontWeight: 900 }}>
      {amount}
    </GlowButton>
  </div>
);

const useCryptoPrices = () => {
  const [prices, setPrices] = useState({ btc: 0, eth: 0, xrp: 0, flr: 0, sgb: 0, ltc: 0, doge: 0, cmc20: 0, flrChange24h: 0 });
  // Flash màu xanh/đỏ trên Price Tag của FLR mỗi khi giá vừa cập nhật đổi khác lần poll trước
  const [flrFlash, setFlrFlash] = useState(null); // 'up' | 'down' | null
  const prevFlrRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const getAllPrices = async () => {
      try {
        const ids = "bitcoin,ethereum,ripple,flare-networks,songbird,litecoin,dogecoin,coinmarketcap-20-index-dtf";
        const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`);
        const data = await res.json();
        if (cancelled) return;

        const newFlr = data["flare-networks"]?.usd || 0;
        if (prevFlrRef.current != null && newFlr !== prevFlrRef.current) {
          setFlrFlash(newFlr > prevFlrRef.current ? "up" : "down");
          setTimeout(() => setFlrFlash(null), 1200);
        }
        prevFlrRef.current = newFlr;

        setPrices({
          btc: data.bitcoin?.usd || 0,
          eth: data.ethereum?.usd || 0,
          xrp: data.ripple?.usd || 0,
          flr: newFlr,
          sgb: data.songbird?.usd || 0,
          ltc: data.litecoin?.usd || 0,
          doge: data.dogecoin?.usd || 0,
          cmc20: data["coinmarketcap-20-index-dtf"]?.usd || 0,
          flrChange24h: data["flare-networks"]?.usd_24h_change || 0
        });
      } catch (e) {
        console.error("Lỗi lấy giá crypto:", e);
      }
    };
    getAllPrices();
    const interval = setInterval(getAllPrices, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);
  return { prices, flrFlash };
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function FlarePortal() {
  const { lang, toggleLang, t, tList } = useLanguage();

  // --- Wallet / network ---
  const [account, setAccount] = useState("");
  const [walletType, setWalletType] = useState("");
  const [customEthersProvider, setCustomEthersProvider] = useState(null);
  const [isFlrNetworkAdded, setIsFlrNetworkAdded] = useState(true);

  // --- Main wallet + PDA ---
  const [pdaAddress, setPdaAddress] = useState("");
  const [isActivated, setIsActivated] = useState(false);
  const [balances, setBalances] = useState({ flr: "0", wflr: "0", pdaWflr: "0", reward: "0" });
  const [usdt0Balance, setUsdt0Balance] = useState("0");
  const [usdtBalance, setUsdtBalance] = useState("0");
  const [delegations, setDelegations] = useState([]);
  const [walletAmount, setWalletAmount] = useState("");
  const [pdaAmount, setPdaAmount] = useState("");
  const [providerSearch, setProviderSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [pendingProvider, setPendingProvider] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);

  // --- P-Chain staking ---
  const [pChainPublicKey, setPChainPublicKey] = useState("");
  const [pChainAddress, setPChainAddress] = useState("");
  const [pChainBalance, setPChainBalance] = useState("0"); // đã nạp vào P-Chain nhưng chưa stake
  const [stakedAmount, setStakedAmount] = useState("0");
  const [stakeAmount, setStakeAmount] = useState("");
  const [stakeDays, setStakeDays] = useState(String(MIN_STAKE_DAYS));
  const [stakeProviders, setStakeProviders] = useState([]); // tối đa 2 validator
  const [stakingTab, setStakingTab] = useState("overview"); // "overview" | "new"
  const [manualNodeSearch, setManualNodeSearch] = useState("");
  const [stakeProviderSearch, setStakeProviderSearch] = useState("");
  const [showStakeDropdown, setShowStakeDropdown] = useState(false);
  const [validators, setValidators] = useState([]);
  const [loadingValidators, setLoadingValidators] = useState(false);
  const [claimableStakingReward, setClaimableStakingReward] = useState("0");
  // Reward FTSO sinh ra từ việc stake, cộng thẳng vào Main Wallet (cAddress) — khác với claimableStakingReward
  // (pool riêng của SDK) và balances.reward (FTSO reward tích lũy qua PDA).
  const [mainWalletFtsoReward, setMainWalletFtsoReward] = useState("0");
  // Chi tiết từng khoản đang stake của mình trên P-Chain: nodeId, amount, startTime, endTime
  const [myStakes, setMyStakes] = useState([]);
  const [stakesLoading, setStakesLoading] = useState(false);
  const [stakesError, setStakesError] = useState(false);

  // --- UI state ---
  const [showQR, setShowQR] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showNetworkModal, setShowNetworkModal] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [isSwapOpen, setIsSwapOpen] = useState(false);
  const [quoteIndex, setQuoteIndex] = useState(0);
  const [status, setStatus] = useState("");
  const [currentTime, setCurrentTime] = useState(new Date());

  const dropdownRef = useRef(null);
  const stakeDropdownRef = useRef(null);
  const rewardRef = useRef(balances.reward);

  const { prices, flrFlash } = useCryptoPrices();
  const loadingQuotes = tList("quotes");

  const toUSD = useCallback(
    (amt) => `$${(Number(amt) * prices.flr).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    [prices.flr]
  );
  const formatBalance = useCallback(
    (amt) => Number(amt).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    []
  );

  // ============================================================================
  // FIX #1 — Provider được memo hóa thật sự (useMemo), không tạo lại mỗi lần render.
  // Trước đây getProvider() tạo `new ethers.BrowserProvider(window.ethereum)` MỚI mỗi lần gọi,
  // và vì đồng hồ currentTime re-render mỗi giây + <SwapModal provider={getProvider()}/> gọi nó
  // ngay trong JSX, nên cứ mỗi giây lại có 1 BrowserProvider mới được tạo ra, mỗi cái tự gắn thêm
  // listener vào window.ethereum mà không bao giờ được gỡ -> gây ra MaxListenersExceededWarning
  // và làm "ngộp" kênh giao tiếp nội bộ của ví (ObjectMultiplex - orphaned data).
  // Nay: chỉ tạo provider mới khi walletType/customEthersProvider thực sự đổi.
  // ============================================================================
  const provider = useMemo(() => {
    if (walletType === "metamask" && window.ethereum) return new ethers.BrowserProvider(window.ethereum);
    if (walletType === "walletconnect" && customEthersProvider) return customEthersProvider;
    return null;
  }, [walletType, customEthersProvider]);

  const getProvider = useCallback(() => provider, [provider]);

  // flare-tx-sdk cần provider EIP-1193 thô, không phải ethers.BrowserProvider đã bọc lại
  const getEip1193Provider = useCallback(() => {
    if (walletType === "metamask" && window.ethereum) return window.ethereum;
    if (walletType === "walletconnect") {
      try { return modal.getWalletProvider(); } catch { return null; }
    }
    return null;
  }, [walletType]);

  const getPChainWallet = useCallback(async () => {
    const rawProvider = getEip1193Provider();
    if (!rawProvider) throw new Error("Wallet not connected or does not support P-Chain");
    const controller = new EIP1193WalletController(rawProvider);
    return controller.getActiveWallet();
  }, [getEip1193Provider]);

  // --- Reward staking đang chờ claim + FTSO reward sinh ra từ stake (2 pool khác nhau, xem ghi chú ở state) ---
  const refreshClaimableStakingReward = useCallback(async (publicKeyOverride) => {
    const publicKey = publicKeyOverride || pChainPublicKey;
    if (!publicKey) return;
    try {
      const cAddress = FLR_NETWORK.getCAddress(publicKey);
      const claimable = await FLR_NETWORK.getClaimableStakingReward(cAddress);
      setClaimableStakingReward(ethers.formatEther(claimable.toString()));

      try {
        const p = getProvider();
        if (p) {
          const rewardManager = new ethers.Contract(REWARD_MANAGER, ABI.rewardManager, p);
          const states = await rewardManager.getStateOfRewards(cAddress);
          let mainWalletRewardWei = 0n;
          if (Array.isArray(states)) {
            states.forEach((epochArray) => {
              if (Array.isArray(epochArray)) epochArray.forEach((state) => { mainWalletRewardWei += BigInt(state[2]); });
            });
          }
          setMainWalletFtsoReward(ethers.formatEther(mainWalletRewardWei));
        }
      } catch {
        setMainWalletFtsoReward("0");
      }
    } catch (e) {
      console.error("Lỗi làm mới reward staking:", e);
    }
  }, [pChainPublicKey, getProvider]);

  // Cache danh sách nodeID mà ví này từng stake (không còn là điều kiện bắt buộc để dò nhanh — xem
  // FIX #5 ở refreshMyStakes — chỉ giữ lại phòng khi cần tối ưu thêm sau này).
  const stakeNodeCacheKey = useCallback((pAddr) => `flareportal_stake_nodes_${pAddr}`, []);

  // RPC công khai của Flare hay trả 429 (Too Many Requests) khi bị gọi dồn dập; lỗi này trình duyệt
  // thường hiển thị nhầm thành "CORS blocked" vì response 429 không kèm header CORS.
  // Hàm này thử lại vài lần, mỗi lần chờ lâu hơn, trước khi thật sự báo lỗi.
  const withRetry429 = useCallback(async (fn, retries = 3, delayMs = 1500) => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await fn();
      } catch (e) {
        const isLast = attempt === retries;
        if (isLast) throw e;
        await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
      }
    }
  }, []);

  // ============================================================================
  // FIX #4 (tiếp) — Hàm gọi RPC P-Chain DÙNG CHUNG cho mọi nơi trong file (thay vì mỗi chỗ tự
  // viết fetch() riêng, chỗ có retry chỗ không). Tự động:
  //  1. Thử lần lượt từng URL trong P_CHAIN_RPC_URLS (hiện chỉ có 1, xem ghi chú ở khai báo mảng).
  //  2. Với mỗi URL, retry vài lần qua withRetry429 — áp dụng cho MỌI lỗi mạng (429, 503, CORS-do-
  //     503-thiếu-header, timeout...), không chỉ riêng 429 như tên hàm gợi ý.
  //  3. Nếu response trả về nhưng có field "error" (RPC lỗi ở tầng logic, không phải mạng) thì
  //     ném lỗi luôn, không cần thử lại (retry cũng không giúp ích vì lỗi không phải tạm thời).
  // Nếu tất cả URL đều lỗi, ném lỗi cuối cùng để nơi gọi tự quyết định fallback UI (vd: chuyển sang
  // chọn thủ công validator).
  // ============================================================================
  const fetchPChainRPC = useCallback(async (method, params, retryOpts = {}) => {
    const { retries = 2, delayMs = 1500 } = retryOpts;
    let lastErr = null;
    for (const url of P_CHAIN_RPC_URLS) {
      try {
        return await withRetry429(async () => {
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 })
          });
          if (!res.ok) throw new Error(`P-Chain RPC (${url}) trả về HTTP ${res.status}`);
          const data = await res.json();
          if (data?.error) throw new Error(data.error?.message || "P-Chain RPC trả về lỗi");
          return data;
        }, retries, delayMs);
      } catch (e) {
        lastErr = e;
        console.warn(`P-Chain RPC lỗi ở endpoint ${url}${P_CHAIN_RPC_URLS.length > 1 ? ", thử endpoint kế tiếp" : ""}:`, e);
      }
    }
    throw lastErr || new Error("Tất cả P-Chain RPC endpoint đều lỗi");
  }, [withRetry429]);

  // ============================================================================
  // FIX #2 — Bước gác cổng bằng platform.getStake trước khi làm bất cứ điều gì tốn kém.
  // 1 request duy nhất tới RPC gốc, trả lời gần như ngay lập tức tổng số FLR đang stake
  // của địa chỉ này. Nếu = 0 thì chắc chắn ví chưa từng stake -> khỏi cần dò cache,
  // khỏi cần quét mạng, khỏi cần hiện ô "chọn thủ công validator".
  // Không cho biết nodeID/endTime từng khoản (những thứ đó nằm trong output UTXO mã hoá),
  // nên chỉ dùng để QUYẾT ĐỊNH có cần dò tiếp hay không, không thay thế được đường chi tiết bên dưới.
  // ============================================================================
  const checkTotalStaked = useCallback(async (pAddress) => {
    const data = await fetchPChainRPC("platform.getStake", { addresses: [`P-${pAddress}`], validatorsOnly: false });
    return BigInt(data?.result?.staked || "0");
  }, [fetchPChainRPC]);

  const refreshMyStakes = useCallback(async (publicKeyOverride) => {
    const publicKey = publicKeyOverride || pChainPublicKey;
    if (!publicKey) return;
    setStakesLoading(true);
    setStakesError(false);
    try {
      const pAddress = FLR_NETWORK.getPAddress(publicKey);

      // BƯỚC GÁC CỔNG — xem ghi chú ở checkTotalStaked phía trên.
      // Không bọc thêm withRetry429 ở đây nữa: checkTotalStaked -> fetchPChainRPC đã tự retry rồi,
      // bọc thêm 1 lớp nữa chỉ khiến số lần thử nhân lên không cần thiết khi RPC lỗi dài hạn (vd 503).
      let totalStakedWei = null;
      try {
        totalStakedWei = await checkTotalStaked(pAddress);
      } catch {
        totalStakedWei = null; // getStake cũng lỗi -> vẫn thử đường cũ bên dưới, không chặn luồng
      }
      if (totalStakedWei === 0n) {
        setMyStakes([]);
        setStakesLoading(false);
        return;
      }

      // ============================================================================
      // FIX #6 — Bản FIX #5 trước đó SAI: gọi platform.getCurrentValidators cho CẢ SUBNET (không
      // chỉ định nodeIDs cụ thể) khiến RPC KHÔNG trả về danh sách "delegators" chi tiết — tài liệu
      // chính thức của Avalanche/Flare ghi rõ: "If a single nodeID is provided, full delegators
      // information is also returned. Otherwise only delegators' number and total weight is
      // returned." Đó là lý do dù ví thực sự có stake, vòng lặp so khớp vẫn luôn ra 0 kết quả.
      // Sửa đúng: BẮT BUỘC gọi platform.getCurrentValidators RIÊNG cho từng nodeID (nodeIDs: [id])
      // mới có delegators đầy đủ để so khớp — nhưng để không chậm như quét tuần tự, chạy SONG SONG
      // theo từng lô nhỏ (CONCURRENCY), và dừng ngay khi đã khớp đủ tổng số FLR (so với bước gác
      // cổng ở trên) thay vì quét hết toàn bộ validator.
      // Có cache nodeID (ghi lại sau mỗi lần tìm thấy) để LẦN SAU chỉ cần tra đúng các validator đó
      // (1-2 request) thay vì quét lại từ đầu.
      // ============================================================================
      const matchValidatorEntry = (validator, out) => {
        // Trường hợp hiếm: chính bạn là validator (không phải delegator)
        const vAddrs = (validator.validationRewardOwner && validator.validationRewardOwner.addresses) || [];
        if (vAddrs.some((a) => a.replace(/^P-/, "") === pAddress)) {
          out.push({
            nodeId: validator.nodeID,
            amount: (BigInt(validator.stakeAmount || 0) * 1000000000n).toString(),
            startTime: validator.startTime,
            endTime: validator.endTime
          });
        }
        for (const d of validator.delegators || []) {
          const dAddrs = (d.delegationRewardOwner && d.delegationRewardOwner.addresses) || [];
          if (dAddrs.some((a) => a.replace(/^P-/, "") === pAddress)) {
            out.push({
              nodeId: d.nodeID || validator.nodeID,
              amount: (BigInt(d.stakeAmount || 0) * 1000000000n).toString(),
              startTime: d.startTime,
              endTime: d.endTime
            });
          }
        }
      };
      const sumWei = (list) => list.reduce((sum, s) => sum + BigInt(s.amount), 0n);

      let cachedNodeIds = [];
      try {
        cachedNodeIds = JSON.parse(localStorage.getItem(stakeNodeCacheKey(pAddress)) || "[]");
      } catch {
        cachedNodeIds = [];
      }

      const found = [];

      // ĐƯỜNG NHANH: đã có cache từ lần trước -> tra thẳng đúng các validator đó (song song, mỗi
      // validator 1 request CÓ nodeIDs cụ thể nên chắc chắn có delegators để so khớp).
      if (cachedNodeIds.length > 0) {
        const results = await Promise.all(
          cachedNodeIds.map((nodeId) =>
            fetchPChainRPC("platform.getCurrentValidators", { nodeIDs: [nodeId] }, { retries: 1, delayMs: 800 }).catch(() => null)
          )
        );
        for (const data of results) {
          for (const validator of data?.result?.validators || []) matchValidatorEntry(validator, found);
        }
      }

      // ĐƯỜNG ĐẦY ĐỦ: cache trống hoặc không còn khớp đủ số FLR (validator đổi khác) -> quét các
      // validator đang active còn lại, theo lô song song, dừng ngay khi đã khớp đủ tổng số FLR.
      if (sumWei(found) < totalStakedWei) {
        const SCAN_TIMEOUT_MS = 20000;
        const CONCURRENCY = 6;
        try {
          await Promise.race([
            (async () => {
              const listData = await fetchPChainRPC("platform.getCurrentValidators", { subnetID: PRIMARY_SUBNET_ID });
              const remainingIds = (listData?.result?.validators || [])
                .map((v) => v.nodeID)
                .filter((id) => !cachedNodeIds.includes(id));
              for (let i = 0; i < remainingIds.length && sumWei(found) < totalStakedWei; i += CONCURRENCY) {
                const batch = remainingIds.slice(i, i + CONCURRENCY);
                const results = await Promise.all(
                  batch.map((nodeId) =>
                    fetchPChainRPC("platform.getCurrentValidators", { nodeIDs: [nodeId] }, { retries: 1, delayMs: 800 }).catch(() => null)
                  )
                );
                for (const data of results) {
                  for (const validator of data?.result?.validators || []) matchValidatorEntry(validator, found);
                }
              }
            })(),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error(`quét toàn bộ validator chưa xong sau ${SCAN_TIMEOUT_MS / 1000}s`)), SCAN_TIMEOUT_MS)
            )
          ]);
        } catch (raceErr) {
          // Hết giờ quét: vẫn dùng những gì đã tìm được tới lúc đó (found đã được cập nhật dần trong
          // lúc quét), không vứt bỏ toàn bộ kết quả chỉ vì chưa quét xong 100% danh sách.
          console.warn("Quét validator chưa xong trong thời gian cho phép, dùng kết quả tìm được đến hiện tại:", raceErr);
        }
      }

      const parsed = found.map((s) => ({
        nodeId: s.nodeId,
        amount: ethers.formatEther(s.amount.toString()),
        startTime: Number(s.startTime),
        endTime: Number(s.endTime)
      }));
      setMyStakes(parsed);

      try {
        const nodeIds = [...new Set(parsed.map((s) => s.nodeId))];
        localStorage.setItem(stakeNodeCacheKey(pAddress), JSON.stringify(nodeIds));
      } catch {
        /* localStorage không khả dụng — bỏ qua cache, lần sau lại quét đầy đủ */
      }

      // Ví CÓ stake (bước gác cổng xác nhận) nhưng chưa khớp đủ (quét chưa xong, hoặc validator đã
      // rớt khỏi active set) -> hiện ô chọn thủ công để không "mất dấu" khoản stake.
      if (sumWei(found) < totalStakedWei) {
        console.warn("Chưa khớp đủ tổng số FLR đang stake với các validator hiện có (có thể quét chưa xong hoặc validator đã rớt khỏi active set).");
        setStakesError(true);
      }
    } catch (e) {
      // Đây là trạng thái đã được UI xử lý (ô chọn thủ công validator sẽ hiện ra),
      // không phải lỗi nghiêm trọng -> dùng console.warn thay vì console.error.
      console.warn("Không tự động dò được stake (sẽ chuyển sang chọn thủ công):", e);
      setStakesError(true);
    } finally {
      setStakesLoading(false);
    }
  }, [pChainPublicKey, stakeNodeCacheKey, checkTotalStaked, fetchPChainRPC]);

  // Cho phép người dùng tự xác định validator đã stake trước đây khi không thể tự động dò ra
  // (quét toàn mạng qua RPC công khai quá chậm/hay timeout) — ghi thẳng vào cache rồi tải lại theo đường nhanh.
  const handleIdentifyKnownValidator = useCallback((nodeId) => {
    if (!pChainAddress) return;
    try {
      const key = stakeNodeCacheKey(pChainAddress);
      const existing = JSON.parse(localStorage.getItem(key) || "[]");
      const merged = [...new Set([...existing, nodeId])];
      localStorage.setItem(key, JSON.stringify(merged));
    } catch {
      /* localStorage không khả dụng */
    }
    setManualNodeSearch("");
    refreshMyStakes();
  }, [pChainAddress, stakeNodeCacheKey, refreshMyStakes]);

  const initPChain = useCallback(async () => {
    try {
      setStatus(t("statusFetchingPchain"));
      const wallet = await getPChainWallet();
      const publicKey = await wallet.getPublicKey();
      setPChainPublicKey(publicKey);
      setPChainAddress(FLR_NETWORK.getPAddress(publicKey));
      const balance = await FLR_NETWORK.getBalance(publicKey);
      setPChainBalance(ethers.formatEther(balance.availableOnP.toString()));
      setStakedAmount(ethers.formatEther(balance.stakedOnP.toString()));
      await refreshClaimableStakingReward(publicKey);
      await refreshMyStakes(publicKey);
      setStatus(t("statusPchainSuccess"));
    } catch (e) {
      setStatus(t("statusPchainError", { msg: getErrMsg(e) }));
    }
  }, [getPChainWallet, t, refreshClaimableStakingReward, refreshMyStakes]);

  const refreshPChainBalance = useCallback(async () => {
    if (!pChainPublicKey) return;
    try {
      const balance = await FLR_NETWORK.getBalance(pChainPublicKey);
      setPChainBalance(ethers.formatEther(balance.availableOnP.toString()));
      setStakedAmount(ethers.formatEther(balance.stakedOnP.toString()));
    } catch (e) {
      console.error("Lỗi làm mới số dư P-Chain:", e);
    }
  }, [pChainPublicKey]);

  // Lấy danh sách validator thật từ P-Chain RPC + ghép tên provider từ file chính thức của Flare Foundation
  const fetchValidators = useCallback(async () => {
    setLoadingValidators(true);
    try {
      // FIX #4 (tiếp) — dùng fetchPChainRPC thay vì fetch() trực tiếp: có retry qua nhiều lần thử
      // và (nếu sau này thêm) tự chuyển sang endpoint dự phòng khi flare-api.flare.network lỗi 503.
      const [data, csvRes] = await Promise.all([
        fetchPChainRPC("platform.getCurrentValidators", { subnetID: PRIMARY_SUBNET_ID }),
        fetch(VALIDATOR_NAMES_URL).catch(() => null)
      ]);

      const nodeNameMap = {};
      if (csvRes?.ok) {
        const csvText = await csvRes.text();
        csvText.split("\n").forEach((line) => {
          const cols = line.split(",");
          if (cols.length >= 3 && cols[2]?.trim().startsWith("NodeID-")) {
            nodeNameMap[cols[2].trim()] = cols[0].trim();
          }
        });
      }

      const list = (data?.result?.validators || [])
        .filter((v) => v.connected)
        .map((v) => {
          // ============================================================================
          // FIX #3 — "weight" trả về từ platform.getCurrentValidators là TỔNG trọng số
          // của validator (self-bond + toàn bộ FLR đã được delegate vào), KHÔNG PHẢI riêng
          // phần self-bond. Trước đây code lấy thẳng v.weight làm selfBondFLR, khiến cap
          // (= selfBond * 15) bị tính "ảo" cao dần theo chính lượng người khác đã delegate —
          // dẫn tới freeSpace hiển thị nhiều hơn thực tế. Client cho qua bước kiểm tra
          // overCap, nhưng khi tx thật lên P-Chain thì bị validator engine từ chối với lỗi
          // "validator would be over delegated" (xem console log đã xác nhận).
          // Sửa: trừ delegatedFLR ra khỏi weight để lấy đúng self-bond thật, rồi mới tính cap.
          // ============================================================================
          const totalWeightFLR = Number(v.weight || 0) / 1e9;
          const delegatedFLR = Number(v.delegatorWeight || 0) / 1e9;
          const selfBondFLR = Math.max(totalWeightFLR - delegatedFLR, 0);
          // Hạn mức nhận delegate = tối đa 15 lần self-bond, không vượt quá 200 triệu FLR/validator
          const cap = Math.min(selfBondFLR * 15, 200_000_000);
          const freeSpace = Math.max(cap - delegatedFLR, 0);
          const endTimeUnix = Number(v.endTime || 0);
          const daysUntilEnd = endTimeUnix > 0 ? Math.floor((endTimeUnix - Date.now() / 1000) / 86400) : null;
          return {
            nodeID: v.nodeID,
            name: nodeNameMap[v.nodeID] || null,
            uptime: Number(v.uptime),
            delegationFee: Number(v.delegationFee),
            selfBondFLR,
            delegatedFLR,
            freeSpace,
            endTimeUnix,
            daysUntilEnd
          };
        })
        .sort((a, b) => (b.name ? 1 : 0) - (a.name ? 1 : 0) || b.freeSpace - a.freeSpace);
      setValidators(list);
      return list;
    } catch (e) {
      console.error("Lỗi lấy danh sách validator:", e);
      setStatus(t("statusValidatorFetchError"));
      return null;
    } finally {
      setLoadingValidators(false);
    }
  }, [t, fetchPChainRPC]);

  const refreshData = useCallback(async (addr, pda, explicitProvider = null) => {
    if (!addr || !pda) return;
    const p = explicitProvider || getProvider();
    if (!p) return;
    try {
      let activated = false;
      try {
        const pdaContract = new ethers.Contract(pda, ABI.pdaOwner, p);
        const pdaOwner = await pdaContract.owner();
        activated = pdaOwner.toLowerCase() === addr.toLowerCase();
      } catch {
        activated = false;
      }

      const wnat = new ethers.Contract(WNAT, ABI.wnat, p);
      const rewardManager = new ethers.Contract(REWARD_MANAGER, ABI.rewardManager, p);
      const usdt0Contract = new ethers.Contract(USDT0_ADDRESS, ABI.erc20Balance, p);
      const usdtContract = new ethers.Contract(USDT_ADDRESS, ABI.erc20Balance, p);

      const [f, w, pw, rewardStates, usdt0Raw, usdtRaw] = await Promise.all([
        p.getBalance(addr),
        wnat.balanceOf(addr),
        wnat.balanceOf(pda),
        rewardManager.getStateOfRewards(pda).catch(() => []),
        usdt0Contract.balanceOf(addr).catch(() => 0n),
        usdtContract.balanceOf(addr).catch(() => 0n)
      ]);
      const [addresses, bips] = await wnat.delegatesOf(pda).catch(() => [[], []]);

      let totalRewardWei = 0n;
      if (Array.isArray(rewardStates)) {
        rewardStates.forEach((epochArray) => {
          if (Array.isArray(epochArray)) epochArray.forEach((state) => { totalRewardWei += BigInt(state[2]); });
        });
      }

      setIsActivated(activated);
      setBalances({ flr: ethers.formatEther(f), wflr: ethers.formatEther(w), pdaWflr: ethers.formatEther(pw), reward: ethers.formatEther(totalRewardWei) });
      setUsdt0Balance(ethers.formatUnits(usdt0Raw, 6));
      setUsdtBalance(ethers.formatUnits(usdtRaw, 6));

      const currentDels = [];
      if (addresses?.length) {
        addresses.forEach((delegateAddr, i) => {
          if (delegateAddr !== ethers.ZeroAddress && bips[i] > 0n) {
            const pInfo = PROVIDERS.find((prov) => prov.address.toLowerCase() === delegateAddr.toLowerCase());
            currentDels.push({ name: pInfo ? pInfo.name : `${delegateAddr.slice(0, 6)}...`, addr: delegateAddr, pct: Number(bips[i]) / 100 });
          }
        });
      }
      setDelegations(currentDels);
    } catch (e) {
      console.error("Lỗi làm mới dữ liệu ví:", e);
    }
  }, [getProvider]);

  const disconnect = useCallback(async () => {
    if (walletType === "walletconnect") {
      try { await modal.disconnect(); } catch (e) { console.error("Lỗi ngắt kết nối WalletConnect:", e); }
    }
    setAccount("");
    setPdaAddress("");
    setWalletType("");
    setCustomEthersProvider(null);
    setIsActivated(false);
    setBalances({ flr: "0", wflr: "0", pdaWflr: "0", reward: "0" });
    setUsdt0Balance("0");
    setUsdtBalance("0");
    setDelegations([]);
    setStatus(t("statusDisconnected"));
    setPChainPublicKey("");
    setPChainAddress("");
    setPChainBalance("0");
    setStakedAmount("0");
    setStakeProviders([]);
    setStakeAmount("");
    setClaimableStakingReward("0");
    setMainWalletFtsoReward("0");
    setMyStakes([]);
  }, [walletType, t]);

  // ---- Effects ----

  useEffect(() => {
    setStatus(t("statusReady"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    rewardRef.current = balances.reward;
  }, [balances.reward]);

  useEffect(() => {
    document.body.style.backgroundColor = "#080808";
    document.body.style.margin = "0";

    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setShowDropdown(false);
      if (stakeDropdownRef.current && !stakeDropdownRef.current.contains(e.target)) setShowStakeDropdown(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.body.style.backgroundColor = "";
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Kiểm tra MetaMask đã ở mạng Flare Mainnet chưa, kể cả khi chưa kết nối ví
  useEffect(() => {
    if (!window.ethereum) return;
    let isMounted = true;
    const checkFlrNetwork = async () => {
      try {
        const chainId = await window.ethereum.request({ method: "eth_chainId" });
        if (isMounted) setIsFlrNetworkAdded(chainId === FLARE_CHAIN_ID_HEX);
      } catch {
        if (isMounted) setIsFlrNetworkAdded(false);
      }
    };
    checkFlrNetwork();
    window.ethereum.on("chainChanged", checkFlrNetwork);
    return () => {
      isMounted = false;
      window.ethereum.removeListener("chainChanged", checkFlrNetwork);
    };
  }, []);

  useEffect(() => {
    if (walletType !== "metamask" || !window.ethereum) return;
    const handleAccountsChanged = async (newAccs) => {
      if (newAccs.length === 0) {
        disconnect();
        return;
      }
      const addr = newAccs[0];
      setAccount(addr);
      const p = new ethers.BrowserProvider(window.ethereum);
      const csm = new ethers.Contract(CLAIM_SETUP_MANAGER, ABI.csm, p);
      const pda = await csm.accountToDelegationAccount(addr);
      setPdaAddress(pda);
      refreshData(addr, pda, p);
    };
    const handleChainChanged = () => window.location.reload();
    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);
    return () => {
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum.removeListener("chainChanged", handleChainChanged);
    };
  }, [walletType, refreshData, disconnect]);

  // Đồng bộ đồng hồ đếm ngược chu kỳ reward theo block time của chain (tránh lệch giờ máy người dùng)
  useEffect(() => {
    let blockTimeOffset = 0;
    let isMounted = true;
    let timerInterval;
    let syncInterval;

    const updateTimerUI = () => {
      const currentNetworkSeconds = Math.floor((Date.now() + blockTimeOffset) / 1000);
      const currentReward = Number(rewardRef.current) || 0;
      if (currentReward > 0) {
        setTimeLeft(0);
        return;
      }
      const elapsedSinceAnchor = Math.max(currentNetworkSeconds - FLARE_EPOCH_ANCHOR, 0);
      const elapsedInCycle = elapsedSinceAnchor % CYCLE_SECONDS;
      setTimeLeft(CYCLE_SECONDS - elapsedInCycle);
    };

    const syncBlockTime = async () => {
      try {
        const p = getProvider();
        if (!p) return;
        const startFetchTime = Date.now();
        const block = await p.getBlock("latest");
        const endFetchTime = Date.now();
        if (block && isMounted) {
          const networkLatency = Math.floor((endFetchTime - startFetchTime) / 2);
          const localTimeAtBlock = endFetchTime - networkLatency;
          blockTimeOffset = Number(block.timestamp) * 1000 - localTimeAtBlock;
          updateTimerUI();
        }
      } catch (e) {
        console.error("Lỗi đồng bộ thời gian blockchain:", e);
      }
    };

    syncBlockTime();
    timerInterval = setInterval(updateTimerUI, 1000);
    syncInterval = setInterval(syncBlockTime, 3 * 60 * 1000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") syncBlockTime();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isMounted = false;
      clearInterval(timerInterval);
      clearInterval(syncInterval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [getProvider]);

  useEffect(() => {
    if (!status.includes("⏳")) return;
    setQuoteIndex(Math.floor(Math.random() * 5));
    const interval = setInterval(() => setQuoteIndex((prev) => (prev + 1) % 5), 5000);
    return () => clearInterval(interval);
  }, [status]);

  useEffect(() => {
    if (account && walletType) {
      initPChain();
      fetchValidators();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, walletType]);

  // Reward staking phát sinh liên tục trên chain — kiểm tra lại định kỳ để nút Claim tự hiện ra.
  // KHÔNG gộp refreshMyStakes vào đây: dù giờ đã dùng 1 bulk request thay vì SDK getStakesOnP chậm
  // (xem FIX #5), lặp mỗi 60s vẫn không cần thiết và dễ đụng rate-limit của RPC công khai hơn mức cần.
  // Chỉ gọi refreshMyStakes lúc kết nối ví (initPChain) và sau khi stake/rút — người dùng bấm nút
  // làm mới thủ công nếu cần xem lại.
  useEffect(() => {
    if (!account || !walletType) return;
    refreshClaimableStakingReward();
    const interval = setInterval(refreshClaimableStakingReward, 60_000);
    return () => clearInterval(interval);
  }, [account, walletType, refreshClaimableStakingReward]);

  // ---- Network / connection actions ----

  const ensureFlareNetwork = async () => {
    if (walletType === "walletconnect") return true;
    if (!window.ethereum) return false;
    try {
      const chainId = await window.ethereum.request({ method: "eth_chainId" });
      if (chainId !== FLARE_CHAIN_ID_HEX) {
        setShowNetworkModal(true);
        return false;
      }
      return true;
    } catch {
      return false;
    }
  };

  const handleSwitchNetwork = async () => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: FLARE_CHAIN_ID_HEX }] });
      setShowNetworkModal(false);
    } catch (err) {
      if (err.code === 4902) {
        try {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [{ chainId: FLARE_CHAIN_ID_HEX, chainName: FLARE_PARAMS.chainName, nativeCurrency: FLARE_PARAMS.nativeCurrency, rpcUrls: FLARE_PARAMS.rpcUrls, blockExplorerUrls: FLARE_PARAMS.blockExplorerUrls }]
          });
          setShowNetworkModal(false);
        } catch (e) {
          console.error("Lỗi thêm mạng Flare:", e);
        }
      }
    }
  };

  const handleAddFlareNetwork = async () => {
    if (!window.ethereum) return alert("Please install MetaMask first!");
    try {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{ chainId: FLARE_CHAIN_ID_HEX, chainName: FLARE_PARAMS.chainName, nativeCurrency: FLARE_PARAMS.nativeCurrency, rpcUrls: FLARE_PARAMS.rpcUrls, blockExplorerUrls: FLARE_PARAMS.blockExplorerUrls }]
      });
      setIsFlrNetworkAdded(true);
      setStatus(t("statusNetworkAdded"));
    } catch (e) {
      setStatus(e?.code === 4001 ? t("statusUserRejectedNetwork") : t("statusAddNetworkFailed"));
    }
  };

  const execute = async (labelKey, action) => {
    const isOk = await ensureFlareNetwork();
    if (!isOk) return;
    const label = t(labelKey);
    try {
      setStatus(t("statusActionProgress", { label }));
      const tx = await action();
      if (tx) {
        await tx.wait();
        setStatus(t("statusActionSuccess", { label }));
        setWalletAmount("");
        setPdaAmount("");
        setPendingProvider(null);
        setProviderSearch("");
        setTimeout(() => refreshData(account, pdaAddress), 1500);
      }
    } catch (e) {
      if (e?.code === "ACTION_REJECTED" || e?.code === 4001) setStatus(t("statusUserRejected"));
      else setStatus(t("statusGenericError", { msg: getErrMsg(e) }));
    }
  };

  const connectMetaMask = async () => {
    if (!window.ethereum) return alert("Please install MetaMask!");
    setWalletType("metamask");
    setShowConnectModal(false);
    try {
      const chainId = await window.ethereum.request({ method: "eth_chainId" });
      if (chainId !== FLARE_CHAIN_ID_HEX) return setShowNetworkModal(true);
      const accs = await window.ethereum.request({ method: "eth_requestAccounts" });
      const addr = accs[0];
      setAccount(addr);
      const p = new ethers.BrowserProvider(window.ethereum);
      const csm = new ethers.Contract(CLAIM_SETUP_MANAGER, ABI.csm, p);
      const pda = await csm.accountToDelegationAccount(addr);
      setPdaAddress(pda);
      setStatus(t("statusMetamaskConnected"));
      setTimeout(() => refreshData(addr, pda, p), 200);
    } catch {
      setStatus(t("statusConnectFailed"));
    }
  };

  const connectEllipal = async () => {
    try {
      setStatus(t("statusConnectingWeb3Modal"));
      setShowConnectModal(false);
      await modal.open({ view: "Connect" });

      const checkConnection = setInterval(async () => {
        if (!modal.getIsConnected()) return;
        clearInterval(checkConnection);
        const p = new ethers.BrowserProvider(modal.getWalletProvider());
        const signer = await p.getSigner();
        const addr = await signer.getAddress();
        setWalletType("walletconnect");
        setCustomEthersProvider(p);
        setAccount(addr);

        const csm = new ethers.Contract(CLAIM_SETUP_MANAGER, ABI.csm, p);
        const pda = await csm.accountToDelegationAccount(addr);
        setPdaAddress(pda);
        setStatus(t("statusEllipalConnected"));
        setTimeout(() => refreshData(addr, pda, p), 200);
      }, 1000);
    } catch {
      setStatus(t("statusEllipalFailed"));
    }
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenExplorer = (addr) => addr && window.open(`${FLARE_PARAMS.blockExplorerUrls[0]}address/${addr}`, "_blank", "noopener,noreferrer");

  // ---- Main wallet / PDA actions ----

  const handleEnablePDA = () => execute("actionActivatePda", async () => {
    const s = await getProvider().getSigner();
    return new ethers.Contract(CLAIM_SETUP_MANAGER, ABI.csm, s).enableDelegationAccount();
  });

  const handleWithdrawPDA = () => {
    const amt = Number(pdaAmount || 0);
    if (amt <= 0) return setStatus(t("statusInvalidBeforeWithdrawPda"));
    if (amt > Number(balances.pdaWflr)) return setStatus(t("statusInsufficientPda"));
    return execute("actionWithdrawPda", async () => {
      const s = await getProvider().getSigner();
      const val = ethers.parseEther(pdaAmount);
      const csm = new ethers.Contract(CLAIM_SETUP_MANAGER, ABI.csm, s);
      const withdrawTx = await csm.withdraw(val);
      await withdrawTx.wait();
      const w = new ethers.Contract(WNAT, ABI.wnat, s);
      return w.withdraw(val);
    });
  };

  const handleClaim = () => execute("actionClaim", async () => {
    const s = await getProvider().getSigner();
    const r = new ethers.Contract(REWARD_MANAGER, ABI.rewardManager, s);
    const [, end] = await r.getRewardEpochIdsWithClaimableRewards();
    return r.claim(pdaAddress, pdaAddress, end, false, []);
  });

  // Reward FTSO thuộc về Main Wallet (không phải PDA) — cả rewardOwner lẫn recipient phải là "account"
  const handleClaimMainWalletFtsoReward = () => execute("actionClaimMainReward", async () => {
    const s = await getProvider().getSigner();
    const r = new ethers.Contract(REWARD_MANAGER, ABI.rewardManager, s);
    const [, end] = await r.getRewardEpochIdsWithClaimableRewards();
    const tx = await r.claim(account, account, end, false, []);
    setTimeout(() => refreshClaimableStakingReward(), 1500);
    return tx;
  });

  const handleWrap = (isWrap) => {
    const amt = Number(walletAmount || 0);
    if (amt <= 0) return setStatus(t("statusInvalidBeforeWrap"));
    const maxAvail = isWrap ? Number(balances.flr) : Number(balances.wflr);
    if (amt > maxAvail) return setStatus(t("statusInsufficientBalance", { token: isWrap ? "FLR" : "WFLR" }));
    return execute(isWrap ? "actionWrap" : "actionUnwrap", async () => {
      const s = await getProvider().getSigner();
      const w = new ethers.Contract(WNAT, ABI.wnat, s);
      const val = ethers.parseEther(walletAmount);
      return isWrap ? w.deposit({ value: val }) : w.withdraw(val);
    });
  };

  const handleToPDA = () => {
    const amt = Number(walletAmount || 0);
    if (amt <= 0) return setStatus(t("statusInvalidBeforeToPda"));
    if (amt > Number(balances.flr)) return setStatus(t("statusInsufficientMain"));
    return execute("actionToPda", async () => {
      const s = await getProvider().getSigner();
      const val = ethers.parseEther(walletAmount);
      const w = new ethers.Contract(WNAT, ABI.wnat, s);
      const wrapTx = await w.deposit({ value: val });
      await wrapTx.wait();
      return w.transfer(pdaAddress, val);
    });
  };

  const handleDelegate = (target, pct = 50) => execute(pct === 0 ? "actionUndelegate" : "actionDelegate", async () => {
    const s = await getProvider().getSigner();
    return new ethers.Contract(CLAIM_SETUP_MANAGER, ABI.csm, s).delegate(target, pct * 100);
  });

  const handleUndelegateAll = () => execute("actionUndelegateAll", async () => {
    const s = await getProvider().getSigner();
    return new ethers.Contract(CLAIM_SETUP_MANAGER, ABI.csm, s).undelegateAll();
  });

  // ---- P-Chain actions ----

  const handleDepositToPChain = async () => {
    const val = Math.floor(Number(walletAmount || 0));
    if (val <= 0) return setStatus(t("statusInvalidFlrAmount"));
    if (val > Number(balances.flr)) return setStatus(t("statusInsufficientMain"));
    try {
      setStatus(t("statusDepositingPchain"));
      const wallet = await getPChainWallet();
      await FLR_NETWORK.transferToP(wallet, Amount.nats(val));
      setWalletAmount("");
      setStatus(t("statusDepositPchainSuccess"));
      setTimeout(() => {
        refreshPChainBalance();
        refreshData(account, pdaAddress); // Main Wallet cũng thay đổi, cần làm mới cùng lúc
      }, 1500);
    } catch (e) {
      if (e?.code === "ACTION_REJECTED" || e?.code === 4001) setStatus(t("statusUserRejectedTx"));
      else setStatus(t("statusDepositPchainError", { msg: getErrMsg(e) }));
    }
  };

  const handleSelectStakeProvider = (validator) => {
    if (stakeProviders.length >= 2) return;
    if (stakeProviders.find((v) => v.nodeID === validator.nodeID)) return;
    setStakeProviders((prev) => [...prev, validator]);
    setStakeProviderSearch("");
    setShowStakeDropdown(false);
  };

  const handleRemoveStakeProvider = (nodeID) => {
    setStakeProviders((prev) => prev.filter((v) => v.nodeID !== nodeID));
  };

  // P-Chain staking chỉ nhận 1 NodeID/giao dịch: khi chọn 2 validator, số FLR chia đều thành 2 giao dịch riêng,
  // mỗi giao dịch vẫn phải đạt tối thiểu MIN_STAKE_FLR.
  const handleStakeFLR = async () => {
    if (stakeProviders.length === 0) return setStatus(t("statusSelectAtLeastOneValidator"));
    const totalVal = Number(stakeAmount || 0);
    const days = Number(stakeDays || 0);
    if (totalVal <= 0) return setStatus(t("statusInvalidStakeAmount"));
    if (days < MIN_STAKE_DAYS) return setStatus(t("statusMinStakeDays", { days: MIN_STAKE_DAYS }));
    if (totalVal > Number(pChainBalance)) return setStatus(t("statusInsufficientPchain"));

    // Hạn mức validator có thể đã thay đổi kể từ lúc mở danh sách — lấy lại số liệu mới nhất trước khi ký
    setStatus(t("statusRecheckingValidators"));
    const freshList = await fetchValidators();
    const freshStakeProviders = stakeProviders.map((v) => freshList?.find((f) => f.nodeID === v.nodeID) || v);

    // Làm tròn số nguyên FLR: số thập phân dài (ví dụ khi bấm MAX) gây lỗi quy đổi đơn vị trong SDK
    const perValidator = Math.floor(totalVal / freshStakeProviders.length);
    if (perValidator < MIN_STAKE_FLR) {
      return setStatus(t("statusMinPerValidator", { min: MIN_STAKE_FLR.toLocaleString(), per: perValidator.toLocaleString() }));
    }

    // Chừa biên an toàn thay vì so sánh sát nút: freeSpace vẫn có thể lệch nhẹ so với thời điểm
    // thực thi thật trên chain (người khác delegate chen vào giữa lúc fetch và lúc tx confirm),
    // nên chỉ cho phép dùng tối đa 98% freeSpace hiện có.
    const CAP_SAFETY_MARGIN = 0.98;
    const overCap = freshStakeProviders.find((v) => v.freeSpace != null && perValidator > v.freeSpace * CAP_SAFETY_MARGIN);
    if (overCap) {
      return setStatus(t("statusOverCap", { name: overCap.name || "Validator", cap: Math.floor(overCap.freeSpace * CAP_SAFETY_MARGIN).toLocaleString() }));
    }

    // Thời hạn stake không được vượt quá thời hạn hoạt động còn lại (self-bond) của validator
    const buffer = 6 * 60;
    const tooShortValidator = freshStakeProviders.find((v) => v.daysUntilEnd != null && v.daysUntilEnd * 86400 - buffer < days * 86400);
    if (tooShortValidator) {
      return setStatus(t("statusValidatorTooShort", { name: tooShortValidator.name || "Validator", vdays: tooShortValidator.daysUntilEnd, days }));
    }

    try {
      setStatus(t("statusSendingStake"));
      const wallet = await getPChainWallet();

      for (const validator of freshStakeProviders) {
        // Tính startTime ngay trước mỗi lần gọi (không phải 1 lần trước vòng lặp), vì mỗi lần ký có thể mất
        // vài chục giây; buffer 5 phút để tránh startTime trôi qua trước khi giao dịch lên mạng.
        const startTime = Math.floor(Date.now() / 1000) + 5 * 60;
        const endTime = startTime + days * 24 * 60 * 60;
        await FLR_NETWORK.delegateOnP(wallet, Amount.nats(perValidator), validator.nodeID, startTime, endTime);
      }

      setStakeAmount("");
      setStatus(t("statusStakeSuccess"));
      // Ghi ngay nodeID vừa stake vào cache, để lần refresh tới không phải quét lại toàn mạng mới nhận ra
      if (pChainAddress) {
        try {
          const key = stakeNodeCacheKey(pChainAddress);
          const existing = JSON.parse(localStorage.getItem(key) || "[]");
          const merged = [...new Set([...existing, ...freshStakeProviders.map((v) => v.nodeID)])];
          localStorage.setItem(key, JSON.stringify(merged));
        } catch {
          /* bỏ qua nếu localStorage không khả dụng */
        }
      }
      setTimeout(() => { refreshPChainBalance(); refreshClaimableStakingReward(); refreshMyStakes(); }, 1500);
    } catch (e) {
      console.error("Lỗi staking:", e);
      if (e?.code === "ACTION_REJECTED" || e?.code === 4001) setStatus(t("statusUserRejectedTx"));
      else if (String(e?.message).toLowerCase().includes("over delegated")) setStatus(t("statusOverDelegated"));
      else setStatus(t("statusStakeError", { msg: getErrMsg(e) }));
    }
  };

  // Reward staking (pool riêng của SDK) được cộng thẳng vào Main Wallet (C-Chain), không cộng vào số dư P-Chain
  const handleClaimStaking = async () => {
    if (Number(claimableStakingReward) <= 0) return setStatus(t("statusNoClaimableReward"));
    try {
      setStatus(t("statusClaimingStaking"));
      const wallet = await getPChainWallet();
      await FLR_NETWORK.claimStakingReward(wallet);
      setStatus(t("statusClaimStakingSuccess"));
      setTimeout(() => { refreshClaimableStakingReward(); refreshData(account, pdaAddress); }, 1500);
    } catch (e) {
      if (e?.code === "ACTION_REJECTED" || e?.code === 4001) setStatus(t("statusUserRejectedTx"));
      else setStatus(t("statusClaimError", { msg: getErrMsg(e) }));
    }
  };

  // FLR đang "Đang staking" không rút được cho tới khi hết thời hạn; khi hết hạn nó tự chuyển về pChainBalance
  const handleWithdrawToMain = async () => {
    if (Number(pChainBalance) <= 0) return setStatus(t("statusNoPchainToWithdraw"));
    try {
      setStatus(t("statusWithdrawingToMain"));
      const wallet = await getPChainWallet();
      await FLR_NETWORK.transferToC(wallet);
      setStatus(t("statusWithdrawToMainSuccess"));
      setTimeout(() => { refreshPChainBalance(); refreshClaimableStakingReward(); refreshMyStakes(); refreshData(account, pdaAddress); }, 1500);
    } catch (e) {
      if (e?.code === "ACTION_REJECTED" || e?.code === 4001) setStatus(t("statusUserRejectedTx"));
      else setStatus(t("statusWithdrawToMainError", { msg: getErrMsg(e) }));
    }
  };

  // ---- Derived values ----

  const filteredProviders = useMemo(
    () => PROVIDERS.filter((p) => p.name.toLowerCase().includes(providerSearch.toLowerCase())),
    [providerSearch]
  );
  const filteredStakeProviders = useMemo(
    () => validators.filter((v) => v.nodeID.toLowerCase().includes(stakeProviderSearch.toLowerCase()) || v.name?.toLowerCase().includes(stakeProviderSearch.toLowerCase())),
    [validators, stakeProviderSearch]
  );
  // Tra tên validator từ danh sách validators (đã fetch) theo nodeId của một khoản đang stake
  const getValidatorName = useCallback(
    (nodeId) => validators.find((v) => v.nodeID === nodeId)?.name || null,
    [validators]
  );

  const walletAmountValid = Number(walletAmount) > 0;
  const pdaAmountValid = Number(pdaAmount) > 0;
  const requiredStakeMin = MIN_STAKE_FLR * Math.max(stakeProviders.length, 1);
  const stakeAmountValid = Number(stakeAmount) >= requiredStakeMin;

  // Tổng FLR: Main Wallet (FLR+WFLR) + PDA (WFLR) + P-Chain (đang stake + chưa stake) + mọi reward đang chờ claim
  const totalFlrHoldings =
    Number(balances.flr) + Number(balances.wflr) + Number(balances.pdaWflr) +
    Number(stakedAmount) + Number(pChainBalance) +
    Number(claimableStakingReward) + Number(mainWalletFtsoReward);

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div style={styles.container}>
      <style>{`
        @keyframes marquee { 0% { transform: translate(0, 0); } 100% { transform: translate(-100%, 0); } }
        @keyframes bounce { from { transform: translateY(0); } to { transform: translateY(-25px); } }
        @keyframes pulseGlow { 0% { opacity: 0.6; } 50% { opacity: 1; } 100% { opacity: 0.6; } }
        @keyframes rewardClaimPulse {
          0%   { box-shadow: 0 0 0px ${COLORS.PRICE_GREEN}00; transform: scale(1); }
          50%  { box-shadow: 0 0 18px ${COLORS.PRICE_GREEN}cc; transform: scale(1.04); }
          100% { box-shadow: 0 0 0px ${COLORS.PRICE_GREEN}00; transform: scale(1); }
        }
      `}</style>

      <div style={{ display: "flex", justifyContent: "center", marginTop: "4px", marginBottom: "2px" }}>
        <img src={quocHuyImg} alt="Quốc huy" style={{ width: "96px", height: "auto", filter: `drop-shadow(0 0 12px ${COLORS.PINK}55)` }} />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: "5px" }}>
        <button
          style={styles.helpBtn}
          onClick={toggleLang}
          title={lang === "vi" ? "Switch to English" : "Chuyển sang Tiếng Việt"}
          onMouseOver={(e) => { e.currentTarget.style.boxShadow = `0 0 10px ${COLORS.PINK}`; e.currentTarget.style.background = "#222"; }}
          onMouseOut={(e) => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.background = "#161616"; }}
        >
          {lang === "vi" ? "🇻🇳 VI" : "🇬🇧 EN"}
        </button>
        <button
          style={styles.helpBtn}
          onClick={() => setShowHelp(true)}
          onMouseOver={(e) => { e.currentTarget.style.boxShadow = `0 0 10px ${COLORS.PINK}`; e.currentTarget.style.background = "#222"; }}
          onMouseOut={(e) => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.background = "#161616"; }}
        >
          {t("help")}
        </button>
      </div>

      {showHelp && (
        <div
          style={{ ...styles.helpModal, alignItems: "flex-start", overflowY: "auto", paddingTop: "16px", paddingBottom: "16px" }}
          onClick={() => setShowHelp(false)}
        >
          <div
            style={{ ...styles.helpContent, maxHeight: "none", overflowY: "visible", width: "min(92vw, 480px)", maxWidth: "92vw", margin: "0 auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "14px" }}>
              <img src={quocHuyImg} alt="Quốc huy" style={{ width: "84px", height: "auto", filter: `drop-shadow(0 0 10px ${COLORS.PINK}55)` }} />
            </div>
            <h3 style={{ margin: "0 0 10px 0", textAlign: "center", color: "#fff", fontSize: "15px" }}>{t("helpModalTitle")}</h3>
            <p style={{ fontSize: "11px", textAlign: "center", color: COLORS.AMBER, marginBottom: "15px", fontStyle: "italic" }}>{t("helpModalSubtitle")}</p>

            <div style={styles.stepTitle}>{t("delegationStep1Title")}</div><div style={styles.stepText}>{t("delegationStep1Text")}</div>
            <div style={styles.stepTitle}>{t("delegationStep2Title")}</div><div style={styles.stepText}>{t("delegationStep2Text")}</div>
            <div style={styles.stepTitle}>{t("delegationStep3Title")}</div><div style={styles.stepText}>{t("delegationStep3Text")}</div>
            <div style={styles.stepTitle}>{t("delegationStep4Title")}</div><div style={styles.stepText}>{t("delegationStep4Text")}</div>
            <div style={styles.stepTitle}>{t("delegationStep5Title")}</div><div style={styles.stepText}>{t("delegationStep5Text")}</div>
            <div style={styles.stepTitle}>{t("wrapUnwrapTitle")}</div><div style={styles.stepText}>{t("wrapUnwrapText")}</div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "18px 0 12px" }}>
              <div style={{ flex: 1, height: 1, background: "#222" }} />
              <span style={{ fontSize: 10, color: STAKE_COLOR, letterSpacing: "1px", fontWeight: "bold" }}>{t("stakingSectionDivider")}</span>
              <div style={{ flex: 1, height: 1, background: "#222" }} />
            </div>

            <div style={{ ...styles.stepTitle, color: STAKE_COLOR }}>{t("stakingStep1Title")}</div>
            <div style={styles.stepText}>{t("stakingStep1Text")}</div>
            <div style={{ ...styles.stepTitle, color: STAKE_COLOR }}>{t("stakingStep2Title")}</div>
            <div style={styles.stepText}>{t("stakingStep2Text")}</div>
            <div style={{ ...styles.stepTitle, color: STAKE_COLOR }}>{t("stakingStep3Title")}</div>
            <div style={styles.stepText}>{t("stakingStep3Text", { min: MIN_STAKE_FLR.toLocaleString() })}</div>
            <div style={{ ...styles.stepTitle, color: STAKE_COLOR }}>{t("stakingStep4Title")}</div>
            <div style={styles.stepText}>{t("stakingStep4Text", { days: MIN_STAKE_DAYS })}</div>
            <div style={{ ...styles.stepTitle, color: STAKE_COLOR }}>{t("stakingStep5Title")}</div>
            <div style={styles.stepText}>{t("stakingStep5Text")}</div>

            <GlowButton onClick={() => setShowHelp(false)} baseColor={COLORS.PINK} customStyle={{ width: "100%", padding: "12px", marginTop: "20px" }}>
              {t("gotIt")}
            </GlowButton>
          </div>
        </div>
      )}

      {showNetworkModal && (
        <div style={styles.networkModal}>
          <div style={{ background: COLORS.SURFACE, border: `1px solid ${COLORS.PINK}`, padding: "30px", borderRadius: "24px", maxWidth: "300px" }}>
            <div style={{ fontSize: "40px", marginBottom: "15px" }}>🌐</div>
            <h3 style={{ margin: "0 0 10px 0" }}>{t("wrongNetworkTitle")}</h3>
            <p style={{ fontSize: "13px", color: COLORS.TEXT_MUTE, marginBottom: "20px" }}>
              {lang === "vi" ? <>Ứng dụng yêu cầu mạng <b>Flare Mainnet</b> để hoạt động.</> : <>This app requires the <b>Flare Mainnet</b> network to function.</>}
            </p>
            <GlowButton onClick={handleSwitchNetwork} baseColor={COLORS.PINK} customStyle={{ width: "100%", padding: "15px" }}>{t("switchToFlare")}</GlowButton>
          </div>
        </div>
      )}

      {showConnectModal && (
        <div style={styles.networkModal} onClick={() => setShowConnectModal(false)}>
          <div style={{ background: COLORS.SURFACE, border: `1px solid ${COLORS.BORDER}`, padding: "25px", borderRadius: "24px", width: "320px" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 20px 0", fontSize: "14px", letterSpacing: "1px", color: "#fff" }}>{t("chooseConnectMethod")}</h3>
            <button
              onClick={connectMetaMask}
              style={{ ...styles.btnBase, background: "#161616", color: "white", width: "100%", padding: "14px", marginBottom: "12px", display: "flex", alignItems: "center", justifyContent: "space-between", border: "1px solid #222" }}
              onMouseOver={(e) => { e.currentTarget.style.borderColor = COLORS.PINK; e.currentTarget.style.boxShadow = `0 0 10px ${COLORS.PINK}44`; }}
              onMouseOut={(e) => { e.currentTarget.style.borderColor = "#222"; e.currentTarget.style.boxShadow = "none"; }}
            >
              <span>{t("metamaskOption")}</span><span style={{ fontSize: "10px", color: COLORS.TEXT_MUTE }}>{t("browserLabel")}</span>
            </button>
            <button
              onClick={connectEllipal}
              style={{ ...styles.btnBase, background: "#161616", color: "white", width: "100%", padding: "14px", marginBottom: "20px", display: "flex", alignItems: "center", justifyContent: "space-between", border: "1px solid #222" }}
              onMouseOver={(e) => { e.currentTarget.style.borderColor = COLORS.AMBER; e.currentTarget.style.boxShadow = `0 0 10px ${COLORS.AMBER}44`; }}
              onMouseOut={(e) => { e.currentTarget.style.borderColor = "#222"; e.currentTarget.style.boxShadow = "none"; }}
            >
              <span>{t("ellipalOption")}</span><span style={{ fontSize: "10px", color: COLORS.TEXT_MUTE }}>{t("qrCodeLabel")}</span>
            </button>
            <div onClick={() => setShowConnectModal(false)} style={{ fontSize: "12px", color: COLORS.TEXT_MUTE, cursor: "pointer", textDecoration: "underline" }}>{t("close")}</div>
          </div>
        </div>
      )}

      {showQR && (
        <div style={styles.qrOverlay} onClick={() => setShowQR(false)}>
          <div style={styles.qrContainer} onClick={(e) => e.stopPropagation()}><QRCodeSVG value={account} size={220} /></div>
          <div style={styles.copyBadge} onClick={(e) => { e.stopPropagation(); handleCopy(account); }}>
            <span style={{ color: copied ? COLORS.PRICE_GREEN : COLORS.PINK, fontFamily: "monospace", fontSize: "13px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{account}</span>
            <span style={{ fontSize: "14px" }}>{copied ? "✅" : "📋"}</span>
          </div>
          <div style={{ fontSize: "10px", color: COLORS.TEXT_MUTE, marginTop: "8px", marginBottom: "25px" }}>{copied ? t("addressCopied") : t("clickToCopy")}</div>
          <GlowButton onClick={() => setShowQR(false)} baseColor={COLORS.PINK} customStyle={{ padding: "12px 40px", borderRadius: "20px" }}>{t("closeCaps")}</GlowButton>
        </div>
      )}

      <header style={{ textAlign: "center", marginBottom: "10px", marginTop: "5px" }}>
        <h2 style={{ color: COLORS.PINK, letterSpacing: "3px", margin: 0 }}>
          {t("appTitle")} <span style={{ fontWeight: 300, color: "#fff" }}>{t("appSubtitle")} </span>
        </h2>

        <div style={{ fontSize: "18px", color: "#00BFFF", fontWeight: "bold", marginTop: "4px", fontFamily: "monospace", letterSpacing: "1px" }}>
          {formatCurrentTime(currentTime)}
        </div>

        {account && (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "8px", marginTop: "14px", flexWrap: "wrap" }}>
            <div onClick={() => setShowQR(true)} style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "#161616", padding: "6px 14px", borderRadius: "20px", border: `1px solid ${COLORS.BORDER}`, cursor: "pointer" }}>
              <span style={{ fontSize: "12px", color: COLORS.PINK, fontWeight: "bold" }}>{account.slice(0, 6)}...{account.slice(-4)}</span><span>📲</span>
            </div>
            <button onClick={() => handleOpenExplorer(account)} style={styles.scanBtn} onMouseOver={(e) => { e.currentTarget.style.color = COLORS.PRICE_GREEN; e.currentTarget.style.borderColor = COLORS.PRICE_GREEN; e.currentTarget.style.boxShadow = `0 0 10px ${COLORS.PRICE_GREEN}55`; }} onMouseOut={(e) => { e.currentTarget.style.color = COLORS.TEXT_MUTE; e.currentTarget.style.borderColor = COLORS.BORDER; e.currentTarget.style.boxShadow = "none"; }}>{t("scan")}</button>
            <button onClick={disconnect} style={styles.logoutBtn} onMouseOver={(e) => { e.currentTarget.style.color = COLORS.PINK; e.currentTarget.style.borderColor = COLORS.PINK; e.currentTarget.style.boxShadow = `0 0 10px ${COLORS.PINK}55`; }} onMouseOut={(e) => { e.currentTarget.style.color = COLORS.TEXT_MUTE; e.currentTarget.style.borderColor = COLORS.BORDER; e.currentTarget.style.boxShadow = "none"; }}>{t("logout")}</button>
          </div>
        )}
      </header>

      <div style={styles.tickerWrap}>
        <div style={styles.ticker}>
          <span style={{ ...styles.assetName, color: "#F7931A" }}>BTC</span><span style={styles.assetPrice}>${prices.btc.toLocaleString()}</span>
          <span style={{ ...styles.assetName, color: "#627EEA" }}>ETH</span><span style={styles.assetPrice}>${prices.eth.toLocaleString()}</span>
          <span style={{ ...styles.assetName, color: "#23292F", background: "#fff", padding: "2px 4px", borderRadius: "3px" }}>XRP</span><span style={styles.assetPrice}>${prices.xrp}</span>
          <span style={{ ...styles.assetName, color: COLORS.PINK }}>FLR</span><span style={styles.assetPrice}>${prices.flr}</span>
          <span style={{ ...styles.assetName, color: "#00ADEF" }}>SGB</span><span style={styles.assetPrice}>${prices.sgb}</span>
          <span style={{ ...styles.assetName, color: "#345D9D" }}>LTC</span><span style={styles.assetPrice}>${prices.ltc}</span>
          <span style={{ ...styles.assetName, color: "#C2A633" }}>DOGE</span><span style={styles.assetPrice}>${prices.doge}</span>
          <span style={{ ...styles.assetName, color: "#17181B", background: SOLID_GOLD, padding: "2px 4px", borderRadius: "3px" }}>CMC20</span><span style={styles.assetPrice}>${prices.cmc20}</span>
        </div>
      </div>

      {!account ? (
        <>
          <GlowButton onClick={() => setShowConnectModal(true)} baseColor={COLORS.PINK} customStyle={{ width: "100%", padding: "18px" }}>{t("connectWallet")}</GlowButton>
          {typeof window !== "undefined" && window.ethereum && !isFlrNetworkAdded && (
            <GlowButton onClick={handleAddFlareNetwork} baseColor={SOLID_GOLD} textColor="black" customStyle={{ width: "100%", padding: "14px", marginTop: 10 }}>
              {t("addFlareNetwork")}
            </GlowButton>
          )}
        </>
      ) : (
        <>
          <section style={{ ...styles.card, border: `2px solid ${SOLID_GOLD}66`, textAlign: "center", padding: "14px 16px" }}>
            <div style={{ fontSize: 10, color: COLORS.TEXT_MUTE, letterSpacing: "1px", marginBottom: 6, fontWeight: "bold" }}>
              {lang === "vi" ? "TỔNG TÀI SẢN FLR (VÍ + PDA + PCHAIN)" : "TOTAL FLR HOLDINGS (WALLET + PDA + PCHAIN)"}
            </div>

            {/* LIVE FLR PRICE TAG — dùng đúng prices.flr (nguồn toUSD() bên dưới cũng dùng), nhịp
                theo mỗi lần poll CoinGecko (60s). Flash xanh/đỏ 1.2s khi giá vừa đổi, rồi trở lại
                màu vàng gold mặc định — không gây nhiễu mắt nếu để tab mở lâu. */}
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: "#0a0a0a",
              border: `1px solid ${flrFlash === "up" ? COLORS.PRICE_GREEN : flrFlash === "down" ? "#ff4444" : SOLID_GOLD + "55"}`,
              borderRadius: 20, padding: "6px 16px", marginBottom: 10,
              boxShadow: flrFlash ? `0 0 14px ${flrFlash === "up" ? COLORS.PRICE_GREEN : "#ff4444"}77` : "none",
              transition: "border-color 0.3s, box-shadow 0.3s"
            }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: COLORS.PRICE_GREEN, animation: "pulseGlow 1.4s infinite" }} />
              <span style={{ fontSize: 10, fontWeight: "bold", color: COLORS.TEXT_MUTE, letterSpacing: "1px" }}>FLR/USD</span>
              <span style={{
                fontSize: 21, fontWeight: "900", fontFamily: "monospace",
                color: flrFlash === "up" ? COLORS.PRICE_GREEN : flrFlash === "down" ? "#ff4444" : SOLID_GOLD,
                transition: "color 0.3s"
              }}>
                ${prices.flr.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
              </span>
              {prices.flrChange24h !== 0 && (
                <span style={{ fontSize: 11, fontWeight: "bold", color: prices.flrChange24h >= 0 ? COLORS.PRICE_GREEN : "#ff4444" }}>
                  {prices.flrChange24h >= 0 ? "▲" : "▼"}{Math.abs(prices.flrChange24h).toFixed(2)}%
                </span>
              )}
            </div>

            <div style={{ fontSize: 27, fontWeight: "900", ...goldTextStyle }}>
              {formatBalance(totalFlrHoldings)} <small style={{ fontSize: 18 }}> FLR</small>
            </div>
            <div style={{ fontSize: 12, color: COLORS.TEXT_MUTE, marginTop: 2 }}>{toUSD(totalFlrHoldings)}</div>
            <div style={{ display: "flex", justifyContent: "center", gap: 14, marginTop: 10, flexWrap: "wrap" }}>
              <div style={{ fontSize: 10, color: COLORS.TEXT_MUTE }}>{t("mainWallet")}: <span style={{ color: COLORS.PRICE_GREEN, fontWeight: "bold" }}>{formatBalance(Number(balances.flr) + Number(balances.wflr))}</span></div>
              <div style={{ fontSize: 10, color: COLORS.TEXT_MUTE }}>PDA: <span style={{ color: COLORS.PRICE_GREEN, fontWeight: "bold" }}>{formatBalance(balances.pdaWflr)}</span></div>
              <div style={{ fontSize: 10, color: COLORS.TEXT_MUTE }}>{t("stakingTitle")}: <span style={{ color: COLORS.PRICE_GREEN, fontWeight: "bold" }}>{formatBalance(Number(stakedAmount) + Number(pChainBalance))}</span></div>
              {Number(claimableStakingReward) > 0 && (
                <div style={{ fontSize: 10, color: COLORS.TEXT_MUTE }}>{lang === "vi" ? "Reward chờ claim" : "Pending reward"}: <span style={{ color: COLORS.PRICE_GREEN, fontWeight: "bold" }}>{formatBalance(claimableStakingReward)}</span></div>
              )}
              {Number(mainWalletFtsoReward) > 0 && (
                <div style={{ fontSize: 10, color: COLORS.TEXT_MUTE }}>{lang === "vi" ? "Delegation reward (ví chính)" : "Delegation reward (main wallet)"}: <span style={{ color: COLORS.PRICE_GREEN, fontWeight: "bold" }}>{formatBalance(mainWalletFtsoReward)}</span></div>
              )}
            </div>
          </section>

          <section style={{ ...styles.card, border: `2px solid ${COLORS.PINK}44` }}>
            <div style={{ ...styles.label, color: COLORS.PINK }}>{t("mainWallet")}</div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 15 }}>
              <div>
                <div style={{ fontSize: 24, fontWeight: "900", color: COLORS.PRICE_GREEN }}>{formatBalance(balances.flr)} <small style={{ fontSize: 18, color: COLORS.PINK }}> FLR</small></div>
                <div style={{ fontSize: 12, color: COLORS.TEXT_MUTE }}>{toUSD(balances.flr)}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 24, fontWeight: "900", color: COLORS.PRICE_GREEN }}>{formatBalance(balances.wflr)} <small style={{ fontSize: 18, color: COLORS.PINK }}> WFLR</small></div>
                <div style={{ fontSize: 12, color: COLORS.TEXT_MUTE }}>{toUSD(balances.wflr)}</div>
              </div>
            </div>

            {Number(mainWalletFtsoReward) > 0 && (
              <RewardClaimBox
                message={lang === "vi" ? "🔔 Có delegation reward trên ví chính:" : "🔔 Delegation reward pending on your main wallet"}
                amount={`${t("claim")} · ${formatBalance(mainWalletFtsoReward)} FLR`}
                onClaim={handleClaimMainWalletFtsoReward}
                baseColor={COLORS.PRICE_GREEN}
                pulse
              />
            )}

            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input type="number" value={walletAmount} onChange={(e) => setWalletAmount(e.target.value)} style={styles.input} placeholder={t("enterAmount")} />
              <GlowButton onClick={() => setWalletAmount(balances.flr)} baseColor={COLORS.PINK}>{t("max")}</GlowButton>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
              <AccentActionButton onClick={handleToPDA} disabled={!walletAmountValid} accentColor={SOLID_GOLD} label={t("depositPda")} />
              <AccentActionButton onClick={handleDepositToPChain} disabled={!walletAmountValid} accentColor={STAKE_COLOR} label={t("depositPchain")} />
            </div>
            <div style={{ fontSize: 10, color: COLORS.TEXT_MUTE, textAlign: "center", marginBottom: 14 }}>
              <span style={{ color: SOLID_GOLD }}>{t("pdaNoteLabel")}</span>{t("pdaNoteText")} &nbsp;·&nbsp; <span style={{ color: STAKE_COLOR }}>{t("pchainNoteLabel")}</span>{t("pchainNoteText")}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <div style={{ flex: 1, height: 1, background: "#222" }} />
              <span style={{ fontSize: 9, color: COLORS.TEXT_MUTE, letterSpacing: "1px", whiteSpace: "nowrap" }}>{t("separateActions")}</span>
              <div style={{ flex: 1, height: 1, background: "#222" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
              <GlowButton onClick={() => handleWrap(true)} disabled={!walletAmountValid} baseColor={COLORS.PINK} customStyle={{ padding: "10px", fontSize: 12 }}>{t("wrap")}</GlowButton>
              <GlowButton onClick={() => handleWrap(false)} disabled={!walletAmountValid} baseColor={COLORS.PINK} customStyle={{ padding: "10px", fontSize: 12 }}>{t("unwrap")}</GlowButton>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: "12px" }}>
              <div style={{ background: "rgba(0, 0, 0, 0.3)", padding: "10px 8px", borderRadius: "14px", border: `1px dashed ${COLORS.PRICE_GREEN}44`, textAlign: "center" }}>
                <div style={{ fontSize: "10px", color: COLORS.TEXT_MUTE, letterSpacing: "1px", marginBottom: "4px", fontWeight: "bold" }}>{t("usdt0Balance")}</div>
                <div style={{ fontSize: "19px", fontWeight: "900", color: COLORS.PRICE_GREEN }}>{formatBalance(usdt0Balance)}</div>
                <div style={{ fontSize: "11px", color: COLORS.PINK, fontWeight: "bold" }}>USD₮0</div>
              </div>
              <div style={{ background: "rgba(0, 0, 0, 0.3)", padding: "10px 8px", borderRadius: "14px", border: `1px dashed ${COLORS.PRICE_GREEN}44`, textAlign: "center" }}>
                <div style={{ fontSize: "10px", color: COLORS.TEXT_MUTE, letterSpacing: "1px", marginBottom: "4px", fontWeight: "bold" }}>{t("usdtBalanceLabel")}</div>
                <div style={{ fontSize: "19px", fontWeight: "900", color: COLORS.PRICE_GREEN }}>{formatBalance(usdtBalance)}</div>
                <div style={{ fontSize: "11px", color: COLORS.PINK, fontWeight: "bold" }}>USDT</div>
              </div>
            </div>

            <GlowButton onClick={() => setIsSwapOpen(true)} baseColor={COLORS.PRICE_GREEN} textColor="black" hoverTextColor={COLORS.PRICE_GREEN} customStyle={{ width: "100%" }}>
              {t("swap")}
            </GlowButton>
          </section>

          <section style={{ ...styles.card, border: `2px solid ${STAKE_COLOR}44` }}>
            <div style={{ ...styles.label, color: STAKE_COLOR }}>{t("stakingTitle")}</div>

            {pChainAddress ? (
              <div
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0a0a0a", padding: "8px 12px", borderRadius: "10px", fontSize: "10px", fontFamily: "monospace", cursor: "pointer", border: "1px solid #222", marginTop: "-6px", marginBottom: "15px" }}
                onClick={() => handleCopy(pChainAddress)}
                title="Click to copy"
              >
                <span style={{ opacity: 0.7, color: STAKE_COLOR }}>{t("pchainAddressLabel")}</span>
                <span style={{ fontWeight: "bold", color: STAKE_COLOR }}>{pChainAddress.slice(0, 12)}...{pChainAddress.slice(-6)} 📋</span>
              </div>
            ) : (
              <div style={{ textAlign: "center", marginBottom: 15 }}>
                <div style={{ fontSize: 11, color: COLORS.TEXT_MUTE, marginBottom: 10, fontStyle: "italic" }}>{t("noPchainAddressText")}</div>
                <GlowButton onClick={initPChain} baseColor={STAKE_COLOR} textColor="black" customStyle={{ width: "100%", padding: "12px", fontSize: 12 }}>{t("getPchainAddress")}</GlowButton>
              </div>
            )}

            {pChainAddress && (
              <>
                {/* Chuyển đổi Tổng quan / Stake mới — tách 2 luồng thao tác để đỡ rối mắt */}
                <div style={{ display: "flex", gap: 6, marginBottom: 16, background: "#0a0a0a", borderRadius: 12, padding: 4, border: `1px solid ${COLORS.BORDER}` }}>
                  <button
                    onClick={() => setStakingTab("overview")}
                    style={{
                      flex: 1, padding: "9px 0", borderRadius: 9, border: "none", cursor: "pointer",
                      background: stakingTab === "overview" ? STAKE_COLOR : "transparent",
                      color: stakingTab === "overview" ? "#000" : COLORS.TEXT_MUTE,
                      fontWeight: "bold", fontSize: 12, transition: "background 0.15s, color 0.15s"
                    }}
                  >
                    {lang === "vi" ? "Tổng quan" : "Overview"}
                  </button>
                  <button
                    onClick={() => setStakingTab("new")}
                    style={{
                      flex: 1, padding: "9px 0", borderRadius: 9, border: "none", cursor: "pointer",
                      background: stakingTab === "new" ? STAKE_COLOR : "transparent",
                      color: stakingTab === "new" ? "#000" : COLORS.TEXT_MUTE,
                      fontWeight: "bold", fontSize: 12, transition: "background 0.15s, color 0.15s"
                    }}
                  >
                    {lang === "vi" ? "+ Stake mới" : "+ New stake"}
                  </button>
                </div>

                {stakingTab === "overview" && (
                  <>
                    {/* Hai số liệu chính đặt cạnh nhau thay vì xếp chồng theo chiều dọc */}
                    <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                      <div style={{ flex: 1, background: "#0a0a0a", border: `1px solid ${COLORS.BORDER}`, borderRadius: 14, padding: "14px 8px", textAlign: "center" }}>
                        <div style={{ fontSize: 10, color: COLORS.TEXT_MUTE, marginBottom: 6 }}>{t("currentlyStaking")}</div>
                        <div style={{ fontSize: 19, fontWeight: "900", color: COLORS.PRICE_GREEN }}>{formatBalance(stakedAmount)}</div>
                        <div style={{ fontSize: 9, color: COLORS.TEXT_MUTE, marginTop: 2 }}>{toUSD(stakedAmount)}</div>
                      </div>
                      <div style={{ flex: 1, background: "#0a0a0a", border: `1px solid ${COLORS.BORDER}`, borderRadius: 14, padding: "14px 8px", textAlign: "center" }}>
                        <div style={{ fontSize: 10, color: COLORS.TEXT_MUTE, marginBottom: 6 }}>{t("notStaked")}</div>
                        <div style={{ fontSize: 19, fontWeight: "900", color: STAKE_COLOR }}>{formatBalance(pChainBalance)}</div>
                        <div style={{ fontSize: 9, color: COLORS.TEXT_MUTE, marginTop: 2 }}>FLR</div>
                      </div>
                    </div>

                    {/* Danh sách validator đang stake, gói trong 1 khung riêng biệt rõ ràng */}
                    <div style={{ background: "#0a0a0a", border: `1px solid ${COLORS.BORDER}`, borderRadius: 14, padding: "12px 14px", marginBottom: 14 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: myStakes.length > 0 ? 10 : 0 }}>
                        <span style={{ fontSize: 11, fontWeight: "bold", color: STAKE_COLOR }}>
                          {lang === "vi" ? "Validator đang stake" : "Active validators"}{myStakes.length > 0 ? ` (${myStakes.length})` : ""}
                        </span>
                        <button
                          onClick={() => refreshMyStakes()}
                          disabled={stakesLoading}
                          style={{ background: "transparent", border: `1px solid ${STAKE_COLOR}66`, color: STAKE_COLOR, borderRadius: 8, padding: "3px 9px", fontSize: 11, cursor: stakesLoading ? "default" : "pointer", opacity: stakesLoading ? 0.5 : 1 }}
                        >
                          {stakesLoading ? "…" : "🔄"}
                        </button>
                      </div>

                      {stakesLoading && myStakes.length === 0 && (
                        <div style={{ textAlign: "center", fontSize: 11, color: COLORS.TEXT_MUTE, padding: "10px 0" }}>
                          {lang === "vi"
                            ? "Đang kiểm tra stake... (nhanh nếu chưa từng stake, tối đa 12s nếu cần dò chi tiết)"
                            : "Checking stake status... (fast if you've never staked, up to 12s if a detailed scan is needed)"}
                        </div>
                      )}

                      {!stakesLoading && !stakesError && myStakes.length === 0 && Number(stakedAmount) === 0 && (
                        <div style={{ textAlign: "center", fontSize: 11, color: COLORS.TEXT_MUTE, padding: "10px 0" }}>
                          {lang === "vi"
                            ? <>Bạn chưa stake FLR nào. Chuyển qua tab <b style={{ color: STAKE_COLOR }}>+ Stake mới</b> để bắt đầu.</>
                            : <>You haven't staked any FLR yet. Switch to <b style={{ color: STAKE_COLOR }}>+ New stake</b> to get started.</>}
                        </div>
                      )}

                      {!stakesLoading && myStakes.length === 0 && (stakesError || Number(stakedAmount) > 0) && (
                        <div style={{ padding: "6px 0" }}>
                          <div style={{ textAlign: "center", fontSize: 11, color: COLORS.PINK, marginBottom: 10 }}>
                            {lang === "vi"
                              ? "Không tự động dò được validator (RPC quét cả mạng quá chậm). Chọn thủ công validator bạn đã stake để tải nhanh:"
                              : "Couldn't auto-detect validators (full-network RPC scan is too slow). Pick the validator(s) you staked with to load quickly:"}
                          </div>
                          <div style={{ position: "relative" }}>
                            <span style={{ position: "absolute", left: 12, top: 10, color: COLORS.TEXT_MUTE, fontSize: 12 }}>🔍</span>
                            <input
                              type="text"
                              value={manualNodeSearch}
                              onChange={(e) => setManualNodeSearch(e.target.value)}
                              placeholder={lang === "vi" ? "Tìm theo tên hoặc NodeID..." : "Search by name or NodeID..."}
                              style={{ ...styles.input, paddingLeft: 32, width: "100%", boxSizing: "border-box", fontSize: 12 }}
                            />
                          </div>
                          {manualNodeSearch.trim().length > 0 && (
                            <div style={{ marginTop: 6, maxHeight: 180, overflowY: "auto", background: "#141414", border: "1px solid #222", borderRadius: 10 }}>
                              {validators
                                .filter((v) =>
                                  (v.name || "").toLowerCase().includes(manualNodeSearch.trim().toLowerCase()) ||
                                  v.nodeID.toLowerCase().includes(manualNodeSearch.trim().toLowerCase())
                                )
                                .slice(0, 8)
                                .map((v) => (
                                  <div
                                    key={v.nodeID}
                                    onClick={() => handleIdentifyKnownValidator(v.nodeID)}
                                    style={{ padding: "9px 12px", fontSize: 12, borderBottom: "1px solid #222", cursor: "pointer" }}
                                  >
                                    <div style={{ fontWeight: v.name ? "bold" : "normal", color: v.name ? "#fff" : COLORS.TEXT_MUTE }}>
                                      {v.name || t("anonymousValidator")}
                                    </div>
                                    <div style={{ fontSize: 10, color: COLORS.TEXT_MUTE, fontFamily: "monospace" }}>{v.nodeID.slice(0, 22)}...</div>
                                  </div>
                                ))}
                              {validators.filter((v) =>
                                (v.name || "").toLowerCase().includes(manualNodeSearch.trim().toLowerCase()) ||
                                v.nodeID.toLowerCase().includes(manualNodeSearch.trim().toLowerCase())
                              ).length === 0 && (
                                <div style={{ padding: 10, fontSize: 11, color: COLORS.TEXT_MUTE, textAlign: "center" }}>{t("noValidatorFound")}</div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {myStakes.map((s, i) => {
                        const name = getValidatorName(s.nodeId);
                        const daysLeft = Math.max(0, Math.ceil((s.endTime - Date.now() / 1000) / 86400));
                        const endDate = new Date(s.endTime * 1000);
                        return (
                          <div key={s.nodeId + i} style={{ background: "#141414", border: "1px solid #222", borderRadius: 10, padding: "10px 12px", marginTop: 8 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div>
                                <div style={{ fontWeight: "bold", fontSize: 13 }}>
                                  {name || <span style={{ fontFamily: "monospace", fontWeight: "normal", color: COLORS.TEXT_MUTE }}>{t("anonymousValidator")}</span>}
                                </div>
                                <div style={{ fontSize: 10, color: COLORS.TEXT_MUTE, fontFamily: "monospace" }}>{s.nodeId.slice(0, 14)}...</div>
                              </div>
                              <div style={{ textAlign: "right" }}>
                                <div style={{ fontSize: 14, fontWeight: "900", color: STAKE_COLOR }}>{formatBalance(s.amount)} FLR</div>
                                <div style={{ fontSize: 10, color: daysLeft <= 0 ? COLORS.PRICE_GREEN : COLORS.TEXT_MUTE }}>
                                  {daysLeft > 0
                                    ? (lang === "vi" ? `còn ${daysLeft} ngày` : `${daysLeft}d left`)
                                    : (lang === "vi" ? "đã kết thúc" : "ended")}
                                </div>
                              </div>
                            </div>
                            <div style={{ fontSize: 9, color: COLORS.TEXT_MUTE, marginTop: 6 }}>
                              {lang === "vi" ? "Kết thúc lúc" : "Ends"}: {endDate.toLocaleDateString()} {endDate.toLocaleTimeString()}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Phần thưởng — gộp 2 loại reward vào chung 1 khối có tiêu đề, thay vì 2 hộp rời rạc */}
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 11, fontWeight: "bold", color: STAKE_COLOR, marginBottom: 8 }}>
                        {lang === "vi" ? "Phần thưởng" : "Rewards"}
                      </div>

                      {Number(claimableStakingReward) > 0 ? (
                        <RewardClaimBox
                          message={<><span role="img" aria-label="bell">🔔</span> {t("pendingRewardNote")}</>}
                          amount={`${t("claim")} · ${formatBalance(claimableStakingReward)} FLR`}
                          onClaim={handleClaimStaking}
                          baseColor={COLORS.PRICE_GREEN}
                          pulse
                        />
                      ) : (
                        <div style={{ background: "#0a0a0a", border: "1px solid #222", borderRadius: 10, padding: "8px 12px", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ fontSize: 11, color: COLORS.TEXT_MUTE }}>
                            {lang === "vi" ? "Reward staking: " : "Staking reward: "}
                            <span style={{ fontWeight: "bold" }}>{formatBalance(claimableStakingReward)} FLR</span>
                          </div>
                          <button
                            onClick={() => refreshClaimableStakingReward()}
                            style={{ background: "transparent", border: `1px solid ${STAKE_COLOR}66`, color: STAKE_COLOR, borderRadius: 8, padding: "4px 10px", fontSize: 11, cursor: "pointer" }}
                          >
                            🔄
                          </button>
                        </div>
                      )}

                      {Number(mainWalletFtsoReward) > 0 && (
                        <RewardClaimBox
                          message={lang === "vi" ? "🔔 Reward từ Ủy khoán (main wallet):" : "🔔 Reward from delegation (main wallet):"}
                          amount={`${t("claim")} · ${formatBalance(mainWalletFtsoReward)} FLR`}
                          onClaim={handleClaimMainWalletFtsoReward}
                          baseColor={SOLID_GOLD}
                        />
                      )}
                    </div>

                    {Number(pChainBalance) > 0 && (
                      <GlowButton onClick={handleWithdrawToMain} baseColor={STAKE_COLOR} textColor="black" customStyle={{ width: "100%", padding: "10px", marginBottom: 10, fontSize: 12 }}>
                        {t("withdrawToMain", { amt: formatBalance(pChainBalance) })}
                      </GlowButton>
                    )}

                    <div style={{ fontSize: 10, color: COLORS.TEXT_MUTE, textAlign: "center" }}>
                      {t("depositMoreHintPre")} <span style={{ color: STAKE_COLOR, fontWeight: "bold" }}>{t("depositMoreHintMid")}</span> {t("depositMoreHintPost")}
                    </div>
                  </>
                )}

                {stakingTab === "new" && (
                  <>
                    {/* Bước 1 — Chọn validator: đây thật sự là 1 quy trình tuần tự nên đánh số các bước cho rõ */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      <div style={{ width: 22, height: 22, borderRadius: "50%", background: STAKE_COLOR, color: "#000", fontSize: 12, fontWeight: "900", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>1</div>
                      <div style={{ fontSize: 12, fontWeight: "bold" }}>{lang === "vi" ? "Chọn tối đa 2 validator" : "Choose up to 2 validators"}</div>
                    </div>

                    <div style={{ fontSize: 10, color: COLORS.AMBER, marginBottom: 10, lineHeight: 1.5, paddingLeft: 30 }}>
                      {t("validatorMinWarningPre")} <b>{MIN_STAKE_FLR.toLocaleString()} FLR</b>, {t("validatorMinWarningMid")} <b>{MIN_STAKE_DAYS} {lang === "vi" ? "ngày" : "days"}</b>. {t("validatorMinWarningPost")}
                    </div>

                    <div style={{ paddingLeft: 30, marginBottom: 18 }}>
                      {stakeProviders.map((v) => (
                        <div key={v.nodeID} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #222" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0, background: `hsl(${(v.nodeID.charCodeAt(7) * 37) % 360}, 65%, 45%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: "bold", color: "#fff" }}>
                              {(v.name || v.nodeID.slice(7, 9)).slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontWeight: "bold", fontSize: 13 }}>
                                {v.name || <span style={{ fontFamily: "monospace", fontWeight: "normal", color: COLORS.TEXT_MUTE }}>{t("anonymousValidator")}</span>}
                              </div>
                              <div style={{ fontSize: 10, color: COLORS.TEXT_MUTE, fontFamily: "monospace" }}>{v.nodeID.slice(0, 14)}... · {t("uptimeFeeLabel", { uptime: v.uptime.toFixed(1), fee: v.delegationFee })}</div>
                              <div style={{ fontSize: 10, color: v.freeSpace > 0 ? COLORS.PRICE_GREEN : "#ff4444" }}>{t("freeSpaceLabel")} {Math.floor(v.freeSpace).toLocaleString()} FLR</div>
                              {v.daysUntilEnd != null && (
                                <div style={{ fontSize: 10, color: v.daysUntilEnd < Number(stakeDays) ? "#ff4444" : COLORS.TEXT_MUTE }}>
                                  {t("validatorExpiresIn", { days: v.daysUntilEnd })} {v.daysUntilEnd < Number(stakeDays) && t("shorterThanChosen")}
                                </div>
                              )}
                            </div>
                          </div>
                          <button onClick={() => handleRemoveStakeProvider(v.nodeID)} style={{ background: "#ff444411", border: "none", color: "#ff4444", padding: "5px 10px", borderRadius: 8, cursor: "pointer", transition: "all 0.2s" }} onMouseOver={(e) => { e.currentTarget.style.boxShadow = "0 0 10px #ff444455"; e.currentTarget.style.background = "#ff444433"; }} onMouseOut={(e) => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.background = "#ff444411"; }}>✕</button>
                        </div>
                      ))}

                      {stakeProviders.length < 2 && (
                        <div ref={stakeDropdownRef} style={{ position: "relative", marginTop: 12 }}>
                          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                            <span style={{ position: "absolute", left: 12, color: COLORS.TEXT_MUTE }}>🔍</span>
                            <input
                              type="text"
                              placeholder={loadingValidators ? t("loadingValidators") : t("searchValidatorPlaceholder")}
                              value={stakeProviderSearch}
                              onFocus={() => setShowStakeDropdown(true)}
                              onChange={(e) => setStakeProviderSearch(e.target.value)}
                              style={{ ...styles.input, paddingLeft: 35, width: "100%", boxSizing: "border-box" }}
                            />
                          </div>
                          {showStakeDropdown && (
                            <div style={{ position: "absolute", top: "110%", left: 0, right: 0, background: "#181818", borderRadius: 15, border: "1px solid #333", maxHeight: 200, overflowY: "auto", zIndex: 100, boxShadow: "0 10px 20px rgba(0,0,0,0.5)" }}>
                              {filteredStakeProviders.filter((v) => !stakeProviders.find((sp) => sp.nodeID === v.nodeID)).map((v) => (
                                <div key={v.nodeID} onClick={() => handleSelectStakeProvider(v)} style={{ padding: "10px 12px", fontSize: 13, borderBottom: "1px solid #222", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                  <div>
                                    <div style={{ fontWeight: v.name ? "bold" : "normal", color: v.name ? "#fff" : COLORS.TEXT_MUTE }}>{v.name || t("anonymousValidator")}</div>
                                    <div style={{ fontSize: 10, color: COLORS.TEXT_MUTE, fontFamily: "monospace" }}>{v.nodeID.slice(0, 20)}...</div>
                                  </div>
                                  <span style={{ color: COLORS.TEXT_MUTE, fontSize: 11, whiteSpace: "nowrap", marginLeft: 8, textAlign: "right" }}>
                                    {t("uptimeFeeShort", { uptime: v.uptime.toFixed(1), fee: v.delegationFee })}<br />
                                    {v.daysUntilEnd != null && <span>{t("expiresShort", { days: v.daysUntilEnd })}<br /></span>}
                                    <span style={{ color: v.freeSpace > 0 ? COLORS.PRICE_GREEN : "#ff4444" }}>{t("freeSpaceShort")} {Math.floor(v.freeSpace).toLocaleString()} FLR</span>
                                  </span>
                                </div>
                              ))}
                              {!loadingValidators && filteredStakeProviders.length === 0 && (
                                <div style={{ padding: 12, fontSize: 12, color: COLORS.TEXT_MUTE, textAlign: "center" }}>{t("noValidatorFound")}</div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Bước 2 — Số lượng & thời hạn */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      <div style={{ width: 22, height: 22, borderRadius: "50%", background: STAKE_COLOR, color: "#000", fontSize: 12, fontWeight: "900", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>2</div>
                      <div style={{ fontSize: 12, fontWeight: "bold" }}>{lang === "vi" ? "Số lượng & thời hạn" : "Amount & duration"}</div>
                    </div>

                    <div style={{ paddingLeft: 30, marginBottom: 18 }}>
                      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                        <input type="number" value={stakeAmount} onChange={(e) => setStakeAmount(e.target.value)} style={styles.input} placeholder={t("stakingAmountPlaceholder")} />
                        <GlowButton onClick={() => setStakeAmount(String(Math.floor(Number(pChainBalance))))} baseColor={STAKE_COLOR}>{t("max")}</GlowButton>
                      </div>
                      {Number(stakeAmount) > 0 && !stakeAmountValid && (
                        <div style={{ fontSize: 10, color: "#ff4444", textAlign: "center", marginBottom: 8 }}>
                          {lang === "vi"
                            ? `Cần tối thiểu ${requiredStakeMin.toLocaleString()} FLR (${MIN_STAKE_FLR.toLocaleString()} FLR × ${Math.max(stakeProviders.length, 1)} validator đã chọn)`
                            : `Requires at least ${requiredStakeMin.toLocaleString()} FLR (${MIN_STAKE_FLR.toLocaleString()} FLR × ${Math.max(stakeProviders.length, 1)} selected validator(s))`}
                        </div>
                      )}
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 11, color: COLORS.TEXT_MUTE, whiteSpace: "nowrap" }}>{t("durationLabel")}</span>
                        <input type="number" min={MIN_STAKE_DAYS} value={stakeDays} onChange={(e) => setStakeDays(e.target.value)} style={{ ...styles.input, flex: 1 }} placeholder={t("minDaysPlaceholder", { days: MIN_STAKE_DAYS })} />
                      </div>
                    </div>

                    {/* Bước 3 — Xác nhận */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      <div style={{ width: 22, height: 22, borderRadius: "50%", background: STAKE_COLOR, color: "#000", fontSize: 12, fontWeight: "900", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>3</div>
                      <div style={{ fontSize: 12, fontWeight: "bold" }}>{lang === "vi" ? "Xác nhận" : "Confirm"}</div>
                    </div>
                    <div style={{ paddingLeft: 30 }}>
                      <GlowButton
                        onClick={handleStakeFLR}
                        disabled={stakeProviders.length === 0 || !stakeAmountValid}
                        baseColor={stakeProviders.length === 0 || !stakeAmountValid ? "transparent" : STAKE_COLOR}
                        textColor={stakeProviders.length === 0 || !stakeAmountValid ? COLORS.TEXT_MUTE : "black"}
                        customStyle={{ width: "100%", padding: "15px", border: stakeProviders.length === 0 || !stakeAmountValid ? `1px solid ${COLORS.BORDER}` : "none" }}
                      >
                        {t("stakeButton")}
                      </GlowButton>
                    </div>
                  </>
                )}
              </>
            )}
          </section>

          <section style={{ ...styles.card, border: `2px solid ${SOLID_GOLD}44` }}>
            <div style={{ ...styles.label, ...goldTextStyle }}>{t("pdaTitle")}</div>
            {pdaAddress && (
              <div
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0a0a0a", padding: "8px 12px", borderRadius: "10px", fontSize: "10px", fontFamily: "monospace", cursor: "pointer", border: "1px solid #222", marginTop: "-6px", marginBottom: "15px" }}
                onClick={() => handleCopy(pdaAddress)}
                title="Click to copy"
              >
                <span style={{ opacity: 0.7, color: SOLID_GOLD }}>{t("addressLabel")}</span><span style={{ fontWeight: "bold", ...goldTextStyle }}>{pdaAddress.slice(0, 10)}...{pdaAddress.slice(-8)} 📋</span>
              </div>
            )}
            {!isActivated ? (
              <div style={{ textAlign: "center", padding: "10px 0" }}>
                <p style={{ fontSize: "12px", marginBottom: "15px", lineHeight: "1.5", ...goldTextStyle }}>{t("pdaNotActivatedText")}<br />{t("pdaNotActivatedSubtext")}</p>
                <GlowButton onClick={handleEnablePDA} baseColor={SOLID_GOLD} textColor="black" customStyle={{ width: "100%", fontSize: "13px", padding: "15px" }}>{t("pdaActivateNow")}</GlowButton>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 15 }}>
                  <div style={{ fontSize: 24, fontWeight: "900", color: COLORS.PRICE_GREEN }}>{formatBalance(balances.pdaWflr)} <small style={{ ...goldTextStyle, fontSize: 18 }}> WFLR</small></div>
                  <div style={{ fontSize: 12, color: COLORS.TEXT_MUTE }}>{toUSD(balances.pdaWflr)}</div>
                </div>
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                  <input type="number" value={pdaAmount} onChange={(e) => setPdaAmount(e.target.value)} style={styles.input} placeholder={t("withdrawAmount")} />
                  <button
                    onClick={() => setPdaAmount(balances.pdaWflr)}
                    style={{ ...styles.btnBase, background: goldGradientBg, color: "#000", fontWeight: "bold", border: `1px solid ${SOLID_GOLD}`, padding: "0 16px" }}
                    onMouseOver={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = SOLID_GOLD; e.currentTarget.style.boxShadow = `0 0 10px ${SOLID_GOLD}88`; }}
                    onMouseOut={(e) => { e.currentTarget.style.background = goldGradientBg; e.currentTarget.style.color = "#000"; e.currentTarget.style.boxShadow = "none"; }}
                  >
                    {t("max")}
                  </button>
                </div>
                <button
                  onClick={handleWithdrawPDA}
                  disabled={!pdaAmountValid}
                  style={{ ...styles.btnBase, width: "100%", background: goldGradientBg, color: "#000", fontWeight: "bold", border: `3px solid ${SOLID_GOLD}66`, marginBottom: 20, ...(!pdaAmountValid ? { opacity: 0.5, cursor: "not-allowed" } : {}) }}
                  onMouseOver={(e) => { if (!pdaAmountValid) return; e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = SOLID_GOLD; e.currentTarget.style.color = SOLID_GOLD; e.currentTarget.style.boxShadow = `0 0 15px ${SOLID_GOLD}88`; }}
                  onMouseOut={(e) => { if (!pdaAmountValid) return; e.currentTarget.style.background = goldGradientBg; e.currentTarget.style.borderColor = `${SOLID_GOLD}66`; e.currentTarget.style.color = "#000"; e.currentTarget.style.boxShadow = "none"; }}
                >
                  {t("withdrawToMainWallet")}
                </button>

                <div style={{ background: "rgba(0,0,0,0.5)", padding: "16px", borderRadius: "20px", border: `1px solid ${timeLeft > 0 ? COLORS.BORDER : COLORS.PINK + "44"}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: "10px", fontWeight: "800", marginBottom: "4px", ...(timeLeft > 0 ? { color: COLORS.TEXT_MUTE } : goldTextStyle) }}>
                        {timeLeft > 0 ? t("nextRewardCycle") : t("unclaimedRewards")}
                      </div>
                      <div style={{ fontSize: "20px", fontWeight: "900" }}>
                        {timeLeft > 0 ? renderCountdown(timeLeft) : <span style={{ color: COLORS.PRICE_GREEN }}>+{Number(balances.reward).toFixed(2)} FLR</span>}
                      </div>
                    </div>
                    <GlowButton
                      onClick={handleClaim}
                      disabled={Number(balances.reward) <= 0 || timeLeft > 0}
                      baseColor={timeLeft > 0 ? "transparent" : SOLID_GOLD}
                      textColor={timeLeft > 0 ? COLORS.TEXT_MUTE : "black"}
                      customStyle={{ minWidth: "85px", border: timeLeft > 0 ? `1px solid ${COLORS.BORDER}` : "none" }}
                    >
                      {timeLeft > 0 ? t("locked") : t("claim")}
                    </GlowButton>
                  </div>
                  <div style={{ width: "100%", height: "4px", background: "#222", borderRadius: "10px", marginTop: "12px", overflow: "hidden" }}>
                    <div style={{ width: `${Math.max(0, 100 - (timeLeft / CYCLE_SECONDS) * 100)}%`, height: "100%", background: timeLeft > 0 ? COLORS.PINK : COLORS.PRICE_GREEN, transition: "width 1s linear" }} />
                  </div>
                </div>
              </>
            )}
          </section>

          <section style={{ ...styles.card, border: `2px solid ${COLORS.PINK}44` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <div style={{ ...styles.label, marginBottom: 0 }}>{t("delegationsTitle", { n: delegations.length })}</div>
              {delegations.length > 0 && (
                <button onClick={handleUndelegateAll} style={{ ...styles.undelegateBtn, transition: "all 0.2s" }} onMouseOver={(e) => { e.currentTarget.style.boxShadow = `0 0 10px ${COLORS.PINK}66`; e.currentTarget.style.background = `${COLORS.PINK}22`; }} onMouseOut={(e) => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.background = "transparent"; }}>{t("undelegateAll")}</button>
              )}
            </div>

            {delegations.map((d, i) => (
              <div key={d.addr || i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: i === delegations.length - 1 ? "none" : "1px solid #222" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0, background: `hsl(${(d.name.charCodeAt(0) * 37) % 360}, 65%, 45%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: "bold", color: "#fff" }}>
                    {d.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div><div style={{ fontWeight: "bold" }}>{d.name}</div><div style={{ fontSize: 11, color: COLORS.PINK }}>{d.pct}% {t("power")}</div></div>
                </div>
                <button onClick={() => handleDelegate(d.addr, 0)} style={{ background: "#ff444411", border: "none", color: "#ff4444", padding: "5px 10px", borderRadius: 8, cursor: "pointer", transition: "all 0.2s" }} onMouseOver={(e) => { e.currentTarget.style.boxShadow = "0 0 10px #ff444455"; e.currentTarget.style.background = "#ff444433"; }} onMouseOut={(e) => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.background = "#ff444411"; }}>✕</button>
              </div>
            ))}

            {delegations.length < 2 && (
              <div ref={dropdownRef} style={{ position: "relative", marginTop: 12 }}>
                <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                  <span style={{ position: "absolute", left: 12, color: COLORS.TEXT_MUTE }}>🔍</span>
                  <input type="text" placeholder={t("searchProvider")} value={providerSearch} onFocus={() => setShowDropdown(true)} onChange={(e) => setProviderSearch(e.target.value)} style={{ ...styles.input, paddingLeft: 35, width: "100%", boxSizing: "border-box" }} />
                </div>
                {showDropdown && (
                  <div style={{ position: "absolute", bottom: "110%", left: 0, right: 0, background: "#181818", borderRadius: 15, border: "1px solid #333", maxHeight: 150, overflowY: "auto", zIndex: 100, boxShadow: "0 -10px 20px rgba(0,0,0,0.5)" }}>
                    {filteredProviders.map((p) => (
                      <div key={p.address} onClick={() => { setPendingProvider(p); setProviderSearch(p.name); setShowDropdown(false); }} style={{ padding: 12, fontSize: 13, borderBottom: "1px solid #222", cursor: "pointer" }}>
                        {p.name} <span style={{ color: COLORS.PINK, float: "right" }}>50%</span>
                      </div>
                    ))}
                  </div>
                )}
                {pendingProvider && (
                  <div style={{ marginTop: 12, padding: 12, background: "rgba(227, 24, 100, 0.1)", borderRadius: 16, border: `1px dashed ${COLORS.PINK}`, textAlign: "center" }}>
                    <div style={{ fontSize: 12, marginBottom: 8 }}>{t("confirmDelegateQuestionPre")} <b>{pendingProvider.name}</b>{t("confirmDelegateQuestionPost")}</div>
                    <GlowButton onClick={() => handleDelegate(pendingProvider.address, 50)} baseColor={COLORS.PINK} customStyle={{ width: "100%", padding: "10px" }}>{t("signConfirm50")}</GlowButton>
                    <div onClick={() => { setPendingProvider(null); setProviderSearch(""); }} style={{ fontSize: 10, marginTop: 8, color: COLORS.TEXT_MUTE, cursor: "pointer", textDecoration: "underline" }}>{t("cancelSelection")}</div>
                  </div>
                )}
              </div>
            )}
          </section>

          <div style={{ textAlign: "center", fontSize: 11, color: COLORS.PINK, fontWeight: "bold" }}>● {status.toUpperCase()}</div>
        </>
      )}

      {status.includes("⏳") && (
        <div
          onClick={() => setStatus(t("statusReady"))}
          style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(8, 8, 8, 0.95)", backdropFilter: "blur(12px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: "20px", textAlign: "center", cursor: "pointer", overflow: "hidden" }}
        >
          <div style={{ position: "absolute", inset: 0, backgroundImage: `url(${quocHuyImg})`, backgroundSize: "min(60vw, 420px)", backgroundPosition: "center", backgroundRepeat: "no-repeat", opacity: 0.12, filter: "grayscale(15%)", pointerEvents: "none", zIndex: 0 }} />

          <div style={{ position: "relative", zIndex: 1, fontSize: "70px", animation: "bounce 0.5s infinite alternate cubic-bezier(0.5, 0.05, 1, 0.5)", textShadow: `0 20px 30px ${COLORS.PINK}66` }}>
            {["🤪", "🐢", "🚀", "🐩", "🏊‍♂️"][quoteIndex]}
          </div>

          <div style={{ position: "relative", zIndex: 1, marginTop: "35px", color: COLORS.AMBER, fontSize: "15px", fontWeight: "bold", lineHeight: "1.5", maxWidth: "300px" }}>
            {loadingQuotes[quoteIndex]}
          </div>

          <div style={{ position: "relative", zIndex: 1, marginTop: "25px", padding: "8px 16px", background: "#111", borderRadius: "20px", border: `1px dashed ${COLORS.PINK}`, fontSize: "11px", color: COLORS.PRICE_GREEN, animation: "pulseGlow 1.5s infinite", textTransform: "uppercase", letterSpacing: "1px" }}>
            {status}
          </div>

          <div style={{ position: "relative", zIndex: 1, marginTop: "40px", fontSize: "12px", color: COLORS.TEXT_MUTE, opacity: 0.7 }}>
            {t("overlayHint")}
          </div>
        </div>
      )}

      <SwapModal
        isOpen={isSwapOpen}
        onClose={() => setIsSwapOpen(false)}
        provider={getProvider()}
        userAddress={account}
        wnatAddress={WNAT}
        usdt0Address={USDT0_ADDRESS}
        usdtAddress={USDT_ADDRESS}
        flrBalance={balances.flr}
        usdt0Balance={usdt0Balance}
        usdtBalance={usdtBalance}
        onSwapSuccess={() => refreshData(account, pdaAddress)}
      />
    </div>
  );
}
