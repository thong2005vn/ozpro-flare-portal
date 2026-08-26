import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { ethers } from "ethers";
import { QRCodeSVG } from "qrcode.react";
import { createWeb3Modal, defaultConfig } from "@web3modal/ethers/react";
import SwapModal from "./components/SwapModal";
// --- SDK CHÍNH THỨC CỦA FLARE ĐỂ THAO TÁC P-CHAIN (STAKING) ---
// Cài đặt: npm install @flarenetwork/flare-tx-sdk
import { Network, EIP1193WalletController, Amount } from "@flarenetwork/flare-tx-sdk";
// --- IMPORT TỪ FILE CONSTANTS ---
import {
  WNAT, REWARD_MANAGER, CLAIM_SETUP_MANAGER, CYCLE_SECONDS,
  FLARE_PARAMS, COLORS, PROVIDERS, styles
} from "./constants";
// --- QUỐC HUY: dùng ở đầu trang, trong HELP modal, và làm nền màn hình chờ giao dịch ---
import quocHuyImg from "./assets/quoc-huy.png";

// --- MẠNG FLARE DÙNG CHO SDK STAKING (P-CHAIN) ---
const flrNetwork = Network.FLARE;
// Endpoint RPC của P-Chain trên Flare mainnet (đúng chuẩn chính thức, KHÔNG suy diễn từ URL C-Chain
// vì 2 endpoint có định dạng khác nhau: C-Chain là "/ext/C/rpc", P-Chain là "/ext/bc/P")
const P_CHAIN_RPC = "https://flare-api.flare.network/ext/bc/P";
// Subnet ID của Primary Network trên mọi mạng Avalanche/Flare (hằng số cố định)
const PRIMARY_SUBNET_ID = "11111111111111111111111111111111LpoYY";
// Ràng buộc thực tế của Flare P-Chain staking
const MIN_STAKE_FLR = 50000; // Tối thiểu 50,000 FLR mỗi lần stake cho 1 validator
const MIN_STAKE_DAYS = 14; // Tối thiểu 14 ngày

// --- THÊM STYLE MÀU VÀNG KIM LOẠI ---
const goldGradientBg = 'linear-gradient(to bottom, #8A641C 0%, #F4D573 25%, #9A761C 50%, #FFF1A0 75%, #7B5611 100%)';
const goldTextStyle = {
  background: goldGradientBg,
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
  color: 'transparent'
};
const SOLID_GOLD = '#F4D573';
// --- MÀU ACCENT RIÊNG CHO KHỐI STAKING FLR (P-CHAIN) ---
const STAKE_COLOR = '#00C2FF';

// 🌐 CẤU HÌNH WEB3MODAL
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
  chains: [flareNetworkConfig], projectId, enableAnalytics: false, themeMode: 'dark',
  themeVariables: { '--w3m-z-index': '9999' }
});

// --- HẰNG SỐ SMART CONTRACT TOKEN ---
const USDT0_ADDRESS = "0xe7cd86e13AC4309349F30B3435a9d337750fC82D";
// Địa chỉ USDT (bridged qua Stargate) trên Flare Mainnet — lấy từ trang chính thức fair.flare.network.
// ⚠️ QUAN TRỌNG: đây là token liên quan tiền thật — trước khi deploy production, tự kiểm tra lại địa chỉ này
// trên flare-explorer.flare.network để chắc chắn 100% trước khi cho người dùng giao dịch.
const USDT_ADDRESS = "0x0B38e83B86d491735fEaa0a791F65c2B99535396";

// --- HELPER LẤY THÔNG BÁO LỖI TƯƠNG THÍCH ETHERS V6 ---
// ethers v6 không trả lỗi qua field "reason" như v5 nữa; ưu tiên shortMessage / info.error.message
// trước khi rơi về "reason" (giữ lại để tương thích ngược) rồi mới tới "message" chung chung.
const getErrMsg = (e) => e?.shortMessage || e?.info?.error?.message || e?.reason || e?.message || "thất bại";

// --- UI HELPERS & COMPONENTS ---
const renderCountdown = (seconds) => {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n) => n.toString().padStart(2, "0");
  return (
    <div style={{ display: 'flex', gap: '6px', alignItems: 'baseline', fontFamily: 'monospace' }}>
      <span>{pad(d)}</span><small style={{ fontSize: '10px', color: COLORS.TEXT_MUTE, marginRight: '2px' }}>d</small>
      <span>{pad(h)}</span><small style={{ fontSize: '10px', color: COLORS.TEXT_MUTE, marginRight: '2px' }}>h</small>
      <span>{pad(m)}</span><small style={{ fontSize: '10px', color: COLORS.TEXT_MUTE, marginRight: '2px' }}>m</small>
      <span style={{ color: COLORS.PINK }}>{pad(s)}</span><small style={{ fontSize: '10px', color: COLORS.TEXT_MUTE }}>s</small>
    </div>
  );
};

// --- HIỆU ỨNG ÓNG ÁNH (SHINE) DÙNG CHUNG CHO MỌI MÀU NÚT ---
// Tạo dải gradient sáng-tối từ CHÍNH màu gốc của nút (không đổi màu, chỉ thêm ánh kim)
const shadeColor = (hex, percent) => {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const num = parseInt(h, 16);
  let r = (num >> 16) + percent;
  let g = ((num >> 8) & 0x00FF) + percent;
  let b = (num & 0x0000FF) + percent;
  r = Math.max(Math.min(255, r), 0);
  g = Math.max(Math.min(255, g), 0);
  b = Math.max(Math.min(255, b), 0);
  return "#" + (0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1);
};
const shineGradient = (hex) => {
  if (!hex || typeof hex !== 'string' || !hex.startsWith('#')) return hex; // vd: "transparent" giữ nguyên
  return `linear-gradient(to bottom, ${shadeColor(hex, 50)} 0%, ${shadeColor(hex, 15)} 25%, ${hex} 50%, ${shadeColor(hex, -20)} 75%, ${shadeColor(hex, -45)} 100%)`;
};

const GlowButton = ({ onClick, disabled, baseColor, textColor = 'white', hoverTextColor, customStyle, children }) => {
  const gradient = shineGradient(baseColor);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{ ...styles.btnBase, background: gradient, color: textColor, ...(disabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}), ...customStyle }}
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

