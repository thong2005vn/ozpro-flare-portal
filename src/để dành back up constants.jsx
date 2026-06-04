// constants.js

export const WNAT = "0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d";
export const REWARD_MANAGER = "0xC8f55c5aA2C752eE285Bd872855C749f4ee6239B";
export const CLAIM_SETUP_MANAGER = "0xD56c0Ea37B848939B59e6F5Cda119b3fA473b5eB";
export const CYCLE_SECONDS = 3.5 * 24 * 3600;

export const FLARE_PARAMS = {
  chainId: 14, 
  chainName: "Flare Mainnet",
  nativeCurrency: { name: "Flare", symbol: "FLR", decimals: 18 },
  rpcUrls: ["https://flare-api.flare.network/ext/C/rpc"],
  blockExplorerUrls: ["https://flare-explorer.flare.network/"]
};

export const COLORS = {
  PINK: "#e31864", AMBER: "#fbbf24", DARK: "#000000",
  SURFACE: "#111111", BORDER: "#262626", TEXT_MUTE: "#94a3b8", PRICE_GREEN: "#00ffcc"
};

export const PROVIDERS = [
  { name: "FTSO Paris", address: "0x085841b253590281cc5c5222b09d4e59a605e774" },
  { name: "FTSO Asia", address: "0xdd7b2bac728f027f23add7128711ecb60f761ad5" },
  { name: "ITB Validator", address: "0x2e8320b92b640cf8cbdeaffbe70d4bc407303b9f" },
  { name: "HEWG", address: "0xb6d68ea6c4de734ec481f92afd1c35f712441b73" },
  { name: "uGaenn", address: "0xe3a76233885e355cfaf141d7dd3d92705c9db4d5" },
  { name: "Resonance", address: "0x62571de064cac560207b7116c6d87c818f7376cc" },
  { name: "sToadz FTSO", address: "0x729589694a78ff2d8bacf75b7ac4389bd53ee533" },
  { name: "Flare Bank", address: "0xfa9368cfbee3b070d8552d8e75cdc0ff72efac50" },
  { name: "Bushido FTSO", address: "0xc7cf3238d2ca63d01ad4d42b4ccb9db8b0ade702" },
  { name: "FlareBus", address: "0x6c5c813dd19f071be0b6e83701955810f118e717" },
  { name: "Knot Nodes", address: "0xf33a0ac50f2e85737af577ea68583f264c7a1f78" },
  { name: "Juice Nodes", address: "0xce73ade61b0d0100ba1507d9fa1dc2fea3046578" },
  { name: "True FTSO", address: "0xb6ded9d9ca19af10c67f9a8be8ca75e38e166faa" },
  { name: "Wonderftso", address: "0x4c1f288cafecbbdac653c2170337c38e62c400e9" },
  { name: "HP/Mana Nodes", address: "0xf61b94dedc5f23398997d73b7701d67556eaad6f" },
  { name: "FTSOCAN", address: "0x9e55a49d251324b1623dc2a81894d1afbfb8bbdc" },
  { name: "Last Oracle", address: "0x535268cb19f2cc0c65d463be6ab7751ff4e9fc07" },
  { name: "Sun-Dara", address: "0x1e8f916ce03f4ce86186531a8994d366581ed4be" },
  { name: "Chainbase Staking", address: "0x6434b1ed626585d3e58e995ad3c2cc0d6718755c" },
  { name: "Cottage Nodes", address: "0x6ebbd69832af87434253c10f9045e012286f509e" },
  { name: "African Proofs", address: "0x7808b9e0f7c488172b54b30f98c2fcf36d903b2c" },
  { name: "FTSOBest", address: "0xc396b6f023f3a1c894a20fba08432e847c05c7f9" },
  { name: "Digital Dynamix", address: "0x57711d552e2309c7a83716351e7a59a438f17e3a" },
  { name: "Aternety", address: "0xd3956f862a4960bb4937e596a2baecffcbb4b3e0" },
  { name: "Envision", address: "0x9b42b895d2a10d048eaf4996fdf93aebf59167bf" },
  { name: "DataVector", address: "0xcaa49c97318b6bb62b7f9241891d70f87fc05d35" },
  { name: "Flare Sensei", address: "0x2566e97b2947dc2d6e9caf0bf737aabd7e78a0f6" },
  { name: "LightFTSO", address: "0xa9c69eb9de79188a9aba46c5336607f88a80ec89" },
  { name: "FlareBase", address: "0xac2884a4479bf7c21aa0462d52bc9c76c3a9a3dd" },
  { name: "InfStones", address: "0xb1aa0f2691db6bbb2969efc7be70787f58dd2461" },
  { name: "SenseiNode", address: "0xe08898b7b8b18dbcddcc6339c8b9c19effa81413" },
  { name: "Flaris", address: "0xf8b1dcf2594afd082aae088661bf574cb9bbdc61" },
  { name: "Stakeway", address: "0xf26be97eb0d7a9fbf8d67f813d3be411445885ce" },
  { name: "Use Your Spark", address: "0xa288054b230dcbb8689ac229d6dbd7df39203181" }
];

