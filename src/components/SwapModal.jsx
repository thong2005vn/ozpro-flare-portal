import React, { useEffect } from "react";

// Đặt hằng số ở ngoài để đảm bảo cấu trúc sạch
const COLORS = {
  PINK: "#e31864",
  SURFACE: "#111111",
  BORDER: "#262626",
  TEXT_MUTE: "#94a3b8",
  PRICE_GREEN: "#00ffcc"
};

export default function SwapModal({ isOpen, onClose }) {
  
  // Xử lý khóa cuộn trang
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => { document.body.style.overflow = "unset"; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div 
      style={{ 
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0, 
        background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)", 
        display: "flex", alignItems: "center", justifyContent: "center", 
        zIndex: 10000, padding: "20px" 
      }} 
      onClick={onClose}
    >
      <div 
        style={{ 
          boxSizing: "border-box", background: COLORS.SURFACE, 
          border: `1px solid ${COLORS.BORDER}`, padding: "24px", 
          borderRadius: "28px", width: "100%", maxWidth: "380px", 
          color: "white", boxShadow: `0 0 35px ${COLORS.PRICE_GREEN}18` 
        }} 
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h3 style={{ margin: 0, fontSize: "15px", fontWeight: "bold", color: COLORS.PRICE_GREEN, letterSpacing: "1.5px" }}>🗘 OZPRO SWAP</h3>
          <button 
            style={{ background: "none", border: "none", color: COLORS.TEXT_MUTE, fontSize: "18px", cursor: "pointer" }} 
            onClick={onClose}
          >✕</button>
        </div>

        {/* Thông báo */}
        <div style={{ background: "#080808", border: `1px solid ${COLORS.BORDER}`, padding: "16px", borderRadius: "16px", marginBottom: "20px", textAlign: "center" }}>
          <p style={{ color: COLORS.TEXT_MUTE, fontSize: "13px", margin: "0" }}>
            Vui lòng thực hiện giao dịch trực tiếp trên BlazeSwap để đảm bảo kết nối ví và thanh khoản an toàn.
          </p>
        </div>

        {/* Nút bấm (Đã fix lệch bằng display: block và box-sizing) */}
        <a 
          href="https://app.blazeswap.xyz/swap/" 
          target="_blank" 
          rel="noopener noreferrer"
          style={{ 
            display: "block", 
            width: "100%", 
            boxSizing: "border-box", 
            padding: "15px", 
            borderRadius: "14px", 
            background: COLORS.PRICE_GREEN, 
            color: "black", 
            fontWeight: "bold", 
            fontSize: "14px", 
            textAlign: "center",
            textDecoration: "none",
            cursor: "pointer"
          }}
        >
          MỞ BLAZESWAP GIAO DỊCH
        </a>

        <div style={{ marginTop: "15px", textAlign: "center" }}>
          <span style={{ fontSize: "10px", color: COLORS.PINK }}>* Chuyển hướng an toàn đến trang chủ.</span>
        </div>
      </div>
    </div>
  );
}