const useCryptoPrices = () => {
  const [prices, setPrices] = useState({ btc: 0, eth: 0, xrp: 0, flr: 0, sgb: 0, ltc: 0, doge: 0, cmc20: 0 });
  useEffect(() => {
    const getAllPrices = async () => {
      try {
        // "coinmarketcap-20-index-dtf" = chỉ số CMC20 (CoinMarketCap 20 Index DTF) theo dõi top 20 coin theo vốn hóa
        const ids = "bitcoin,ethereum,ripple,flare-networks,songbird,litecoin,dogecoin,coinmarketcap-20-index-dtf";
        const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`);
        const data = await res.json();
        setPrices({
          btc: data["bitcoin"]?.usd || 0, eth: data["ethereum"]?.usd || 0, xrp: data["ripple"]?.usd || 0,
          flr: data["flare-networks"]?.usd || 0, sgb: data["songbird"]?.usd || 0,
          ltc: data["litecoin"]?.usd || 0, doge: data["dogecoin"]?.usd || 0,
          cmc20: data["coinmarketcap-20-index-dtf"]?.usd || 0
        });
      } catch (e) { console.error(e); }
    };
    getAllPrices();
    const interval = setInterval(getAllPrices, 60000);
    return () => clearInterval(interval);
  }, []);
  return prices;
};

// --- MAIN COMPONENT ---
export default function FlarePortal() {
  const [account, setAccount] = useState("");
  const [pdaAddress, setPdaAddress] = useState("");
  const [isActivated, setIsActivated] = useState(false);
  const [balances, setBalances] = useState({ flr: "0", wflr: "0", pdaWflr: "0", reward: "0" });
  const [usdt0Balance, setUsdt0Balance] = useState("0");
  const [usdtBalance, setUsdtBalance] = useState("0"); // Số dư USDT (bridged) — hiển thị song song với USDT₮0
  const [delegations, setDelegations] = useState([]);
  const [walletAmount, setWalletAmount] = useState("");
  const [pdaAmount, setPdaAmount] = useState("");
  const [status, setStatus] = useState("Sẵn sàng");
  const [providerSearch, setProviderSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [pendingProvider, setPendingProvider] = useState(null);

  // --- STATE CHO KHỐI STAKING FLR (P-CHAIN) ---
  const [pChainPublicKey, setPChainPublicKey] = useState(""); // Public key dùng để suy ra địa chỉ P-Chain thật
  const [pChainAddress, setPChainAddress] = useState("");
  const [pChainBalance, setPChainBalance] = useState("0"); // Số dư đã nạp vào Pchain nhưng chưa stake
  const [stakedAmount, setStakedAmount] = useState("0"); // Số lượng đang staking
  const [stakeAmount, setStakeAmount] = useState("");
  const [stakeDays, setStakeDays] = useState(String(MIN_STAKE_DAYS)); // Thời hạn stake (ngày), tối thiểu 14
  const [stakeProviders, setStakeProviders] = useState([]); // Tối đa 2 validator (NodeID) đã chọn
  const [stakeProviderSearch, setStakeProviderSearch] = useState("");
  const [showStakeDropdown, setShowStakeDropdown] = useState(false);
  const [validators, setValidators] = useState([]); // Danh sách validator lấy từ P-Chain RPC
  const [loadingValidators, setLoadingValidators] = useState(false);
  const [claimableStakingReward, setClaimableStakingReward] = useState("0"); // Reward staking đang chờ claim (cộng về Main Wallet)
  const stakeDropdownRef = useRef(null);

  const [showQR, setShowQR] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showNetworkModal, setShowNetworkModal] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [walletType, setWalletType] = useState("");
  const [customEthersProvider, setCustomEthersProvider] = useState(null);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isSwapOpen, setIsSwapOpen] = useState(false);
  const [quoteIndex, setQuoteIndex] = useState(0);

  // --- Trạng thái kiểm tra MetaMask đã có mạng Flare Mainnet hay chưa (dùng khi CHƯA connect) ---
  const [isFlrNetworkAdded, setIsFlrNetworkAdded] = useState(true); // mặc định true để tránh hiện nhầm nút trước khi kiểm tra xong

  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatCurrentTime = useCallback((date) => {
    const pad = (n) => n.toString().padStart(2, '0');
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
  }, []);

  const dropdownRef = useRef(null);
  const prices = useCryptoPrices();

  const toUSD = useCallback((amt) => `$${(Number(amt) * prices.flr).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, [prices.flr]);
  const formatBalance = useCallback((amt) => {
    return Number(amt).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }, []);

  const getProvider = useCallback(() => {
    if (walletType === "metamask" && window.ethereum) return new ethers.BrowserProvider(window.ethereum);
    if (walletType === "walletconnect" && customEthersProvider) return customEthersProvider;
    return null;
  }, [walletType, customEthersProvider]);

  // --- LẤY PROVIDER EIP-1193 THÔ (KHÔNG QUA ETHERS) ĐỂ DÙNG CHO FLARE-TX-SDK ---
  // SDK @flarenetwork/flare-tx-sdk cần provider dạng EIP-1193 gốc (window.ethereum hoặc provider của WalletConnect),
  // không phải ethers.BrowserProvider đã bọc lại.
  const getEip1193Provider = useCallback(() => {
    if (walletType === "metamask" && window.ethereum) return window.ethereum;
    if (walletType === "walletconnect") {
      try { return modal.getWalletProvider(); } catch (e) { return null; }
    }
    return null;
  }, [walletType]);

  // --- KHỞI TẠO WALLET CỦA FLARE-TX-SDK (DÙNG CHUNG CHO MỌI THAO TÁC P-CHAIN) ---
  const getPChainWallet = useCallback(async () => {
    const rawProvider = getEip1193Provider();
    if (!rawProvider) throw new Error("Chưa kết nối ví hoặc ví không hỗ trợ P-Chain");
    const controller = new EIP1193WalletController(rawProvider);
    const wallet = await controller.getActiveWallet();
    return wallet;
  }, [getEip1193Provider]);

  // --- LẤY ĐỊA CHỈ P-CHAIN THẬT (SUY RA TỪ CÙNG PUBLIC KEY VỚI VÍ ĐANG DÙNG) + SỐ DƯ P-CHAIN ---
  const initPChain = useCallback(async () => {
    try {
      setStatus("⏳ Đang lấy địa chỉ P-Chain (cần ký xác nhận trên ví)...");
      const wallet = await getPChainWallet();
      const publicKey = await wallet.getPublicKey();
      const cAddress = await wallet.getCAddress();
      setPChainPublicKey(publicKey);
      setPChainAddress(flrNetwork.getPAddress(publicKey));
      const balance = await flrNetwork.getBalance(publicKey);
      setPChainBalance(ethers.formatEther(balance.availableOnP.toString()));
      setStakedAmount(ethers.formatEther(balance.stakedOnP.toString()));
      // Reward staking được tính theo địa chỉ C-Chain (Main Wallet), không phải P-Chain
      const claimable = await flrNetwork.getClaimableStakingReward(cAddress).catch(() => 0n);
      setClaimableStakingReward(ethers.formatEther(claimable.toString()));
      setStatus("✅ Đã lấy địa chỉ P-Chain thành công!");
    } catch (e) {
      setStatus(`❌ Lỗi lấy địa chỉ P-Chain: ${getErrMsg(e)}`);
    }
  }, [getPChainWallet]);

  // --- LÀM MỚI SỐ DƯ P-CHAIN (GỌI LẠI SAU MỖI GIAO DỊCH NẠP/STAKE) ---
  const refreshPChainBalance = useCallback(async () => {
    if (!pChainPublicKey) return;
    try {
      const balance = await flrNetwork.getBalance(pChainPublicKey);
      setPChainBalance(ethers.formatEther(balance.availableOnP.toString()));
      setStakedAmount(ethers.formatEther(balance.stakedOnP.toString()));
    } catch (e) { console.error(e); }
  }, [pChainPublicKey]);

  // --- LẤY DANH SÁCH VALIDATOR THẬT TỪ P-CHAIN RPC (platform.getCurrentValidators) ---
  // + GHÉP TÊN PROVIDER TỪ FILE CHÍNH THỨC CỦA FLARE FOUNDATION (nodeID -> tên) ĐỂ NGƯỜI DÙNG BIẾT ĐÓ LÀ AI
  const fetchValidators = useCallback(async () => {
    setLoadingValidators(true);
    try {
      const [rpcRes, csvRes] = await Promise.all([
        fetch(P_CHAIN_RPC, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            method: "platform.getCurrentValidators",
            params: { subnetID: PRIMARY_SUBNET_ID },
            id: 1
          })
        }),
        // File chính thức của Flare Foundation, host trên raw.githubusercontent.com (cho phép gọi từ trình duyệt)
        fetch("https://raw.githubusercontent.com/flare-foundation/reward-scripts/main/ftso-address.csv").catch(() => null)
      ]);

      // --- Parse CSV: "TênProvider,0xĐịaChỉ,NodeID-xxxxx,..." -> map nodeID -> tên ---
      const nodeNameMap = {};
      if (csvRes && csvRes.ok) {
        const csvText = await csvRes.text();
        csvText.split("\n").forEach(line => {
          const cols = line.split(",");
          if (cols.length >= 3 && cols[2]?.trim().startsWith("NodeID-")) {
            nodeNameMap[cols[2].trim()] = cols[0].trim();
          }
        });
      }

      const data = await rpcRes.json();
      const list = (data?.result?.validators || [])
        .filter(v => v.connected)
        .map(v => {
          // LƯU Ý: response RPC của Flare KHÔNG có field "stakeAmount" — self-bond nằm ở field "weight".
          // Đơn vị trả về là nFLR (9 số thập phân), khác với C-Chain (wei, 18 số thập phân).
          const selfBondFLR = Number(v.weight || 0) / 1e9;
          const delegatedFLR = Number(v.delegatorWeight || 0) / 1e9;
          // Quy định thực tế của Flare: hạn mức nhận delegate = tối đa 15 lần self-bond, và không vượt quá 200 triệu FLR/validator
          const cap = Math.min(selfBondFLR * 15, 200_000_000);
          const freeSpace = Math.max(cap - delegatedFLR, 0);
          // Thời điểm validator hết hạn tự stake (self-bond) — mọi delegation PHẢI kết thúc TRƯỚC mốc này
          const endTimeUnix = Number(v.endTime || 0);
          const daysUntilEnd = endTimeUnix > 0 ? Math.floor((endTimeUnix - Date.now() / 1000) / 86400) : null;
          return {
            nodeID: v.nodeID,
            name: nodeNameMap[v.nodeID] || null, // null nếu validator không đăng ký tên (chỉ chạy node, không phải FTSO provider)
            uptime: Number(v.uptime),
            delegationFee: Number(v.delegationFee),
            selfBondFLR,
            delegatedFLR,
            freeSpace, // Số FLR validator còn có thể nhận thêm trước khi bị "over delegated"
            endTimeUnix, // Unix timestamp (giây) lúc validator hết hạn self-bond
            daysUntilEnd, // Số ngày còn lại trước khi validator hết hạn (làm tròn xuống)
          };
        })
        .sort((a, b) => (b.name ? 1 : 0) - (a.name ? 1 : 0) || b.freeSpace - a.freeSpace); // Ưu tiên có tên + còn nhiều hạn mức
      setValidators(list);
      return list; // Trả về luôn để chỗ gọi (vd: handleStakeFLR) dùng ngay số liệu mới nhất, không phải chờ React state cập nhật
    } catch (e) {
      console.error(e);
      setStatus("❌ Không lấy được danh sách validator, vui lòng thử lại");
      return null;
    } finally {
      setLoadingValidators(false);
    }
  }, []);

  const rewardRef = useRef(balances.reward);
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

  // --- Kiểm tra xem MetaMask hiện đang ở mạng Flare Mainnet hay không, kể cả khi CHƯA kết nối ví ---
  // Lưu ý: MetaMask không có API để hỏi "chain X đã được add chưa" nếu ví chưa từng switch sang chain đó.
  // Cách xấp xỉ tốt nhất: kiểm tra chainId hiện tại của MetaMask (không cần cấp quyền / không cần connect).
  useEffect(() => {
    if (!window.ethereum) return;
    let isMounted = true;

    const checkFlrNetwork = async () => {
      try {
        const chainId = await window.ethereum.request({ method: "eth_chainId" });
        if (isMounted) setIsFlrNetworkAdded(chainId === "0xe");
      } catch (e) {
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

  const refreshData = useCallback(async (addr, pda, explicitProvider = null) => {
    if (!addr || !pda) return;
    const p = explicitProvider || getProvider();
    if (!p) return;
    try {
      let activated = false;
      try {
        const pdaContract = new ethers.Contract(pda, ["function owner() view returns (address)"], p);
        const pdaOwner = await pdaContract.owner();
        activated = (pdaOwner.toLowerCase() === addr.toLowerCase());
      } catch (e) { activated = false; }

      const wnat = new ethers.Contract(WNAT, ["function balanceOf(address) view returns (uint256)", "function delegatesOf(address) view returns (address[], uint256[], uint256, uint256)"], p);
      const rew = new ethers.Contract(REWARD_MANAGER, ["function getStateOfRewards(address) view returns (tuple(uint24, bytes20, uint120, uint8, bool)[][])"], p);
      const usdt0Contract = new ethers.Contract(USDT0_ADDRESS, ["function balanceOf(address) view returns (uint256)"], p);
      const usdtContract = new ethers.Contract(USDT_ADDRESS, ["function balanceOf(address) view returns (uint256)"], p);

      const [f, w, pw, rewardStates, usdt0Raw, usdtRaw] = await Promise.all([
        p.getBalance(addr),
        wnat.balanceOf(addr),
        wnat.balanceOf(pda),
        rew.getStateOfRewards(pda).catch(() => []),
        usdt0Contract.balanceOf(addr).catch(() => 0n),
        usdtContract.balanceOf(addr).catch(() => 0n)
      ]);
      const del = await wnat.delegatesOf(pda).catch(() => [[], [], 0n, 0n]);

      let totalRewardWei = 0n;
      if (Array.isArray(rewardStates)) {
        rewardStates.forEach(epochArray => {
          if (Array.isArray(epochArray)) epochArray.forEach(state => { totalRewardWei += BigInt(state[2]); });
        });
      }

      setIsActivated(activated);
      setBalances({ flr: ethers.formatEther(f), wflr: ethers.formatEther(w), pdaWflr: ethers.formatEther(pw), reward: ethers.formatEther(totalRewardWei) });
      setUsdt0Balance(ethers.formatUnits(usdt0Raw, 6));
      setUsdtBalance(ethers.formatUnits(usdtRaw, 6));
      const [addresses, bips] = del;
      const currentDels = [];
      if (addresses && addresses.length > 0) {
        addresses.forEach((delegateAddr, i) => {
          if (delegateAddr !== ethers.ZeroAddress && bips[i] > 0n) {
            const pInfo = PROVIDERS.find(prov => prov.address.toLowerCase() === delegateAddr.toLowerCase());
            currentDels.push({ name: pInfo ? pInfo.name : `${delegateAddr.slice(0, 6)}...`, addr: delegateAddr, pct: Number(bips[i]) / 100 });
          }
        });
      }
      setDelegations(currentDels);
    } catch (e) { console.error(e); }
  }, [getProvider]);

  const disconnect = useCallback(async () => {
    if (walletType === "walletconnect") { try { await modal.disconnect(); } catch (e) {} }
    setAccount(""); setPdaAddress(""); setWalletType(""); setCustomEthersProvider(null); setIsActivated(false);
    setBalances({ flr: "0", wflr: "0", pdaWflr: "0", reward: "0" });
    setUsdt0Balance("0"); setUsdtBalance("0");
    setDelegations([]); setStatus("Đã ngắt kết nối");
    // Reset toàn bộ state P-Chain khi ngắt kết nối
    setPChainPublicKey(""); setPChainAddress(""); setPChainBalance("0"); setStakedAmount("0");
    setStakeProviders([]); setStakeAmount(""); setClaimableStakingReward("0");
  }, [walletType]);

  useEffect(() => {
    if (walletType !== "metamask" || !window.ethereum) return;
    const handleAccountsChanged = async (newAccs) => {
      if (newAccs.length === 0) disconnect();
      else {
        const addr = newAccs[0];
        setAccount(addr);
        const p = new ethers.BrowserProvider(window.ethereum);
        const csm = new ethers.Contract(CLAIM_SETUP_MANAGER, ["function accountToDelegationAccount(address) view returns (address)"], p);
        const pda = await csm.accountToDelegationAccount(addr);
        setPdaAddress(pda);
        refreshData(addr, pda, p);
      }
    };
    const handleChainChanged = () => window.location.reload();
    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);
    return () => {
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum.removeListener("chainChanged", handleChainChanged);
    };
  }, [walletType, refreshData, disconnect]);

  useEffect(() => {
    let blockTimeOffset = 0;
    let isMounted = true;
    let timerInterval;
    let syncInterval;

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
          blockTimeOffset = (Number(block.timestamp) * 1000) - localTimeAtBlock;
          updateTimerUI();
        }
      } catch (error) {
        console.error("Lỗi đồng bộ thời gian blockchain:", error);
      }
    };

    const updateTimerUI = () => {
      const currentNetworkSeconds = Math.floor((Date.now() + blockTimeOffset) / 1000);
      const currentReward = Number(rewardRef.current) || 0;

      if (currentReward > 0) {
        setTimeLeft(0);
      } else {
        const FLARE_EPOCH_ANCHOR = 1672945200;

        let timeElapsedSinceAnchor = currentNetworkSeconds - FLARE_EPOCH_ANCHOR;
        if (timeElapsedSinceAnchor < 0) {
          timeElapsedSinceAnchor = 0;
        }

        const timeElapsedInCycle = timeElapsedSinceAnchor % CYCLE_SECONDS;
        const timeRemaining = CYCLE_SECONDS - timeElapsedInCycle;

        setTimeLeft(timeRemaining);
      }
    };

    syncBlockTime();
    timerInterval = setInterval(updateTimerUI, 1000);
    syncInterval = setInterval(syncBlockTime, 3 * 60 * 1000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncBlockTime();
      }
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

    const interval = setInterval(() => {
      setQuoteIndex((prev) => (prev + 1) % 5);
    }, 5000);

    return () => clearInterval(interval);
  }, [status]);

  const ensureFlareNetwork = async () => {
    if (walletType === "walletconnect") return true;
    if (!window.ethereum) return false;
    try {
      const chainId = await window.ethereum.request({ method: "eth_chainId" });
      if (chainId !== "0xe") {
        setShowNetworkModal(true);
        return false;
      }
      return true;
    } catch (err) { return false; }
  };

  const handleSwitchNetwork = async () => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0xe" }] });
      setShowNetworkModal(false);
    } catch (err) {
      if (err.code === 4902) {
        try {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [{ chainId: "0xe", chainName: FLARE_PARAMS.chainName, nativeCurrency: FLARE_PARAMS.nativeCurrency, rpcUrls: FLARE_PARAMS.rpcUrls, blockExplorerUrls: FLARE_PARAMS.blockExplorerUrls }],
          });
          setShowNetworkModal(false);
        } catch (e) { console.error(e); }
      }
    }
  };

  // --- Thêm mạng Flare Mainnet vào MetaMask, dùng cho nút hiện ở màn hình CHƯA kết nối ví ---
  const handleAddFlareNetwork = async () => {
    if (!window.ethereum) return alert("Cài MetaMask trước!");
    try {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: "0xe",
          chainName: FLARE_PARAMS.chainName,
          nativeCurrency: FLARE_PARAMS.nativeCurrency,
          rpcUrls: FLARE_PARAMS.rpcUrls,
          blockExplorerUrls: FLARE_PARAMS.blockExplorerUrls
        }],
      });
      setIsFlrNetworkAdded(true);
      setStatus("✅ Đã thêm mạng Flare vào MetaMask");
    } catch (e) {
      if (e?.code === 4001) setStatus("❌ Người dùng từ chối thêm mạng");
      else setStatus("❌ Thêm mạng thất bại");
    }
  };

  const execute = async (label, action) => {
    const isOk = await ensureFlareNetwork();
    if (!isOk) return;
    try {
      setStatus(`⏳ ${label}...`);
      const tx = await action();
      if (tx) {
        await tx.wait();
        setStatus(`✅ ${label} thành công!`);
        setWalletAmount(""); setPdaAmount(""); setPendingProvider(null); setProviderSearch("");
        setTimeout(() => refreshData(account, pdaAddress), 1500);
      }
    } catch (e) {
      if (e?.code === "ACTION_REJECTED" || e?.code === 4001) setStatus("❌ Người dùng từ chối");
      else setStatus(`❌ Lỗi: ${getErrMsg(e)}`);
    }
  };

  const connectMetaMask = async () => {
    if (!window.ethereum) return alert("Cài MetaMask!");
    setWalletType("metamask"); setShowConnectModal(false);
    try {
      const chainId = await window.ethereum.request({ method: "eth_chainId" });
      if (chainId !== "0xe") return setShowNetworkModal(true);
      const accs = await window.ethereum.request({ method: "eth_requestAccounts" });
      const addr = accs[0];
      setAccount(addr);
      const p = new ethers.BrowserProvider(window.ethereum);
      const csm = new ethers.Contract(CLAIM_SETUP_MANAGER, ["function accountToDelegationAccount(address) view returns (address)"], p);
      const pda = await csm.accountToDelegationAccount(addr);
      setPdaAddress(pda);
      setStatus("✅ Đã kết nối ví MetaMask");
      setTimeout(() => refreshData(addr, pda, p), 200);
    } catch (err) { setStatus("❌ Kết nối thất bại"); }
  };

  const connectEllipal = async () => {
    try {
      setStatus("⏳ Đang kết nối Web3Modal...");
      setShowConnectModal(false);
      await modal.open({ view: 'Connect' });

      const checkConnection = setInterval(async () => {
        if (modal.getIsConnected()) {
          clearInterval(checkConnection);
          const p = new ethers.BrowserProvider(modal.getWalletProvider());
          const signer = await p.getSigner();
          const addr = await signer.getAddress();
          setWalletType("walletconnect"); setCustomEthersProvider(p); setAccount(addr);

          const csm = new ethers.Contract(CLAIM_SETUP_MANAGER, ["function accountToDelegationAccount(address) view returns (address)"], p);
          const pda = await csm.accountToDelegationAccount(addr);
          setPdaAddress(pda);
          setStatus("✅ Đã kết nối Ellipal thành công!");
          setTimeout(() => refreshData(addr, pda, p), 200);
        }
      }, 1000);
    } catch (e) { setStatus("❌ Kết nối Ellipal thất bại"); }
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text); setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenExplorer = (addr) => addr && window.open(`${FLARE_PARAMS.blockExplorerUrls[0]}address/${addr}`, "_blank", "noopener,noreferrer");

  const handleEnablePDA = () => execute("Kích hoạt PDA", async () => {
    const s = await getProvider().getSigner();
    return new ethers.Contract(CLAIM_SETUP_MANAGER, ["function enableDelegationAccount() external returns (address)"], s).enableDelegationAccount();
  });

  // --- Rút thẳng từ PDA về Main Wallet dưới dạng FLR (native) ---
  // FIX: trước đây hàm này không kiểm tra pdaAmount trước khi mở ví ký, nên bấm nút khi ô trống/0
  // vẫn cho ký giao dịch vô nghĩa. Giờ chặn sớm + báo lỗi rõ ràng, và kiểm tra không vượt số dư PDA.
  const handleWithdrawPDA = () => {
    const amt = Number(pdaAmount || 0);
    if (amt <= 0) { setStatus("❌ Vui lòng nhập số lượng hợp lệ trước khi rút PDA"); return; }
    if (amt > Number(balances.pdaWflr)) { setStatus("❌ Số dư PDA không đủ"); return; }
    return execute("Rút PDA (về FLR)", async () => {
      const s = await getProvider().getSigner();
      const val = ethers.parseEther(pdaAmount);
      // Bước 1: Rút WFLR từ PDA về Main Wallet
      const csm = new ethers.Contract(CLAIM_SETUP_MANAGER, ["function withdraw(uint256) external"], s);
      const withdrawTx = await csm.withdraw(val);
      await withdrawTx.wait();
      // Bước 2: Unwrap ngay số WFLR vừa nhận thành FLR tại Main Wallet
      const w = new ethers.Contract(WNAT, ["function withdraw(uint256)"], s);
      return w.withdraw(val);
    });
  };

  const handleClaim = () => execute("Nhận thưởng", async () => {
    const p = getProvider();
    const s = await p.getSigner();
    const r = new ethers.Contract(REWARD_MANAGER, ["function claim(address,address,uint24,bool,tuple(bytes32[],tuple(uint24,bytes20,uint120,uint8))[])", "function getRewardEpochIdsWithClaimableRewards() view returns (uint24,uint24)"], s);
    const [, end] = await r.getRewardEpochIdsWithClaimableRewards();
    return await r.claim(pdaAddress, pdaAddress, end, true, []);
  });

  // --- Wrap / Unwrap ---
  // FIX: không có kiểm tra walletAmount trước đây; giờ chặn số 0/rỗng và số vượt số dư khả dụng.
  const handleWrap = (isWrap) => {
    const amt = Number(walletAmount || 0);
    if (amt <= 0) { setStatus("❌ Vui lòng nhập số lượng hợp lệ trước khi Wrap/Unwrap"); return; }
    const maxAvail = isWrap ? Number(balances.flr) : Number(balances.wflr);
    if (amt > maxAvail) { setStatus(`❌ Số dư ${isWrap ? "FLR" : "WFLR"} không đủ`); return; }
    return execute(isWrap ? "Wrap" : "Unwrap", async () => {
      const s = await getProvider().getSigner();
      const w = new ethers.Contract(WNAT, ["function deposit() payable", "function withdraw(uint256)"], s);
      const val = ethers.parseEther(walletAmount);
      return isWrap ? w.deposit({ value: val }) : w.withdraw(val);
    });
  };

  // --- Nạp thẳng từ Main Wallet (FLR) vào PDA ---
  // FIX: không có kiểm tra walletAmount trước đây; giờ chặn số 0/rỗng và số vượt số dư Main Wallet.
  const handleToPDA = () => {
    const amt = Number(walletAmount || 0);
    if (amt <= 0) { setStatus("❌ Vui lòng nhập số lượng FLR hợp lệ trước khi nạp vào PDA"); return; }
    if (amt > Number(balances.flr)) { setStatus("❌ Số dư Main Wallet không đủ"); return; }
    return execute("Nạp PDA (Wrap + Chuyển)", async () => {
      const s = await getProvider().getSigner();
      const val = ethers.parseEther(walletAmount);
      const w = new ethers.Contract(WNAT, ["function deposit() payable", "function transfer(address,uint256)"], s);
      // Bước 1: Wrap FLR -> WFLR ngay từ Main Wallet
      const wrapTx = await w.deposit({ value: val });
      await wrapTx.wait();
      // Bước 2: Chuyển thẳng số WFLR vừa wrap sang PDA
      return w.transfer(pdaAddress, val);
    });
  };

  const handleDelegate = (target, pct = 50) => execute(pct === 0 ? "Hủy" : "Ủy quyền", async () => {
    const s = await getProvider().getSigner();
    return new ethers.Contract(CLAIM_SETUP_MANAGER, ["function delegate(address,uint256) external"], s).delegate(target, pct * 100);
  });

  const handleUndelegateAll = () => execute("Hủy toàn bộ", async () => {
    const s = await getProvider().getSigner();
    return new ethers.Contract(CLAIM_SETUP_MANAGER, ["function undelegateAll() external"], s).undelegateAll();
  });

  const filteredProviders = useMemo(() => PROVIDERS.filter(p => p.name.toLowerCase().includes(providerSearch.toLowerCase())), [providerSearch]);

  // --- LỌC DANH SÁCH VALIDATOR THẬT (nodeID) THEO Ô TÌM KIẾM ---
  const filteredStakeProviders = useMemo(
    () => validators.filter(v =>
      v.nodeID.toLowerCase().includes(stakeProviderSearch.toLowerCase()) ||
      (v.name && v.name.toLowerCase().includes(stakeProviderSearch.toLowerCase()))
    ),
    [validators, stakeProviderSearch]
  );

  // --- Khi ví đã kết nối, tự động lấy địa chỉ P-Chain thật + danh sách validator ---
  useEffect(() => {
    if (account && walletType) {
      initPChain();
      fetchValidators();
    }
  }, [account, walletType]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- NẠP FLR TỪ MAIN WALLET VÀO PCHAIN (GIAO DỊCH THẬT: export C-Chain -> import P-Chain) ---
  const handleDepositToPChain = async () => {
    // Dùng chung ô nhập số lượng của Main Wallet (walletAmount) — cùng 1 ô cho cả nút NẠP VÀO PDA và NẠP VÀO PCHAIN
    const val = Math.floor(Number(walletAmount || 0));
    if (val <= 0) { setStatus("❌ Vui lòng nhập số lượng FLR hợp lệ"); return; }
    if (val > Number(balances.flr)) { setStatus("❌ Số dư Main Wallet không đủ"); return; }
    try {
      setStatus("⏳ Đang nạp vào Pchain (2 bước: export C-Chain, import P-Chain)...");
      const wallet = await getPChainWallet();
      await flrNetwork.transferToP(wallet, Amount.nats(val));
      setWalletAmount("");
      setStatus("✅ Nạp vào Pchain thành công!");
      setTimeout(refreshPChainBalance, 1500);
    } catch (e) {
      if (e?.code === "ACTION_REJECTED" || e?.code === 4001) setStatus("❌ Người dùng từ chối ký giao dịch");
      else setStatus(`❌ Lỗi nạp vào Pchain: ${getErrMsg(e)}`);
    }
  };

  const handleSelectStakeProvider = (validator) => {
    if (stakeProviders.length >= 2) return;
    if (stakeProviders.find(v => v.nodeID === validator.nodeID)) return;
    setStakeProviders(prev => [...prev, validator]);
    setStakeProviderSearch("");
    setShowStakeDropdown(false);
  };

  const handleRemoveStakeProvider = (nodeID) => {
    setStakeProviders(prev => prev.filter(v => v.nodeID !== nodeID));
  };

  // --- STAKE FLR TỚI TỐI ĐA 2 VALIDATOR ĐÃ CHỌN (GIAO DỊCH THẬT TRÊN P-CHAIN) ---
  // LƯU Ý QUAN TRỌNG: P-Chain staking chỉ nhận 1 NodeID mỗi giao dịch (khác với FTSO delegation ở trên
  // vốn chia % cho 2 providers trong 1 lần ký). Vì vậy khi chọn 2 validator, số FLR sẽ được CHIA ĐỀU
  // và gửi thành 2 giao dịch delegateOnP riêng biệt — MỖI giao dịch vẫn phải đạt tối thiểu 50,000 FLR
  // theo quy định thực tế của mạng Flare.
  const handleStakeFLR = async () => {
    if (stakeProviders.length === 0) { setStatus("❌ Vui lòng chọn ít nhất 1 validator"); return; }
    const totalVal = Number(stakeAmount || 0);
    const days = Number(stakeDays || 0);
    if (totalVal <= 0) { setStatus("❌ Vui lòng nhập số lượng staking hợp lệ"); return; }
    if (days < MIN_STAKE_DAYS) { setStatus(`❌ Thời hạn staking tối thiểu ${MIN_STAKE_DAYS} ngày`); return; }
    if (totalVal > Number(pChainBalance)) { setStatus("❌ Số dư Pchain không đủ, vui lòng nạp thêm"); return; }

    // Lấy lại số liệu validator MỚI NHẤT (hạn mức có thể đã bị người khác chiếm mất kể từ lúc bạn mở danh sách)
    setStatus("⏳ Đang kiểm tra lại hạn mức validator mới nhất...");
    const freshList = await fetchValidators();
    // Ghép lại thông tin mới nhất cho đúng các validator đã chọn (theo nodeID); nếu refetch lỗi thì tạm dùng số cũ
    const freshStakeProviders = stakeProviders.map(v => freshList?.find(f => f.nodeID === v.nodeID) || v);

    // Làm tròn về số nguyên FLR: số thập phân quá dài (vd bấm MAX ra "57402.690270695...") gây lỗi quy đổi
    // đơn vị trong SDK, khiến mạng từ chối với thông báo gây hiểu lầm "over delegated". Mức tối thiểu đã là
    // 50,000 FLR nên bỏ phần lẻ thập phân không ảnh hưởng gì.
    const perValidator = Math.floor(totalVal / freshStakeProviders.length);
    if (perValidator < MIN_STAKE_FLR) {
      setStatus(`❌ Mỗi validator cần tối thiểu ${MIN_STAKE_FLR.toLocaleString()} FLR (đang chia ${perValidator.toLocaleString()} FLR/validator)`);
      return;
    }

    // Kiểm tra trước hạn mức còn nhận được của từng validator (tránh phải ký ví rồi mới biết bị từ chối)
    const overCap = freshStakeProviders.find(v => v.freeSpace != null && perValidator > v.freeSpace);
    if (overCap) {
      setStatus(`❌ ${overCap.name || 'Validator'} chỉ còn nhận tối đa ${Math.floor(overCap.freeSpace).toLocaleString()} FLR ngay lúc này (hạn mức thay đổi liên tục do có người khác cũng đang delegate). Chọn validator khác hoặc giảm số lượng.`);
      return;
    }

    // Kiểm tra thời hạn stake KHÔNG được vượt quá thời hạn hoạt động còn lại (self-bond) của validator —
    // mạng sẽ từ chối nếu thời gian delegate kết thúc SAU khi validator hết hạn.
    const buffer = 6 * 60; // trừ hao vài phút cho startTime buffer bên dưới
    const tooShortValidator = freshStakeProviders.find(v => v.daysUntilEnd != null && v.daysUntilEnd * 86400 - buffer < days * 86400);
    if (tooShortValidator) {
      setStatus(`❌ ${tooShortValidator.name || 'Validator'} chỉ còn hoạt động khoảng ${tooShortValidator.daysUntilEnd} ngày nữa, không đủ cho thời hạn ${days} ngày bạn chọn. Giảm thời hạn hoặc chọn validator khác.`);
      return;
    }

    try {
      setStatus("⏳ Đang gửi lệnh Staking (cần ký từng giao dịch, đừng đóng ví giữa chừng)...");
      const wallet = await getPChainWallet();

      for (const validator of freshStakeProviders) {
        // Tính startTime NGAY TRƯỚC mỗi lần gọi (không tính 1 lần trước vòng lặp) vì mỗi validator
        // có thể mất vài chục giây để ký (đặc biệt nếu số dư Pchain nằm rải trong nhiều UTXO, ví sẽ
        // hỏi xác nhận nhiều lần). Buffer 5 phút để tránh việc lúc gửi lên mạng thì startTime đã trôi qua.
        const startTime = Math.floor(Date.now() / 1000) + 5 * 60;
        const endTime = startTime + days * 24 * 60 * 60;
        await flrNetwork.delegateOnP(wallet, Amount.nats(perValidator), validator.nodeID, startTime, endTime);
      }

      setStakeAmount("");
      setStatus("✅ Staking thành công!");
      setTimeout(refreshPChainBalance, 1500);
    } catch (e) {
      console.error("Lỗi Staking chi tiết:", e); // Mở DevTools > Console để xem đầy đủ nếu vẫn lỗi
      if (e?.code === "ACTION_REJECTED" || e?.code === 4001) setStatus("❌ Người dùng từ chối ký giao dịch");
      else if (String(e?.message).includes("over delegated")) setStatus("❌ Validator vừa bị người khác lấp đầy hạn mức ngay lúc bạn ký. Vui lòng thử lại hoặc chọn validator có hạn mức dư nhiều hơn.");
      else setStatus(`❌ Lỗi Staking: ${getErrMsg(e)} (xem Console để biết chi tiết)`);
    }
  };

  // --- CLAIM THƯỞNG STAKING ---
  // LƯU Ý: Reward staking được cộng thẳng vào MAIN WALLET (C-Chain), KHÔNG cộng vào số dư Pchain.
  // Đây là điểm khác so với "Đang staking"/"Chưa stake" ở trên (2 số đó luôn nằm bên P-Chain).
  const handleClaimStaking = async () => {
    if (Number(claimableStakingReward) <= 0) { setStatus("❌ Chưa có thưởng Staking để claim"); return; }
    try {
      setStatus("⏳ Đang claim thưởng Staking...");
      const wallet = await getPChainWallet();
      await flrNetwork.claimStakingReward(wallet);
      setStatus("✅ Đã claim thưởng Staking! FLR đã về Main Wallet.");
      setClaimableStakingReward("0");
      setTimeout(() => refreshData(account, pdaAddress), 1500); // refresh Main Wallet, không phải Pchain
    } catch (e) {
      if (e?.code === "ACTION_REJECTED" || e?.code === 4001) setStatus("❌ Người dùng từ chối ký giao dịch");
      else setStatus(`❌ Lỗi Claim: ${getErrMsg(e)}`);
    }
  };

  // --- RÚT FLR TỪ PCHAIN VỀ MAIN WALLET (chỉ rút được phần đã "mở khóa" = pChainBalance) ---
  // LƯU Ý: FLR đang trong "Đang staking" (stakedAmount) KHÔNG rút được cho tới khi hết thời hạn stake (endTime);
  // khi hết hạn, số đó tự chuyển về pChainBalance ("Chưa stake") — lúc đó mới bấm nút này để rút tiếp về Main Wallet.
  const handleWithdrawToMain = async () => {
    if (Number(pChainBalance) <= 0) { setStatus("❌ Không có FLR khả dụng trên Pchain để rút"); return; }
    try {
      setStatus("⏳ Đang rút về Main Wallet (export P-Chain, import C-Chain)...");
      const wallet = await getPChainWallet();
      await flrNetwork.transferToC(wallet);
      setStatus("✅ Đã rút về Main Wallet thành công!");
      setTimeout(() => { refreshPChainBalance(); refreshData(account, pdaAddress); }, 1500);
    } catch (e) {
      if (e?.code === "ACTION_REJECTED" || e?.code === 4001) setStatus("❌ Người dùng từ chối ký giao dịch");
      else setStatus(`❌ Lỗi rút về Main Wallet: ${getErrMsg(e)}`);
    }
  };

  // --- Cờ hợp lệ dùng để disable nút khi ô nhập trống/0/vượt số dư (chặn từ UI trước khi user kịp bấm) ---
  const walletAmountValid = Number(walletAmount) > 0;
  const pdaAmountValid = Number(pdaAmount) > 0;

  return (
    <div style={styles.container}>
      <style>{`
        @keyframes marquee { 0% { transform: translate(0, 0); } 100% { transform: translate(-100%, 0); } }
        @keyframes bounce { from { transform: translateY(0); } to { transform: translateY(-25px); } }
        @keyframes pulseGlow { 0% { opacity: 0.6; } 50% { opacity: 1; } 100% { opacity: 0.6; } }
      `}</style>

      {/* --- QUỐC HUY Ở ĐẦU TRANG --- */}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: '4px', marginBottom: '2px' }}>
        <img
          src={quocHuyImg}
          alt="Quốc huy"
          style={{ width: '96px', height: 'auto', filter: `drop-shadow(0 0 12px ${COLORS.PINK}55)` }}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '5px' }}>
        <button
          style={styles.helpBtn}
          onClick={() => setShowHelp(true)}
          onMouseOver={(e) => { e.currentTarget.style.boxShadow = `0 0 10px ${COLORS.PINK}`; e.currentTarget.style.background = '#222'; }}
          onMouseOut={(e) => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.background = '#161616'; }}
        >
          ? HELP
        </button>
      </div>

      {showHelp && (
        <div
          style={{
            ...styles.helpModal,
            // Ghi đè để modal neo lên ĐẦU TRANG thay vì canh giữa theo chiều dọc
            alignItems: 'flex-start',
            overflowY: 'auto',
            paddingTop: '16px',
            paddingBottom: '16px'
          }}
          onClick={() => setShowHelp(false)}
        >
          <div
            style={{
              ...styles.helpContent,
              // Ghi đè để nội dung hiển thị TOÀN BỘ, không bị cắt / không có thanh cuộn
              maxHeight: 'none',
              overflowY: 'visible',
              width: 'min(92vw, 480px)',
              maxWidth: '92vw',
              margin: '0 auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* --- QUỐC HUY Ở ĐẦU MODAL HELP --- */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '14px' }}>
              <img
                src={quocHuyImg}
                alt="Quốc huy"
                style={{ width: '84px', height: 'auto', filter: `drop-shadow(0 0 10px ${COLORS.PINK}55)` }}
              />
            </div>
            <h3 style={{ margin: '0 0 10px 0', textAlign: 'center', color: '#fff', fontSize: '15px' }}>HƯỚNG DẪN ỦY QUYỀN FLR</h3>
            <p style={{ fontSize: '11px', textAlign: 'center', color: COLORS.AMBER, marginBottom: '15px', fontStyle: 'italic' }}>Tham gia chứng thực thông tin giá cả để kiếm lời</p>
            <div style={styles.stepTitle}>Bước 1: Kết nối ví</div><div style={styles.stepText}>• Bấm "KẾT NỐI VÍ CỦA BẠN" và ký giao dịch.</div>
            <div style={styles.stepTitle}>Bước 2: Nạp thẳng vào PDA</div><div style={styles.stepText}>• Nhập số FLR rồi bấm "⚡ NẠP THẲNG VÀO PDA" — hệ thống tự Wrap và chuyển WFLR vào PDA giúp bạn, không cần bấm Wrap riêng.</div>
            <div style={styles.stepTitle}>Bước 3: Ủy quyền (Delegation)</div><div style={styles.stepText}>• Chọn 2 providers để Delegate.</div>
            <div style={styles.stepTitle}>Bước 4: Nhận thưởng </div><div style={styles.stepText}>• Mỗi 3,5 ngày bấm "CLAIM" để nhận thưởng.</div>
            <div style={styles.stepTitle}>Bước 5: Rút về Main Wallet</div><div style={styles.stepText}>• Trong PDA, bấm "⤺ RÚT FLR VỀ MAIN WALLET" — hệ thống tự Unwrap và trả về FLR, không cần bấm Unwrap riêng.</div>
            <div style={styles.stepTitle}>Wrap / Unwrap riêng</div><div style={styles.stepText}>• Chỉ dùng khi bạn muốn giữ WFLR trong Main Wallet cho mục đích khác — không cần thiết cho việc nạp/rút PDA.</div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '18px 0 12px' }}>
              <div style={{ flex: 1, height: 1, background: '#222' }} />
              <span style={{ fontSize: 10, color: STAKE_COLOR, letterSpacing: '1px', fontWeight: 'bold' }}>STAKING FLR (P-CHAIN)</span>
              <div style={{ flex: 1, height: 1, background: '#222' }} />
            </div>

            <div style={{ ...styles.stepTitle, color: STAKE_COLOR }}>Bước 1: Lấy địa chỉ P-Chain</div>
            <div style={styles.stepText}>• Bấm "🔑 LẤY ĐỊA CHỈ P-CHAIN" và ký xác nhận (chỉ cần làm 1 lần).</div>

            <div style={{ ...styles.stepTitle, color: STAKE_COLOR }}>Bước 2: Nạp FLR vào P-Chain</div>
            <div style={styles.stepText}>• Ở khối Main Wallet, nhập số FLR rồi bấm "⇄ NẠP VÀO PCHAIN" — hệ thống tự chuyển FLR từ C-Chain sang P-Chain.</div>

            <div style={{ ...styles.stepTitle, color: STAKE_COLOR }}>Bước 3: Chọn validator</div>
            <div style={styles.stepText}>• Chọn tối đa 2 validator từ danh sách. Mỗi validator cần tối thiểu {MIN_STAKE_FLR.toLocaleString()} FLR; chọn 2 validator sẽ tự chia đều số FLR staking cho 2 giao dịch riêng biệt.</div>

            <div style={{ ...styles.stepTitle, color: STAKE_COLOR }}>Bước 4: Nhập số lượng & thời hạn</div>
            <div style={styles.stepText}>• Nhập số FLR muốn staking và thời hạn (tối thiểu {MIN_STAKE_DAYS} ngày), rồi bấm "🔒 STAKING FLR" và ký từng giao dịch.</div>

            <div style={{ ...styles.stepTitle, color: STAKE_COLOR }}>Bước 5: Nhận & rút thưởng</div>
            <div style={styles.stepText}>• Thưởng staking sẽ cộng thẳng vào Main Wallet — bấm "🎁 CLAIM" khi có thưởng. Sau khi hết hạn stake, số FLR quay lại mục "Chưa stake" — bấm "🔙 RÚT VỀ MAIN WALLET" để rút về ví chính.</div>

            <GlowButton onClick={() => setShowHelp(false)} baseColor={COLORS.PINK} customStyle={{ width: '100%', padding: '12px', marginTop: '20px' }}>ĐÃ HIỂU</GlowButton>
          </div>
        </div>
      )}

      {showNetworkModal && (
        <div style={styles.networkModal}>
          <div style={{ background: COLORS.SURFACE, border: `1px solid ${COLORS.PINK}`, padding: '30px', borderRadius: '24px', maxWidth: '300px' }}>
            <div style={{ fontSize: '40px', marginBottom: '15px' }}>🌐</div>
            <h3 style={{ margin: '0 0 10px 0' }}>SAI MẠNG KẾT NỐI</h3>
            <p style={{ fontSize: '13px', color: COLORS.TEXT_MUTE, marginBottom: '20px' }}>Ứng dụng yêu cầu mạng <b>Flare Mainnet</b> để hoạt động.</p>
            <GlowButton onClick={handleSwitchNetwork} baseColor={COLORS.PINK} customStyle={{ width: '100%', padding: '15px' }}>CHUYỂN SANG FLARE</GlowButton>
          </div>
        </div>
      )}

      {showConnectModal && (
        <div style={styles.networkModal} onClick={() => setShowConnectModal(false)}>
          <div style={{ background: COLORS.SURFACE, border: `1px solid ${COLORS.BORDER}`, padding: '25px', borderRadius: '24px', width: '320px' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 20px 0', fontSize: '14px', letterSpacing: '1px', color: '#fff' }}>CHỌN PHƯƠNG THỨC KẾT NỐI</h3>
            <button onClick={connectMetaMask} style={{ ...styles.btnBase, background: '#161616', color: 'white', width: '100%', padding: '14px', marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid #222' }} onMouseOver={(e) => { e.currentTarget.style.borderColor = COLORS.PINK; e.currentTarget.style.boxShadow = `0 0 10px ${COLORS.PINK}44`; }} onMouseOut={(e) => { e.currentTarget.style.borderColor = '#222'; e.currentTarget.style.boxShadow = 'none'; }}>
              <span>🦊 MetaMask (Extension)</span><span style={{ fontSize: '10px', color: COLORS.TEXT_MUTE }}>Browser</span>
            </button>
            <button onClick={connectEllipal} style={{ ...styles.btnBase, background: '#161616', color: 'white', width: '100%', padding: '14px', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid #222' }} onMouseOver={(e) => { e.currentTarget.style.borderColor = COLORS.AMBER; e.currentTarget.style.boxShadow = `0 0 10px ${COLORS.AMBER}44`; }} onMouseOut={(e) => { e.currentTarget.style.borderColor = '#222'; e.currentTarget.style.boxShadow = 'none'; }}>
              <span>📱 Ellipal App (WalletConnect)</span><span style={{ fontSize: '10px', color: COLORS.TEXT_MUTE }}>QR Code</span>
            </button>
            <div onClick={() => setShowConnectModal(false)} style={{ fontSize: '12px', color: COLORS.TEXT_MUTE, cursor: 'pointer', textDecoration: 'underline' }}>Đóng</div>
          </div>
        </div>
      )}

      {showQR && (
        <div style={styles.qrOverlay} onClick={() => setShowQR(false)}>
          <div style={styles.qrContainer} onClick={(e) => e.stopPropagation()}><QRCodeSVG value={account} size={220} /></div>
          <div style={styles.copyBadge} onClick={(e) => { e.stopPropagation(); handleCopy(account); }}>
            <span style={{ color: copied ? COLORS.PRICE_GREEN : COLORS.PINK, fontFamily: 'monospace', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{account}</span>
            <span style={{ fontSize: '14px' }}>{copied ? "✅" : "📋"}</span>
          </div>
          <div style={{ fontSize: '10px', color: COLORS.TEXT_MUTE, marginTop: '8px', marginBottom: '25px' }}>{copied ? "Địa chỉ đã được copy!" : "Click vào địa chỉ để copy"}</div>
          <GlowButton onClick={() => setShowQR(false)} baseColor={COLORS.PINK} customStyle={{ padding: '12px 40px', borderRadius: '20px' }}>ĐÓNG</GlowButton>
        </div>
      )}

      <header style={{ textAlign: 'center', marginBottom: '10px', marginTop: '5px' }}>
        <h2 style={{ color: COLORS.PINK, letterSpacing: '3px', margin: 0 }}>FLARE VN <span style={{ fontWeight: 300, color: '#fff' }}>MANAGER </span></h2>

        <div style={{
          fontSize: '18px',
          color: '#00BFFF',
          fontWeight: 'bold',
          marginTop: '4px',
          fontFamily: 'monospace',
          letterSpacing: '1px'
        }}>
          {formatCurrentTime(currentTime)}
        </div>

        {account && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '14px', flexWrap: 'wrap' }}>
            <div onClick={() => setShowQR(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#161616', padding: '6px 14px', borderRadius: '20px', border: `1px solid ${COLORS.BORDER}`, cursor: 'pointer' }}>
              <span style={{ fontSize: '12px', color: COLORS.PINK, fontWeight: 'bold' }}>{account.slice(0, 6)}...{account.slice(-4)}</span><span>📲</span>
            </div>
            <button onClick={() => handleOpenExplorer(account)} style={styles.scanBtn} onMouseOver={(e) => { e.currentTarget.style.color = COLORS.PRICE_GREEN; e.currentTarget.style.borderColor = COLORS.PRICE_GREEN; e.currentTarget.style.boxShadow = `0 0 10px ${COLORS.PRICE_GREEN}55`; }} onMouseOut={(e) => { e.currentTarget.style.color = COLORS.TEXT_MUTE; e.currentTarget.style.borderColor = COLORS.BORDER; e.currentTarget.style.boxShadow = "none"; }}>🔍 Scan</button>
            <button onClick={disconnect} style={styles.logoutBtn} onMouseOver={(e) => { e.currentTarget.style.color = COLORS.PINK; e.currentTarget.style.borderColor = COLORS.PINK; e.currentTarget.style.boxShadow = `0 0 10px ${COLORS.PINK}55`; }} onMouseOut={(e) => { e.currentTarget.style.color = COLORS.TEXT_MUTE; e.currentTarget.style.borderColor = COLORS.BORDER; e.currentTarget.style.boxShadow = "none"; }}>Logout</button>
          </div>
        )}
      </header>

      <div style={styles.tickerWrap}>
        <div style={styles.ticker}>
          <span style={{ ...styles.assetName, color: '#F7931A' }}>BTC</span><span style={styles.assetPrice}>${prices.btc.toLocaleString()}</span>
          <span style={{ ...styles.assetName, color: '#627EEA' }}>ETH</span><span style={styles.assetPrice}>${prices.eth.toLocaleString()}</span>
          <span style={{ ...styles.assetName, color: '#23292F', background: '#fff', padding: '2px 4px', borderRadius: '3px' }}>XRP</span><span style={styles.assetPrice}>${prices.xrp}</span>
          <span style={{ ...styles.assetName, color: COLORS.PINK }}>FLR</span><span style={styles.assetPrice}>${prices.flr}</span>
          <span style={{ ...styles.assetName, color: '#00ADEF' }}>SGB</span><span style={styles.assetPrice}>${prices.sgb}</span>
          <span style={{ ...styles.assetName, color: '#345D9D' }}>LTC</span><span style={styles.assetPrice}>${prices.ltc}</span>
          <span style={{ ...styles.assetName, color: '#C2A633' }}>DOGE</span><span style={styles.assetPrice}>${prices.doge}</span>
          <span style={{ ...styles.assetName, color: '#17181B', background: SOLID_GOLD, padding: '2px 4px', borderRadius: '3px' }}>CMC20</span><span style={styles.assetPrice}>${prices.cmc20}</span>
        </div>
      </div>

      {!account ? (
        <>
          <GlowButton onClick={() => setShowConnectModal(true)} baseColor={COLORS.PINK} customStyle={{ width: '100%', padding: '18px' }}>KẾT NỐI VÍ CỦA BẠN</GlowButton>

          {/* Nếu MetaMask có mặt nhưng chưa ở mạng Flare Mainnet, gợi ý thêm mạng ngay tại đây */}
          {typeof window !== "undefined" && window.ethereum && !isFlrNetworkAdded && (
            <GlowButton
              onClick={handleAddFlareNetwork}
              baseColor={SOLID_GOLD}
              textColor="black"
              customStyle={{ width: '100%', padding: '14px', marginTop: 10 }}
            >
              🌐 THÊM MẠNG FLARE MAINNET VÀO METAMASK
            </GlowButton>
          )}
        </>
      ) : (
        <>
          <section style={{ ...styles.card, border: `2px solid ${COLORS.PINK}44` }}>
            <div style={{ ...styles.label, color: COLORS.PINK }}>MAIN WALLET</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 15 }}>
              <div>
                <div style={{ fontSize: 24, fontWeight: '900', color: COLORS.PRICE_GREEN }}>
                  {formatBalance(balances.flr)} <small style={{ fontSize: 18, color: COLORS.PINK }}> FLR</small>
                </div>
                <div style={{ fontSize: 12, color: COLORS.TEXT_MUTE }}>{toUSD(balances.flr)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 24, fontWeight: '900', color: COLORS.PRICE_GREEN }}>
                  {formatBalance(balances.wflr)} <small style={{ fontSize: 18, color: COLORS.PINK }}> WFLR</small>
                </div>
                <div style={{ fontSize: 12, color: COLORS.TEXT_MUTE }}>{toUSD(balances.wflr)}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input type="number" value={walletAmount} onChange={(e) => setWalletAmount(e.target.value)} style={styles.input} placeholder="Nhập số lượng FLR..." />
              <GlowButton onClick={() => setWalletAmount(balances.flr)} baseColor={COLORS.PINK}>MAX</GlowButton>
            </div>

            {/* Cả 2 nút dùng chung nền hồng đặc trưng; chỉ viền + chữ + hiệu ứng /// đổi màu theo đích đến (PDA: vàng · Pchain: xanh) */}
            {/* FIX: cả 2 nút giờ bị disabled khi chưa nhập số lượng hợp lệ, tránh mở ví ký giao dịch rỗng */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <button
                onClick={handleToPDA}
                disabled={!walletAmountValid}
                style={{
                  ...styles.btnBase, width: '100%', padding: '15px',
                  background: COLORS.PINK, color: 'white',
                  border: `3px solid ${SOLID_GOLD}`, position: 'relative', overflow: 'hidden',
                  ...(!walletAmountValid ? { opacity: 0.5, cursor: 'not-allowed' } : {})
                }}
                onMouseOver={(e) => {
                  if (!walletAmountValid) return;
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = SOLID_GOLD;
                  e.currentTarget.style.boxShadow = `0 0 15px ${SOLID_GOLD}88`;
                }}
                onMouseOut={(e) => {
                  if (!walletAmountValid) return;
                  e.currentTarget.style.background = COLORS.PINK;
                  e.currentTarget.style.color = "white";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                <span style={{ position: 'absolute', top: -6, right: 6, display: 'flex', fontSize: 34, fontWeight: '900', color: SOLID_GOLD, opacity: 0.85, lineHeight: 1, letterSpacing: '-6px' }}>///</span>
                <span style={{ position: 'relative', zIndex: 1 }}>⚡ NẠP VÀO PDA</span>
              </button>
              <button
                onClick={handleDepositToPChain}
                disabled={!walletAmountValid}
                style={{
                  ...styles.btnBase, width: '100%', padding: '15px',
                  background: COLORS.PINK, color: 'white',
                  border: `3px solid ${STAKE_COLOR}`, position: 'relative', overflow: 'hidden',
                  ...(!walletAmountValid ? { opacity: 0.5, cursor: 'not-allowed' } : {})
                }}
                onMouseOver={(e) => {
                  if (!walletAmountValid) return;
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = STAKE_COLOR;
                  e.currentTarget.style.boxShadow = `0 0 15px ${STAKE_COLOR}88`;
                }}
                onMouseOut={(e) => {
                  if (!walletAmountValid) return;
                  e.currentTarget.style.background = COLORS.PINK;
                  e.currentTarget.style.color = "white";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                <span style={{ position: 'absolute', top: -6, right: 6, display: 'flex', fontSize: 34, fontWeight: '900', color: STAKE_COLOR, opacity: 0.85, lineHeight: 1, letterSpacing: '-6px' }}>///</span>
                <span style={{ position: 'relative', zIndex: 1 }}>⇄ NẠP VÀO PCHAIN</span>
              </button>
            </div>
            <div style={{ fontSize: 10, color: COLORS.TEXT_MUTE, textAlign: 'center', marginBottom: 14 }}>
              <span style={{ color: SOLID_GOLD }}>/// PDA</span>: Tự động Wrap FLR {'->'} WFLR và chuyển vào PDA &nbsp;·&nbsp; <span style={{ color: STAKE_COLOR }}>/// Pchain</span>: Chuyển FLR sang P-Chain để staking</div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ flex: 1, height: 1, background: '#222' }} />
              <span style={{ fontSize: 9, color: COLORS.TEXT_MUTE, letterSpacing: '1px', whiteSpace: 'nowrap' }}>THAO TÁC RIÊNG (KHÔNG BẮT BUỘC)</span>
              <div style={{ flex: 1, height: 1, background: '#222' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
              <GlowButton onClick={() => handleWrap(true)} disabled={!walletAmountValid} baseColor={COLORS.PINK} customStyle={{ padding: '10px', fontSize: 12 }}>WRAP</GlowButton>
              <GlowButton onClick={() => handleWrap(false)} disabled={!walletAmountValid} baseColor={COLORS.PINK} customStyle={{ padding: '10px', fontSize: 12 }}>UNWRAP</GlowButton>
            </div>

            {/* --- SỐ DƯ USD₮0 VÀ USDT HIỂN THỊ SONG SONG --- */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: '12px' }}>
              <div style={{
                background: "rgba(0, 0, 0, 0.3)",
                padding: "10px 8px",
                borderRadius: "14px",
                border: `1px dashed ${COLORS.PRICE_GREEN}44`,
                textAlign: "center"
              }}>
                <div style={{ fontSize: "10px", color: COLORS.TEXT_MUTE, letterSpacing: "1px", marginBottom: "4px", fontWeight: "bold" }}>
                  USD₮0 BALANCE
                </div>
                <div style={{ fontSize: "19px", fontWeight: "900", color: COLORS.PRICE_GREEN }}>
                  {formatBalance(usdt0Balance)}
                </div>
                <div style={{ fontSize: "11px", color: COLORS.PINK, fontWeight: "bold" }}>USD₮0</div>
              </div>
              <div style={{
                background: "rgba(0, 0, 0, 0.3)",
                padding: "10px 8px",
                borderRadius: "14px",
                border: `1px dashed ${COLORS.PRICE_GREEN}44`,
                textAlign: "center"
              }}>
                <div style={{ fontSize: "10px", color: COLORS.TEXT_MUTE, letterSpacing: "1px", marginBottom: "4px", fontWeight: "bold" }}>
                  USDT BALANCE
                </div>
                <div style={{ fontSize: "19px", fontWeight: "900", color: COLORS.PRICE_GREEN }}>
                  {formatBalance(usdtBalance)}
                </div>
                <div style={{ fontSize: "11px", color: COLORS.PINK, fontWeight: "bold" }}>USDT</div>
              </div>
            </div>

            {/* --- SWAP TỰ DO GIỮA 3 TOKEN: FLR / USD₮0 / USDT (chọn cặp & chiều ngay trong modal) --- */}
            <GlowButton
              onClick={() => setIsSwapOpen(true)}
              baseColor={COLORS.PRICE_GREEN}
              textColor="black"
              hoverTextColor={COLORS.PRICE_GREEN}
              customStyle={{ width: '100%' }}
            >
              🗘 SWAP FLR / USD₮0 / USDT
            </GlowButton>
          </section>

          <section style={{ ...styles.card, border: `2px solid ${STAKE_COLOR}44` }}>
            <div style={{ ...styles.label, color: STAKE_COLOR }}>STAKING FLR (P-CHAIN)</div>

            {pChainAddress ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0a0a0a', padding: '8px 12px', borderRadius: '10px', fontSize: '10px', fontFamily: 'monospace', cursor: 'pointer', border: '1px solid #222', marginTop: '-6px', marginBottom: '15px' }} onClick={() => handleCopy(pChainAddress)} title="Click to copy">
                <span style={{ opacity: 0.7, color: STAKE_COLOR }}>P-Chain:</span>
                <span style={{ fontWeight: 'bold', color: STAKE_COLOR }}>{pChainAddress.slice(0, 12)}...{pChainAddress.slice(-6)} 📋</span>
              </div>
            ) : (
              <div style={{ textAlign: 'center', marginBottom: 15 }}>
                <div style={{ fontSize: 11, color: COLORS.TEXT_MUTE, marginBottom: 10, fontStyle: 'italic' }}>
                  Chưa có địa chỉ P-Chain. Cần ký 1 lần để suy ra địa chỉ từ public key ví của bạn.
                </div>
                <GlowButton onClick={initPChain} baseColor={STAKE_COLOR} textColor="black" customStyle={{ width: '100%', padding: '12px', fontSize: 12 }}>
                  🔑 LẤY ĐỊA CHỈ P-CHAIN
                </GlowButton>
              </div>
            )}

            <div style={{ textAlign: 'center', marginBottom: 15 }}>
              <div style={{ fontSize: 12, color: COLORS.TEXT_MUTE, marginBottom: 4 }}>Đang staking</div>
              <div style={{ fontSize: 29, fontWeight: '900', color: COLORS.PRICE_GREEN }}>
                {formatBalance(stakedAmount)} <small style={{ fontSize: 22, color: STAKE_COLOR }}> FLR</small>
              </div>
              <div style={{ fontSize: 12, color: COLORS.TEXT_MUTE, marginTop: 2 }}>{toUSD(stakedAmount)}</div>

              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'baseline', gap: 6, marginTop: 12 }}>
                <span style={{ fontSize: 11, color: COLORS.TEXT_MUTE }}>Chưa stake (Pchain):</span>
                <span style={{ fontSize: 14, fontWeight: 'bold', color: STAKE_COLOR }}>{formatBalance(pChainBalance)} FLR</span>
              </div>
            </div>

            {Number(pChainBalance) > 0 && (
              <GlowButton onClick={handleWithdrawToMain} baseColor={STAKE_COLOR} textColor="black" customStyle={{ width: '100%', padding: '10px', marginBottom: 10, fontSize: 12 }}>
                🔙 RÚT VỀ MAIN WALLET ({formatBalance(pChainBalance)} FLR)
              </GlowButton>
            )}

            {Number(claimableStakingReward) > 0 && (
              <div style={{ background: '#0a0a0a', border: `1px solid ${COLORS.PRICE_GREEN}44`, borderRadius: 10, padding: '10px 12px', marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: COLORS.TEXT_MUTE, marginBottom: 6 }}>
                  Thưởng Staking đang chờ · sẽ cộng thẳng vào <b>Main Wallet</b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 16, fontWeight: '900', color: COLORS.PRICE_GREEN }}>
                    {formatBalance(claimableStakingReward)} FLR
                  </div>
                  <GlowButton onClick={handleClaimStaking} baseColor={COLORS.PRICE_GREEN} textColor="black" customStyle={{ padding: '8px 16px', fontSize: 12 }}>
                    🎁 CLAIM
                  </GlowButton>
                </div>
              </div>
            )}

            <div style={{ fontSize: 10, color: COLORS.TEXT_MUTE, textAlign: 'center', marginBottom: 14 }}>
              💡 Nạp thêm FLR vào Pchain? Dùng nút <span style={{ color: STAKE_COLOR, fontWeight: 'bold' }}>NẠP VÀO PCHAIN</span> ở khối Main Wallet phía trên.
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ flex: 1, height: 1, background: '#222' }} />
              <span style={{ fontSize: 9, color: COLORS.TEXT_MUTE, letterSpacing: '1px', whiteSpace: 'nowrap' }}>CHỌN TỐI ĐA 2 VALIDATOR ĐỂ STAKE</span>
              <div style={{ flex: 1, height: 1, background: '#222' }} />
            </div>

            <div style={{ fontSize: 10, color: COLORS.AMBER, textAlign: 'center', marginBottom: 10, lineHeight: 1.5 }}>
              ⚠️ Mỗi validator yêu cầu tối thiểu <b>{MIN_STAKE_FLR.toLocaleString()} FLR</b>, thời hạn tối thiểu <b>{MIN_STAKE_DAYS} ngày</b>.
              Chọn 2 validator sẽ chia đều số FLR staking cho 2 giao dịch riêng biệt.
            </div>

            {stakeProviders.map((v) => (
              <div key={v.nodeID} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #222' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    background: `hsl(${(v.nodeID.charCodeAt(7) * 37) % 360}, 65%, 45%)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 'bold', color: '#fff'
                  }}>
                    {(v.name || v.nodeID.slice(7, 9)).slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: 13 }}>
                      {v.name || <span style={{ fontFamily: 'monospace', fontWeight: 'normal', color: COLORS.TEXT_MUTE }}>Validator ẩn danh</span>}
                    </div>
                    <div style={{ fontSize: 10, color: COLORS.TEXT_MUTE, fontFamily: 'monospace' }}>{v.nodeID.slice(0, 14)}... · Uptime {v.uptime.toFixed(1)}% · Phí {v.delegationFee}%</div>
                    <div style={{ fontSize: 10, color: v.freeSpace > 0 ? COLORS.PRICE_GREEN : '#ff4444' }}>Còn nhận tối đa: {Math.floor(v.freeSpace).toLocaleString()} FLR</div>
                    {v.daysUntilEnd != null && (
                      <div style={{ fontSize: 10, color: v.daysUntilEnd < Number(stakeDays) ? '#ff4444' : COLORS.TEXT_MUTE }}>
                        Validator hết hạn sau ~{v.daysUntilEnd} ngày {v.daysUntilEnd < Number(stakeDays) && '⚠️ ngắn hơn thời hạn bạn chọn'}
                      </div>
                    )}
                  </div>
                </div>
                <button onClick={() => handleRemoveStakeProvider(v.nodeID)} style={{ background: '#ff444411', border: 'none', color: '#ff4444', padding: '5px 10px', borderRadius: 8, cursor: 'pointer', transition: 'all 0.2s' }} onMouseOver={(e) => { e.currentTarget.style.boxShadow = "0 0 10px #ff444455"; e.currentTarget.style.background = "#ff444433"; }} onMouseOut={(e) => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.background = "#ff444411"; }}>✕</button>
              </div>
            ))}

            {stakeProviders.length < 2 && (
              <div ref={stakeDropdownRef} style={{ position: 'relative', marginTop: 12 }}>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <span style={{ position: 'absolute', left: 12, color: COLORS.TEXT_MUTE }}>🔍</span>
                  <input type="text" placeholder={loadingValidators ? "Đang tải validator..." : "Tìm theo tên hoặc NodeID..."} value={stakeProviderSearch} onFocus={() => setShowStakeDropdown(true)} onChange={(e) => setStakeProviderSearch(e.target.value)} style={{ ...styles.input, paddingLeft: 35, width: '100%', boxSizing: 'border-box' }} />
                </div>
                {showStakeDropdown && (
                  <div style={{ position: 'absolute', top: '110%', left: 0, right: 0, background: '#181818', borderRadius: 15, border: '1px solid #333', maxHeight: 200, overflowY: 'auto', zIndex: 100, boxShadow: '0 10px 20px rgba(0,0,0,0.5)' }}>
                    {filteredStakeProviders.filter(v => !stakeProviders.find(sp => sp.nodeID === v.nodeID)).map(v => (
                      <div key={v.nodeID} onClick={() => handleSelectStakeProvider(v)} style={{ padding: '10px 12px', fontSize: 13, borderBottom: '1px solid #222', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: v.name ? 'bold' : 'normal', color: v.name ? '#fff' : COLORS.TEXT_MUTE }}>
                            {v.name || 'Validator ẩn danh'}
                          </div>
                          <div style={{ fontSize: 10, color: COLORS.TEXT_MUTE, fontFamily: 'monospace' }}>{v.nodeID.slice(0, 20)}...</div>
                        </div>
                        <span style={{ color: COLORS.TEXT_MUTE, fontSize: 11, whiteSpace: 'nowrap', marginLeft: 8, textAlign: 'right' }}>
                          {v.uptime.toFixed(1)}% up · {v.delegationFee}% phí<br />
                          {v.daysUntilEnd != null && <span>Hết hạn: ~{v.daysUntilEnd} ngày<br /></span>}
                          <span style={{ color: v.freeSpace > 0 ? COLORS.PRICE_GREEN : '#ff4444' }}>Còn: {Math.floor(v.freeSpace).toLocaleString()} FLR</span>
                        </span>
                      </div>
                    ))}
                    {!loadingValidators && filteredStakeProviders.length === 0 && (
                      <div style={{ padding: 12, fontSize: 12, color: COLORS.TEXT_MUTE, textAlign: 'center' }}>Không tìm thấy validator</div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 14, marginBottom: 8 }}>
              <input type="number" value={stakeAmount} onChange={(e) => setStakeAmount(e.target.value)} style={styles.input} placeholder="Số lượng FLR staking..." />
              <GlowButton onClick={() => setStakeAmount(String(Math.floor(Number(pChainBalance))))} baseColor={STAKE_COLOR}>MAX</GlowButton>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <span style={{ fontSize: 11, color: COLORS.TEXT_MUTE, whiteSpace: 'nowrap' }}>Thời hạn (ngày):</span>
              <input type="number" min={MIN_STAKE_DAYS} value={stakeDays} onChange={(e) => setStakeDays(e.target.value)} style={{ ...styles.input, flex: 1 }} placeholder={`Tối thiểu ${MIN_STAKE_DAYS}`} />
            </div>
            <GlowButton
              onClick={handleStakeFLR}
              disabled={stakeProviders.length === 0 || !(Number(stakeAmount) > 0)}
              baseColor={(stakeProviders.length === 0 || !(Number(stakeAmount) > 0)) ? "transparent" : STAKE_COLOR}
              textColor={(stakeProviders.length === 0 || !(Number(stakeAmount) > 0)) ? COLORS.TEXT_MUTE : "black"}
              customStyle={{ width: '100%', padding: '15px', border: (stakeProviders.length === 0 || !(Number(stakeAmount) > 0)) ? `1px solid ${COLORS.BORDER}` : 'none' }}
            >
              🔒 STAKING FLR
            </GlowButton>
          </section>

          <section style={{ ...styles.card, border: `2px solid ${SOLID_GOLD}44` }}>
            <div style={{ ...styles.label, ...goldTextStyle }}>DELEGATION ACCOUNT (PDA)</div>
            {pdaAddress && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0a0a0a', padding: '8px 12px', borderRadius: '10px', fontSize: '10px', fontFamily: 'monospace', cursor: 'pointer', border: '1px solid #222', marginTop: '-6px', marginBottom: '15px' }} onClick={() => handleCopy(pdaAddress)} title="Click to copy">
                <span style={{ opacity: 0.7, color: SOLID_GOLD }}>Address:</span><span style={{ fontWeight: 'bold', ...goldTextStyle }}>{pdaAddress.slice(0, 10)}...{pdaAddress.slice(-8)} 📋</span>
              </div>
            )}
            {!isActivated ? (
              <div style={{ textAlign: 'center', padding: '10px 0' }}>
                <p style={{ fontSize: '12px', marginBottom: '15px', lineHeight: '1.5', ...goldTextStyle }}>Tài khoản PDA của bạn chưa được khởi tạo.<br />Vui lòng kích hoạt để bắt đầu.</p>
                <GlowButton onClick={handleEnablePDA} baseColor={SOLID_GOLD} textColor="black" customStyle={{ width: '100%', fontSize: '13px', padding: '15px' }}>⚡ KÍCH HOẠT PDA NGAY</GlowButton>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 15 }}>
                  <div style={{ fontSize: 24, fontWeight: '900', color: COLORS.PRICE_GREEN }}>
                    {formatBalance(balances.pdaWflr)} <small style={{ ...goldTextStyle, fontSize: 18 }}> WFLR</small>
                  </div>
                  <div style={{ fontSize: 12, color: COLORS.TEXT_MUTE }}>{toUSD(balances.pdaWflr)}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <input type="number" value={pdaAmount} onChange={(e) => setPdaAmount(e.target.value)} style={styles.input} placeholder="Số lượng rút..." />
                  <button
                    onClick={() => setPdaAmount(balances.pdaWflr)}
                    style={{
                      ...styles.btnBase,
                      background: goldGradientBg,
                      color: '#000',
                      fontWeight: 'bold',
                      border: `1px solid ${SOLID_GOLD}`,
                      padding: '0 16px'
                    }}
                    onMouseOver={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = SOLID_GOLD; e.currentTarget.style.boxShadow = `0 0 10px ${SOLID_GOLD}88`; }}
                    onMouseOut={(e) => { e.currentTarget.style.background = goldGradientBg; e.currentTarget.style.color = "#000"; e.currentTarget.style.boxShadow = "none"; }}
                  >
                    MAX
                  </button>
                </div>
                <button
                  onClick={handleWithdrawPDA}
                  disabled={!pdaAmountValid}
                  style={{ ...styles.btnBase, width: '100%', background: goldGradientBg, color: '#000', fontWeight: 'bold', border: `3px solid ${SOLID_GOLD}66`, marginBottom: 20, ...(!pdaAmountValid ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
                  onMouseOver={(e) => { if (!pdaAmountValid) return; e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = SOLID_GOLD; e.currentTarget.style.color = SOLID_GOLD; e.currentTarget.style.boxShadow = `0 0 15px ${SOLID_GOLD}88`; }}
                  onMouseOut={(e) => { if (!pdaAmountValid) return; e.currentTarget.style.background = goldGradientBg; e.currentTarget.style.borderColor = `${SOLID_GOLD}66`; e.currentTarget.style.color = "#000"; e.currentTarget.style.boxShadow = "none"; }}
                >⤺ RÚT FLR VỀ MAIN WALLET</button>

                <div style={{ background: 'rgba(0,0,0,0.5)', padding: '16px', borderRadius: '20px', border: `1px solid ${timeLeft > 0 ? COLORS.BORDER : COLORS.PINK + '44'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '10px', fontWeight: '800', marginBottom: '4px', ...(timeLeft > 0 ? { color: COLORS.TEXT_MUTE } : goldTextStyle) }}>
                        {timeLeft > 0 ? "NEXT REWARD CYCLE" : "UNCLAIMED REWARDS"}
                      </div>
                      <div style={{ fontSize: '20px', fontWeight: '900' }}>
                        {timeLeft > 0 ? renderCountdown(timeLeft) : <span style={{ color: COLORS.PRICE_GREEN }}>+{Number(balances.reward).toFixed(2)} FLR</span>}
                      </div>
                    </div>
                    <GlowButton
                      onClick={handleClaim}
                      disabled={Number(balances.reward) <= 0 || timeLeft > 0}
                      baseColor={timeLeft > 0 ? "transparent" : SOLID_GOLD}
                      textColor={timeLeft > 0 ? COLORS.TEXT_MUTE : 'black'}
                      customStyle={{ minWidth: '85px', border: timeLeft > 0 ? `1px solid ${COLORS.BORDER}` : 'none' }}
                    >
                      {timeLeft > 0 ? "LOCKED" : "CLAIM"}
                    </GlowButton>
                  </div>
                  <div style={{ width: '100%', height: '4px', background: '#222', borderRadius: '10px', marginTop: '12px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${Math.max(0, 100 - (timeLeft / CYCLE_SECONDS * 100))}%`,
                      height: '100%',
                      background: timeLeft > 0 ? COLORS.PINK : COLORS.PRICE_GREEN,
                      transition: 'width 1s linear'
                    }} />
                  </div>
                </div>
              </>
            )}
          </section>

          <section style={{ ...styles.card, border: `2px solid ${COLORS.PINK}44` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ ...styles.label, marginBottom: 0 }}>Delegations ({delegations.length}/2)</div>
              {delegations.length > 0 && (
                <button onClick={handleUndelegateAll} style={{ ...styles.undelegateBtn, transition: "all 0.2s" }} onMouseOver={(e) => { e.currentTarget.style.boxShadow = `0 0 10px ${COLORS.PINK}66`; e.currentTarget.style.background = `${COLORS.PINK}22`; }} onMouseOut={(e) => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.background = "transparent"; }}>UNDELEGATE ALL</button>
              )}
            </div>

            {delegations.map((d, i) => (
              <div key={d.addr || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: i === delegations.length - 1 ? 'none' : '1px solid #222' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                    background: `hsl(${(d.name.charCodeAt(0) * 37) % 360}, 65%, 45%)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 'bold', color: '#fff'
                  }}>
                    {d.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div><div style={{ fontWeight: 'bold' }}>{d.name}</div><div style={{ fontSize: 11, color: COLORS.PINK }}>{d.pct}% Power</div></div>
                </div>
                <button onClick={() => handleDelegate(d.addr, 0)} style={{ background: '#ff444411', border: 'none', color: '#ff4444', padding: '5px 10px', borderRadius: 8, cursor: 'pointer', transition: 'all 0.2s' }} onMouseOver={(e) => { e.currentTarget.style.boxShadow = "0 0 10px #ff444455"; e.currentTarget.style.background = "#ff444433"; }} onMouseOut={(e) => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.background = "#ff444411"; }}>✕</button>
              </div>
            ))}

            {delegations.length < 2 && (
              <div ref={dropdownRef} style={{ position: 'relative', marginTop: 12 }}>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <span style={{ position: 'absolute', left: 12, color: COLORS.TEXT_MUTE }}>🔍</span>
                  <input type="text" placeholder="Tìm Provider..." value={providerSearch} onFocus={() => setShowDropdown(true)} onChange={(e) => setProviderSearch(e.target.value)} style={{ ...styles.input, paddingLeft: 35, width: '100%', boxSizing: 'border-box' }} />
                </div>
                {showDropdown && (
                  <div style={{ position: 'absolute', bottom: '110%', left: 0, right: 0, background: '#181818', borderRadius: 15, border: '1px solid #333', maxHeight: 150, overflowY: 'auto', zIndex: 100, boxShadow: '0 -10px 20px rgba(0,0,0,0.5)' }}>
                    {filteredProviders.map(p => (
                      <div key={p.address} onClick={() => { setPendingProvider(p); setProviderSearch(p.name); setShowDropdown(false); }} style={{ padding: 12, fontSize: 13, borderBottom: '1px solid #222', cursor: 'pointer' }}>{p.name} <span style={{ color: COLORS.PINK, float: 'right' }}>50%</span></div>
                    ))}
                  </div>
                )}
                {pendingProvider && (
                  <div style={{ marginTop: 12, padding: 12, background: 'rgba(227, 24, 100, 0.1)', borderRadius: 16, border: `1px dashed ${COLORS.PINK}`, textAlign: 'center' }}>
                    <div style={{ fontSize: 12, marginBottom: 8 }}>Ủy quyền cho <b>{pendingProvider.name}</b>?</div>
                    <GlowButton onClick={() => handleDelegate(pendingProvider.address, 50)} baseColor={COLORS.PINK} customStyle={{ width: '100%', padding: '10px' }}>KÝ XÁC NHẬN (50%)</GlowButton>
                    <div onClick={() => { setPendingProvider(null); setProviderSearch(""); }} style={{ fontSize: 10, marginTop: 8, color: COLORS.TEXT_MUTE, cursor: 'pointer', textDecoration: 'underline' }}>Hủy chọn</div>
                  </div>
                )}
              </div>
            )}
          </section>

          <div style={{ textAlign: 'center', fontSize: 11, color: COLORS.PINK, fontWeight: 'bold' }}>● {status.toUpperCase()}</div>
        </>
      )}

      {status.includes("⏳") && (
        <div
          onClick={() => setStatus("Sẵn sàng")}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(8, 8, 8, 0.95)', backdropFilter: 'blur(12px)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, padding: '20px', textAlign: 'center',
            cursor: 'pointer',
            overflow: 'hidden'
          }}
        >
          {/* --- QUỐC HUY LÀM NỀN MÀN HÌNH CHỜ (mờ, phía sau nội dung) --- */}
          <div
            style={{
              position: 'absolute', inset: 0,
              backgroundImage: `url(${quocHuyImg})`,
              backgroundSize: 'min(60vw, 420px)',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
              opacity: 0.12,
              filter: 'grayscale(15%)',
              pointerEvents: 'none',
              zIndex: 0
            }}
          />

          <div style={{
            position: 'relative', zIndex: 1,
            fontSize: '70px',
            animation: 'bounce 0.5s infinite alternate cubic-bezier(0.5, 0.05, 1, 0.5)',
            textShadow: `0 20px 30px ${COLORS.PINK}66`
          }}>
            {["🤪", "🐢", "🚀", "🐩", "🏊‍♂️"][quoteIndex]}
          </div>

          <div style={{
            position: 'relative', zIndex: 1,
            marginTop: '35px', color: COLORS.AMBER, fontSize: '15px',
            fontWeight: 'bold', lineHeight: '1.5', maxWidth: '300px'
          }}>
            {[
              "Chỉ cần bạn yêu chính mình, thế giới sẽ dần yêu lấy bạn... 🍜",
              "Không nhất thiết phải trở nên hoàn hảo, chỉ cần hôm nay tiến bộ hơn ngày hôm qua là đủ... 🏎️",
              "Hạnh phúc không phải là điểm đến, mà là một chuyến đi. Hãy tận hưởng từng khoảnh khắc 🐩...",
              "Smart contract đang khởi động, vui lòng không hối thúc 🐢",
              "Dữ liệu đang bơi từ máy chủ về, ráng quạt tay xíu là tới liền! 🏊‍♂️💦"
            ][quoteIndex]}
          </div>

          <div style={{
            position: 'relative', zIndex: 1,
            marginTop: '25px', padding: '8px 16px', background: '#111',
            borderRadius: '20px', border: `1px dashed ${COLORS.PINK}`,
            fontSize: '11px', color: COLORS.PRICE_GREEN, animation: 'pulseGlow 1.5s infinite',
            textTransform: 'uppercase', letterSpacing: '1px'
          }}>
            {status}
          </div>

          <div style={{ position: 'relative', zIndex: 1, marginTop: '40px', fontSize: '12px', color: COLORS.TEXT_MUTE, opacity: 0.7 }}>
            💡 Click bất kỳ đâu để bỏ qua màn hình chờ (Nếu ví hoặc RPC bị treo)
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
