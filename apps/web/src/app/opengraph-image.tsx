import { ImageResponse } from "next/og";

import { getOverviewData } from "@/lib/overview-data";

export const alt =
  "Project Babel · AI Governance Observatory — Comparative Policy Structure vs. Risk Framing";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  const data = await getOverviewData("headline");
  const topFinding = data.findings[0];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0a0f18",
          color: "#e6edf5",
          padding: "56px 64px",
          fontFamily: "sans-serif",
          border: "1px solid rgba(255,255,255,0.12)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: "18px",
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "#38bdf8",
            }}
          >
            <span>PROJECT BABEL · AI GOVERNANCE OBSERVATORY</span>
            <span style={{ color: "#94a3b8" }}>
              {data.corpusWindow.label}
            </span>
          </div>
          <div
            style={{
              fontSize: "48px",
              fontWeight: 700,
              lineHeight: 1.15,
              color: "#f8fafc",
              marginTop: "8px",
            }}
          >
            What five governments require of AI — and why they say it is
            necessary.
          </div>
          {topFinding ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                marginTop: "18px",
                padding: "18px 22px",
                background: "#0f1623",
                borderLeft: "4px solid #38bdf8",
                borderRadius: "4px",
              }}
            >
              <span
                style={{
                  fontSize: "14px",
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "#67e8f9",
                }}
              >
                {topFinding.kicker}
              </span>
              <span
                style={{
                  fontSize: "24px",
                  fontWeight: 600,
                  marginTop: "6px",
                  color: "#e6edf5",
                }}
              >
                {topFinding.headline}
              </span>
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            borderTop: "1px solid rgba(255,255,255,0.14)",
            paddingTop: "22px",
            fontSize: "18px",
            color: "#94a3b8",
          }}
        >
          <div style={{ display: "flex", gap: "28px" }}>
            {data.countries.map((c) => (
              <div
                key={c.slug}
                style={{ display: "flex", flexDirection: "column", gap: "4px" }}
              >
                <span style={{ color: "#e6edf5", fontWeight: 700 }}>
                  {c.shortName}
                </span>
                <span style={{ fontSize: "15px", color: "#38bdf8" }}>
                  POL {c.policyDivergence} · FRM {c.framingDivergence}
                </span>
              </div>
            ))}
          </div>
          <span style={{ color: "#cbd5e1", fontSize: "18px" }}>
            project-babel.com
          </span>
        </div>
      </div>
    ),
    { ...size },
  );
}