export const styles = {
  container: { boxSizing: 'border-box', padding: "24px", maxWidth: "420px", margin: "40px auto", background: COLORS.DARK, color: "white", borderRadius: "32px", border: `1px solid ${COLORS.BORDER}`, boxShadow: `0 0 40px 10px ${COLORS.PINK}22, 0 0 100px 30px ${COLORS.PINK}0a`, fontFamily: "sans-serif", position: 'relative', overflow: "hidden" },
  card: { boxSizing: 'border-box', background: COLORS.SURFACE, padding: "20px", borderRadius: "24px", marginBottom: "16px", border: "1px solid #1f1f1f" },
  label: { fontSize: "11px", color: COLORS.TEXT_MUTE, fontWeight: "800", letterSpacing: "1px", marginBottom: "12px", textTransform: "uppercase" },
  input: { flex: 1, padding: "12px", borderRadius: "14px", background: "#080808", color: "white", border: "1px solid #222", outline: "none" },
  btnBase: { padding: "12px", borderRadius: "14px", border: "1px solid transparent", cursor: "pointer", fontWeight: "bold", fontSize: "12px", transition: "all 0.3s ease" },
  tickerWrap: { width: 'calc(100% + 48px)', overflow: 'hidden', background: '#0a0a0a', borderTop: `1px solid ${COLORS.BORDER}`, borderBottom: `1px solid ${COLORS.BORDER}`, padding: '12px 0', margin: '15px -24px 25px -24px' },
  ticker: { display: 'inline-block', whiteSpace: 'nowrap', animation: 'marquee 50s linear infinite', paddingLeft: '100%' },
  assetName: { fontWeight: '800', marginRight: '6px' },
  assetPrice: { color: COLORS.PRICE_GREEN, marginRight: '35px', fontFamily: 'monospace', fontSize: '14px' },
  qrOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.92)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '24px' },
  qrContainer: { background: 'white', padding: '15px', borderRadius: '24px', marginBottom: '20px', boxShadow: `0 0 30px ${COLORS.PINK}44` },
  copyBadge: { background: '#161616', padding: '12px 18px', borderRadius: '16px', border: `1px solid ${COLORS.BORDER}`, display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', maxWidth: '100%' },
  networkModal: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: '20px', textAlign: 'center' },
  logoutBtn: { background: 'transparent', border: `1px solid ${COLORS.BORDER}`, color: COLORS.TEXT_MUTE, borderRadius: '20px', padding: '6px 12px', cursor: 'pointer', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', transition: 'all 0.2s' },
  undelegateBtn: { background: 'transparent', color: COLORS.PINK, border: `1px solid ${COLORS.PINK}44`, fontSize: '9px', padding: '4px 8px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' },
  scanBtn: { display: 'inline-flex', alignItems: 'center', background: '#161616', color: COLORS.TEXT_MUTE, border: `1px solid ${COLORS.BORDER}`, borderRadius: '20px', padding: '6px 12px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer', textTransform: 'uppercase', transition: 'all 0.2s' },
  helpBtn: { background: '#161616', color: COLORS.PINK, border: `1px solid ${COLORS.BORDER}`, borderRadius: '20px', padding: '6px 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px', transition: 'all 0.2s', letterSpacing: '1px' },
  helpModal: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000, padding: '20px' },
  helpContent: { background: COLORS.SURFACE, border: `1px solid ${COLORS.PINK}`, padding: '25px', borderRadius: '24px', width: '100%', maxWidth: '340px', maxHeight: '80vh', overflowY: 'auto', textAlign: 'left' },
  stepTitle: { color: COLORS.PINK, fontSize: '13px', fontWeight: 'bold', marginTop: '16px', marginBottom: '8px', textTransform: 'uppercase' },
  stepText: { fontSize: '12px', color: COLORS.TEXT_MUTE, marginBottom: '6px', lineHeight: '1.5' }
};