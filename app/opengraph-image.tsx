import { ImageResponse } from "next/og";
import { siteConfig } from "@/lib/site";

export const alt = siteConfig.title;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#070d1f",
          padding: "72px",
          position: "relative",
        }}
      >
        {/* Halo d'accent */}
        <div
          style={{
            position: "absolute",
            top: -260,
            left: 260,
            width: 900,
            height: 620,
            borderRadius: 9999,
            background: "radial-gradient(circle, rgba(155,255,206,0.20) 0%, rgba(7,13,31,0) 70%)",
            display: "flex",
          }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: "rgba(155,255,206,0.12)",
              border: "1px solid rgba(155,255,206,0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#9bffce",
              fontSize: 30,
              fontWeight: 700,
            }}
          >
            H
          </div>
          <div style={{ display: "flex", color: "#dfe4ff", fontSize: 34, fontWeight: 600 }}>
            {siteConfig.name}
          </div>
          <div
            style={{
              display: "flex",
              marginLeft: 10,
              padding: "6px 14px",
              borderRadius: 9999,
              border: "1px solid rgba(155,255,206,0.30)",
              color: "#9bffce",
              fontSize: 18,
              letterSpacing: 2,
            }}
          >
            OPEN SOURCE
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              display: "flex",
              color: "#ffffff",
              fontSize: 74,
              fontWeight: 700,
              lineHeight: 1.08,
              letterSpacing: -2,
              maxWidth: 940,
            }}
          >
            Tous vos actifs crypto, réunis en un seul terminal.
          </div>
          <div style={{ display: "flex", color: "rgba(180,197,255,0.72)", fontSize: 28, maxWidth: 880 }}>
            CEX, DEX et wallets on-chain · P&amp;L automatique · Déclaration fiscale
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
          {["Binance", "KuCoin", "Ethereum", "Bitcoin", "Solana"].map((item) => (
            <div key={item} style={{ display: "flex", color: "rgba(180,197,255,0.45)", fontSize: 22 }}>
              {item}
            </div>
          ))}
        </div>
      </div>
    ),
    size
  );
}
