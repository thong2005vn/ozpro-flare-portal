import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { ethers } from "ethers";
import { QRCodeSVG } from "qrcode.react";
import { createWeb3Modal, defaultConfig } from "@web3modal/ethers/react";
import SwapModal from "./components/SwapModal";

// --- IMPORT TỪ FILE CONSTANTS ---
import { 
  WNAT, REWARD_MANAGER, CLAIM_SETUP_MANAGER, CYCLE_SECONDS, 
  FLARE_PARAMS, COLORS, PROVIDERS, styles 
} from "./constants";

// 🌐 CẤU HÌNH WEB3MODAL
const projectId = "60e0395fcb2e23586895a5b421c97875";
const metadata = {
  name: "OZPRO FLARE PORTAL",
  description: "Flare Delegation Account Rewards Manager",
  url: typeof window !== "undefined" ? window.location.origin : "http://localhost:5173",
  icons: ["https://avatars.githubusercontent.com/u/37784886"]
};

const flareNetworkConfig = {
  chainId: FLARE_PARAMS.chainId, name: FLARE_PARAMS.chainName, currency: "FLR",
  explorerUrl: FLARE_PARAMS.blockExplorerUrls[0], rpcUrl: FLARE_PARAMS.rpcUrls[0]
};

const modal = createWeb3Modal({
  ethersConfig: defaultConfig({ metadata, enableEIP6963: true, enableInjected: true, enableCoinbase: false }),
  chains: [flareNetworkConfig], projectId, enableAnalytics: false, themeMode: 'dark',
  themeVariables: { '--w3m-z-index': '9999' }
});

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

const GlowButton = ({ onClick, disabled, baseColor, textColor = 'white', hoverTextColor, customStyle, children }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{ ...styles.btnBase, background: baseColor, color: textColor, ...customStyle }}
    onMouseOver={(e) => {
      if(disabled) return;
      e.currentTarget.style.background = "transparent";
      e.currentTarget.style.borderColor = baseColor;
      e.currentTarget.style.color = hoverTextColor || baseColor;
      e.currentTarget.style.boxShadow = `0 0 15px ${baseColor}88`;
    }}
    onMouseOut={(e) => {
      if(disabled) return;
      e.currentTarget.style.background = baseColor;
      e.currentTarget.style.borderColor = "transparent";
      e.currentTarget.style.color = textColor;
      e.currentTarget.style.boxShadow = "none";
    }}
  >
    {children}
  </button>
);

