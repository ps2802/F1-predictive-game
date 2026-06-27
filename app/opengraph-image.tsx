import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Gridlock — The F1 Prediction Game · 2026 Season";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "#000000",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "flex-end",
          padding: "72px 80px",
          fontFamily: "Arial Narrow, Arial, sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Top red stripe */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 6,
            background: "#E10600",
          }}
        />

        {/* Subtle circuit arc — decorative background shape */}
        <div
          style={{
            position: "absolute",
            top: -180,
            right: -180,
            width: 700,
            height: 700,
            borderRadius: "50%",
            border: "1px solid rgba(255,255,255,0.04)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: -80,
            right: -80,
            width: 460,
            height: 460,
            borderRadius: "50%",
            border: "1px solid rgba(225,6,0,0.08)",
          }}
        />

        {/* Season badge */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 32,
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#E10600",
            }}
          />
          <span
            style={{
              fontSize: 16,
              fontWeight: 700,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.4)",
            }}
          >
            2026 SEASON · NOW LIVE
          </span>
        </div>

        {/* Brand name */}
        <div
          style={{
            fontSize: 112,
            fontWeight: 900,
            color: "#ffffff",
            letterSpacing: "-4px",
            lineHeight: 0.9,
            marginBottom: 28,
            textTransform: "uppercase",
          }}
        >
          GRIDLOCK
        </div>

        {/* Divider */}
        <div
          style={{
            width: 48,
            height: 3,
            background: "#E10600",
            marginBottom: 24,
          }}
        />

        {/* Tagline */}
        <div
          style={{
            fontSize: 26,
            color: "rgba(255,255,255,0.5)",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            fontWeight: 400,
          }}
        >
          The F1 Prediction Game
        </div>

        {/* Bottom telemetry bar */}
        <div
          style={{
            position: "absolute",
            bottom: 40,
            left: 80,
            right: 80,
            display: "flex",
            alignItems: "center",
            gap: 24,
          }}
        >
          <span
            style={{
              fontSize: 13,
              letterSpacing: "0.16em",
              color: "rgba(255,255,255,0.2)",
              textTransform: "uppercase",
            }}
          >
            22 DRIVERS
          </span>
          <div
            style={{ width: 24, height: 1, background: "rgba(255,255,255,0.1)" }}
          />
          <span
            style={{
              fontSize: 13,
              letterSpacing: "0.16em",
              color: "rgba(255,255,255,0.2)",
              textTransform: "uppercase",
            }}
          >
            2026 SEASON
          </span>
          <div
            style={{ width: 24, height: 1, background: "rgba(255,255,255,0.1)" }}
          />
          <span
            style={{
              fontSize: 13,
              letterSpacing: "0.16em",
              color: "rgba(255,255,255,0.2)",
              textTransform: "uppercase",
            }}
          >
            JOINGRIDLOCK.COM
          </span>
        </div>
      </div>
    ),
    { ...size },
  );
}
