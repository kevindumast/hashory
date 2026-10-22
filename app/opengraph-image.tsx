import { ImageResponse } from "next/og";
import { siteConfig } from "@/lib/site";

export const alt = siteConfig.title;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Mêmes valeurs que les jetons clairs de `app/globals.css`.
const INK = "#151b23";
const MUTED = "#6b7380";
const LINE = "#eef1f4";
const VIOLET = "#6a4fc2";
const VIOLET_SOFT = "#efebfa";
const JADE = "#1e8c6e";
const JADE_SOFT = "#e8f5f0";

const GRID = `linear-gradient(${LINE} 1px, transparent 1px), linear-gradient(90deg, ${LINE} 1px, transparent 1px)`;

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
          background: "#ffffff",
          backgroundImage: GRID,
          backgroundSize: "56px 56px",
          padding: "72px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: INK,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ffffff",
              fontSize: 30,
              fontWeight: 700,
            }}
          >
            H
          </div>
          <div style={{ display: "flex", color: INK, fontSize: 26, fontWeight: 700, letterSpacing: 8 }}>
            {siteConfig.name.toUpperCase()}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div style={{ display: "flex", color: VIOLET, fontSize: 20, fontWeight: 700, letterSpacing: 5 }}>
            AGRÉGATEUR CRYPTO OPEN SOURCE
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              color: INK,
              fontSize: 80,
              fontWeight: 700,
              lineHeight: 1.04,
              letterSpacing: -3,
              maxWidth: 1000,
            }}
          >
            <span>Tous vos actifs crypto,&nbsp;</span>
            <span style={{ color: VIOLET }}>réunis</span>
            <span>&nbsp;et&nbsp;</span>
            <span style={{ color: JADE }}>déclarés.</span>
          </div>
          <div style={{ display: "flex", color: MUTED, fontSize: 28 }}>
            Exchanges, wallets on-chain, P&amp;L automatique et fiscalité française.
          </div>
        </div>

        <div style={{ display: "flex", gap: 14 }}>
          {[
            { label: "Binance", soft: VIOLET_SOFT, color: VIOLET },
            { label: "Kraken", soft: VIOLET_SOFT, color: VIOLET },
            { label: "Bitcoin", soft: JADE_SOFT, color: JADE },
            { label: "Ethereum", soft: JADE_SOFT, color: JADE },
            { label: "Solana", soft: JADE_SOFT, color: JADE },
          ].map((item) => (
            <div
              key={item.label}
              style={{
                display: "flex",
                padding: "10px 20px",
                borderRadius: 12,
                background: item.soft,
                color: item.color,
                fontSize: 22,
                fontWeight: 700,
              }}
            >
              {item.label}
            </div>
          ))}
        </div>
      </div>
    ),
    size
  );
}