const useCryptoPrices = () => {
  const [prices, setPrices] = useState({ btc: 0, eth: 0, xrp: 0, flr: 0, sgb: 0, ltc: 0, doge: 0 });
  useEffect(() => {
    const getAllPrices = async () => {
      try {
        const ids = "bitcoin,ethereum,ripple,flare-networks,songbird,litecoin,dogecoin";
        const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`);
        const data = await res.json();
        setPrices({
          btc: data["bitcoin"]?.usd || 0, eth: data["ethereum"]?.usd || 0, xrp: data["ripple"]?.usd || 0,
          flr: data["flare-networks"]?.usd || 0, sgb: data["songbird"]?.usd || 0,
          ltc: data["litecoin"]?.usd || 0, doge: data["dogecoin"]?.usd || 0
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
  const [delegations, setDelegations] = useState([]);
  const [walletAmount, setWalletAmount] = useState("");
  const [pdaAmount, setPdaAmount] = useState("");
  const [status, setStatus] = useState("Sẵn sàng");
  const [providerSearch, setProviderSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [pendingProvider, setPendingProvider] = useState(null);
  
  const [showQR, setShowQR] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showNetworkModal, setShowNetworkModal] = useState(false);
  const [showHelp, setShowHelp] = useState(false); 
  const [walletType, setWalletType] = useState(""); 
  const [customEthersProvider, setCustomEthersProvider] = useState(null);
  const [showConnectModal, setShowConnectModal] = useState(false); 
  const [timeLeft, setTimeLeft] = useState(0);
  const [isSwapOpen, setIsSwapOpen] = useState(false); 

  const dropdownRef = useRef(null);
  const prices = useCryptoPrices();

  const toUSD = useCallback((amt) => `$${(Number(amt) * prices.flr).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, [prices.flr]);

  const formatBalance = useCallback((amt) => {
    return Number(amt).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  }, []);

  const getProvider = useCallback(() => {
    if (walletType === "metamask" && window.ethereum) return new ethers.BrowserProvider(window.ethereum);
    if (walletType === "walletconnect" && customEthersProvider) return customEthersProvider;
    return null;
  }, [walletType, customEthersProvider]);

  // --- LOGIC COUNTDOWN REAL-TIME TỪ BLOCKCHAIN ---
  useEffect(() => {
    let blockTimeOffset = 0;

    const syncBlockTime = async () => {
      try {
        const p = getProvider();
        if (p) {
          const block = await p.getBlock("latest");
          if (block) {
            blockTimeOffset = (Number(block.timestamp) * 1000) - Date.now();
          }
        }
      } catch (error) {
        console.error("Lỗi đồng bộ thời gian blockchain:", error);
      }
    };

    syncBlockTime();

    const interval = setInterval(() => {
      const savedEndTime = localStorage.getItem("claim_countdown_end");
      if (savedEndTime) {
        const currentNetworkTime = Date.now() + blockTimeOffset;
        const diff = Math.floor((Number(savedEndTime) - currentNetworkTime) / 1000);
        setTimeLeft(diff > 0 ? diff : 0);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [getProvider]);

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

  useEffect(() => {
    document.body.style.backgroundColor = "#080808"; document.body.style.margin = "0";
    return () => { document.body.style.backgroundColor = ""; };
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setShowDropdown(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
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

      const [f, w, pw, rewardStates] = await Promise.all([ p.getBalance(addr), wnat.balanceOf(addr), wnat.balanceOf(pda), rew.getStateOfRewards(pda).catch(() => []) ]);
      const del = await wnat.delegatesOf(pda).catch(() => [[], [], 0n, 0n]);
      
      let totalRewardWei = 0n;
      if (Array.isArray(rewardStates)) {
        rewardStates.forEach(epochArray => {
          if (Array.isArray(epochArray)) epochArray.forEach(state => { totalRewardWei += BigInt(state[2]); });
        });
      }

      setIsActivated(activated);
      setBalances({ flr: ethers.formatEther(f), wflr: ethers.formatEther(w), pdaWflr: ethers.formatEther(pw), reward: ethers.formatEther(totalRewardWei) });

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
      else setStatus(`❌ Lỗi: ${e?.reason || "Giao dịch thất bại"}`);
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
  }, [walletType, refreshData]);

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

  const disconnect = async () => {
    if (walletType === "walletconnect") { try { await modal.disconnect(); } catch (e) {} }
    setAccount(""); setPdaAddress(""); setWalletType(""); setCustomEthersProvider(null); setIsActivated(false);
    setBalances({ flr: "0", wflr: "0", pdaWflr: "0", reward: "0" }); setDelegations([]); setStatus("Đã ngắt kết nối");
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

  const handleWithdrawPDA = () => execute("Rút PDA", async () => {
    const s = await getProvider().getSigner();
    return new ethers.Contract(CLAIM_SETUP_MANAGER, ["function withdraw(uint256) external"], s).withdraw(ethers.parseEther(pdaAmount || "0"));
  });

  const handleClaim = () => execute("Nhận thưởng", async () => {
    const p = getProvider();
    const s = await p.getSigner();
    const r = new ethers.Contract(REWARD_MANAGER, ["function claim(address,address,uint24,bool,tuple(bytes32[],tuple(uint24,bytes20,uint120,uint8))[])", "function getRewardEpochIdsWithClaimableRewards() view returns (uint24,uint24)"], s);
    const [, end] = await r.getRewardEpochIdsWithClaimableRewards();
    const tx = await r.claim(pdaAddress, pdaAddress, end, true, []);
    
    const durationMs = CYCLE_SECONDS * 1000;
    
    let blockTimeOffset = 0;
    try {
      const block = await p.getBlock("latest");
      blockTimeOffset = (Number(block.timestamp) * 1000) - Date.now();
    } catch (e) { }

    const networkTimeNow = Date.now() + blockTimeOffset;
    localStorage.setItem("claim_countdown_end", (networkTimeNow + durationMs).toString());
    
    return tx;
  });

  const handleWrap = (isWrap) => execute(isWrap ? "Wrap" : "Unwrap", async () => {
    const s = await getProvider().getSigner();
    const w = new ethers.Contract(WNAT, ["function deposit() payable", "function withdraw(uint256)"], s);
    const val = ethers.parseEther(walletAmount || "0");
    return isWrap ? w.deposit({ value: val }) : w.withdraw(val);
  });

  const handleToPDA = () => execute("Nạp PDA", async () => {
    const s = await getProvider().getSigner();
    return new ethers.Contract(WNAT, ["function transfer(address,uint256)"], s).transfer(pdaAddress, ethers.parseEther(walletAmount || "0"));
  });

  const handleDelegate = (target, pct = 50) => execute(pct === 0 ? "Hủy" : "Ủy quyền", async () => {
    const s = await getProvider().getSigner();
    return new ethers.Contract(CLAIM_SETUP_MANAGER, ["function delegate(address,uint256) external"], s).delegate(target, pct * 100);
  });

  const handleUndelegateAll = () => execute("Hủy toàn bộ", async () => {
    const s = await getProvider().getSigner();
    return new ethers.Contract(CLAIM_SETUP_MANAGER, ["function undelegateAll() external"], s).undelegateAll();
  });

  const filteredProviders = useMemo(() => PROVIDERS.filter(p => p.name.toLowerCase().includes(providerSearch.toLowerCase())), [providerSearch]);

  return (
    <div style={styles.container}>
      {/* 🚀 ĐÃ CẬP NHẬT KEYFRAMES ĐỂ TẠO HIỆU ỨNG NHÚN NHẢY & PHÁT SÁNG */}
      <style>{`
        @keyframes marquee { 0% { transform: translate(0, 0); } 100% { transform: translate(-100%, 0); } }
        @keyframes bounce { from { transform: translateY(0); } to { transform: translateY(-25px); } }
        @keyframes pulseGlow { 0% { opacity: 0.6; } 50% { opacity: 1; } 100% { opacity: 0.6; } }
      `}</style>

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
        <div style={styles.helpModal} onClick={() => setShowHelp(false)}>
          <div style={styles.helpContent} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 10px 0', textAlign: 'center', color: '#fff', fontSize: '15px' }}>HƯỚNG DẪN ỦY QUYỀN FLR</h3>
            <p style={{ fontSize: '11px', textAlign: 'center', color: COLORS.AMBER, marginBottom: '15px', fontStyle: 'italic' }}>Tham gia chứng thực thông tin giá cả để kiếm lời</p>
            <div style={styles.stepTitle}>Bước 1: Kết nối ví</div><div style={styles.stepText}>• Bấm "KẾT NỐI VÍ CỦA BẠN" và ký giao dịch.</div>
            <div style={styles.stepTitle}>Bước 2: Wrap FLR {'->'} WFLR</div><div style={styles.stepText}>• Nhập số lượng và bấm "WRAP". Luôn chừa lại ít FLR làm phí.</div>
            <div style={styles.stepTitle}>Bước 3: Nạp WFLR vào PDA</div><div style={styles.stepText}>• Nhập số lượng và bấm "NẠP PDA".</div>
            <div style={styles.stepTitle}>Bước 4: Ủy quyền (Delegation)</div><div style={styles.stepText}>• Chọn 2 providers để Delegate.</div>
            <div style={styles.stepTitle}>Bước 5: Nhận thưởng</div><div style={styles.stepText}>• Mỗi 3,5 ngày bấm "CLAIM" để nhận thưởng.</div>
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
        <h2 style={{ color: COLORS.PINK, letterSpacing: '3px', margin: 0 }}>OZPRO FLARE <span style={{ fontWeight: 300, color: '#fff' }}>MANAGER </span></h2>
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
        </div>
      </div>

      {!account ? (
        <GlowButton onClick={() => setShowConnectModal(true)} baseColor={COLORS.PINK} customStyle={{ width: '100%', padding: '18px' }}>KẾT NỐI VÍ CỦA BẠN</GlowButton>
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
              <input type="number" value={walletAmount} onChange={(e) => setWalletAmount(e.target.value)} style={styles.input} placeholder="Điền số FLR/WFLR..." />
              <GlowButton onClick={() => setWalletAmount(balances.flr)} baseColor={COLORS.PINK}>MAX</GlowButton>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: 8 }}>
              <GlowButton onClick={() => handleWrap(true)} baseColor={COLORS.PINK}>WRAP</GlowButton>
              <GlowButton onClick={() => handleWrap(false)} baseColor={COLORS.PINK}>UNWRAP</GlowButton>
              <GlowButton onClick={handleToPDA} baseColor={COLORS.PINK} textColor="yellow" hoverTextColor="yellow">NẠP PDA</GlowButton>
            </div>
            
            <GlowButton 
              onClick={() => setIsSwapOpen(true)} 
              baseColor={COLORS.PRICE_GREEN} 
              textColor="black" 
              hoverTextColor={COLORS.PRICE_GREEN} 
              customStyle={{ width: '100%', marginTop: '8px' }}
            >
              🗘 SWAP TOKEN (FLR ⇋ WFLR)
            </GlowButton>
          </section>

          <section style={{ ...styles.card, border: `2px solid ${COLORS.AMBER}44` }}>
            <div style={{ ...styles.label, color: COLORS.AMBER }}>DELEGATION ACCOUNT (PDA)</div>
            {pdaAddress && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0a0a0a', color: COLORS.AMBER, padding: '8px 12px', borderRadius: '10px', fontSize: '10px', fontFamily: 'monospace', cursor: 'pointer', border: '1px solid #222', marginTop: '-6px', marginBottom: '15px' }} onClick={() => handleCopy(pdaAddress)} title="Click to copy">
                <span style={{ opacity: 0.7 }}>Address:</span><span style={{ fontWeight: 'bold' }}>{pdaAddress.slice(0, 10)}...{pdaAddress.slice(-8)} 📋</span>
              </div>
            )}
            {!isActivated ? (
              <div style={{ textAlign: 'center', padding: '10px 0' }}>
                <p style={{ fontSize: '12px', color: COLORS.AMBER, marginBottom: '15px', lineHeight: '1.5' }}>Tài khoản PDA của bạn chưa được khởi tạo.<br/>Vui lòng kích hoạt để bắt đầu.</p>
                <GlowButton onClick={handleEnablePDA} baseColor={COLORS.AMBER} textColor="black" customStyle={{ width: '100%', fontSize: '13px', padding: '15px' }}>⚡ KÍCH HOẠT PDA NGAY</GlowButton>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 15 }}>
                  <div style={{ fontSize: 24, fontWeight: '900', color: COLORS.PRICE_GREEN }}>
                    {formatBalance(balances.pdaWflr)} <small style={{ color: COLORS.AMBER, fontSize: 18 }}> WFLR</small>
                  </div>
                  <div style={{ fontSize: 12, color: COLORS.TEXT_MUTE }}>{toUSD(balances.pdaWflr)}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <input type="number" value={pdaAmount} onChange={(e) => setPdaAmount(e.target.value)} style={styles.input} placeholder="Số lượng rút..." />
                  <GlowButton onClick={() => setPdaAmount(balances.pdaWflr)} baseColor={COLORS.AMBER} textColor="black">MAX</GlowButton>
                </div>
                <button 
                  onClick={handleWithdrawPDA} 
                  style={{ ...styles.btnBase, width: '100%', background: COLORS.AMBER, color: COLORS.PINK, border: `3px solid ${COLORS.AMBER}66`, marginBottom: 20 }}
                  onMouseOver={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = COLORS.AMBER; e.currentTarget.style.boxShadow = `0 0 15px ${COLORS.AMBER}88`; }}
                  onMouseOut={(e) => { e.currentTarget.style.background = COLORS.AMBER; e.currentTarget.style.borderColor = `${COLORS.AMBER}66`; e.currentTarget.style.boxShadow = "none"; }}
                >⤺ RÚT WFLR VỀ MAIN WALLET</button>

                <div style={{ background: 'rgba(0,0,0,0.5)', padding: '16px', borderRadius: '20px', border: `1px solid ${timeLeft > 0 ? COLORS.BORDER : COLORS.PINK + '44'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '10px', color: timeLeft > 0 ? COLORS.TEXT_MUTE : COLORS.AMBER, fontWeight: '800', marginBottom: '4px' }}>
                        {timeLeft > 0 ? "NEXT REWARD CYCLE" : "UNCLAIMED REWARDS"}
                      </div>
                      <div style={{ fontSize: '20px', fontWeight: '900' }}>
                        {timeLeft > 0 ? renderCountdown(timeLeft) : <span style={{ color: COLORS.PRICE_GREEN }}>+{Number(balances.reward).toFixed(2)} FLR</span>}
                      </div>
                    </div>
                    <GlowButton 
                      onClick={handleClaim} 
                      disabled={Number(balances.reward) <= 0 || timeLeft > 0} 
                      baseColor={timeLeft > 0 ? "transparent" : COLORS.AMBER}
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
              <div key={d.addr || i} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: i === delegations.length - 1 ? 'none' : '1px solid #222' }}>
                <div><div style={{ fontWeight: 'bold' }}>{d.name}</div><div style={{ fontSize: 11, color: COLORS.PINK }}>{d.pct}% Power</div></div>
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

      {/* 🚀 GIAO DIỆN CHỜ TẤU HÀI ĐÃ ĐƯỢC THÊM VÀO ĐÂY */}
      {status.includes("⏳") && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(8, 8, 8, 0.9)', backdropFilter: 'blur(10px)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, padding: '20px', textAlign: 'center'
        }}>
          {/* Icon nhún nhảy */}
          <div style={{ 
            fontSize: '70px', 
            animation: 'bounce 0.5s infinite alternate cubic-bezier(0.5, 0.05, 1, 0.5)',
            textShadow: `0 20px 30px ${COLORS.PINK}66`
          }}>
            {["🤪", "🐢", "🚀", "🐩", "🏊‍♂️"][Math.floor(Date.now() / 1000) % 5]}
          </div>
          
          {/* Câu thoại bốc random */}
          <div style={{
            marginTop: '35px', color: COLORS.AMBER, fontSize: '15px', 
            fontWeight: 'bold', lineHeight: '1.5', maxWidth: '300px'
          }}>
            {[
              "Đang soi lại file Excel xem 8000 USDT arbitrage lãi được bát phở nào không... 🍜",
              "Chờ chút, đang bận nhẩm tính gồng BRETT x20 thì mua Lambo màu gì... 🏎️",
              "Gas đang rẻ, hệ thống đang tranh thủ bế thêm em POODLE 🐩...",
              "Smart contract đang khởi động, vui lòng không hối thúc 🐢",
              "Dữ liệu đang bơi sải từ máy chủ Vercel về, ráng quạt tay xíu là tới bờ! 🏊‍♂️💦"
            ][Math.floor(Date.now() / 1000) % 5]}
          </div>
          
          {/* Status thực tế của hệ thống */}
          <div style={{ 
            marginTop: '25px', padding: '8px 16px', background: '#111', 
            borderRadius: '20px', border: `1px dashed ${COLORS.PINK}`,
            fontSize: '11px', color: COLORS.PRICE_GREEN, animation: 'pulseGlow 1.5s infinite',
            textTransform: 'uppercase', letterSpacing: '1px'
          }}>
            {status}
          </div>
        </div>
      )}

      <SwapModal 
        isOpen={isSwapOpen} 
        onClose={() => setIsSwapOpen(false)} 
        provider={getProvider()} 
        userAddress={account} 
      />
    </div>
  );
}