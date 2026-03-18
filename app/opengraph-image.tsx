import { ImageResponse } from "next/og";
import { readFileSync } from "fs";
import path from "path";

export const alt = "Gridlock — The F1 Prediction Game · 2026 Season";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  const logoSrc = `data:image/png;base64,${readFileSync(
    path.join(process.cwd(), "public", "gridlock logo - transparent.png")
  ).toString("base64")}`;

  const helmetSrc = `data:image/png;base64,${readFileSync(
    path.join(process.cwd(), "public", "gridlock-helmet.png")
  ).toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          background: "#000000",
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          overflow: "hidden",
          fontFamily: "Arial Narrow, Arial, sans-serif",
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

        {/* Subtle circuit arcs */}
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

        {/* Helmet — right side, portrait, bleeds off bottom edge */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={helmetSrc}
          width={460}
          height={651}
          alt=""
          style={{ position: "absolute", right: -30, top: -20 }}
        />

        {/* Gradient — fades helmet left-edge into black */}
        <div
          style={{
            position: "absolute",
            right: 0,
            top: 0,
            width: 540,
            height: "100%",
            background:
              "linear-gradient(to right, #000000 0%, transparent 42%)",
          }}
        />

        {/* Left content column */}
        <div
          style={{
            position: "absolute",
            bottom: 48,
            left: 80,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Season badge */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 28,
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
              2026 SEASON · COMING SOON
            </span>
          </div>

          {/* Logo image — replaces GRIDLOCK text */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoSrc}
            width={380}
            height={257}
            alt="Gridlock"
            style={{ marginBottom: 24 }}
          />

          {/* Red divider */}
          <div
            style={{
              width: 48,
              height: 3,
              background: "#E10600",
              marginBottom: 20,
            }}
          />

          {/* Tagline */}
          <div
            style={{
              fontSize: 24,
              color: "rgba(255,255,255,0.5)",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              fontWeight: 400,
              marginBottom: 36,
            }}
          >
            The F1 Prediction Game
          </div>

          {/* Telemetry bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <span
              style={{
                fontSize: 13,
                letterSpacing: "0.16em",
                color: "rgba(255,255,255,0.2)",
                textTransform: "uppercase",
              }}
            >
              20 DRIVERS
            </span>
            <div
              style={{
                width: 24,
                height: 1,
                background: "rgba(255,255,255,0.1)",
              }}
            />
            <span
              style={{
                fontSize: 13,
                letterSpacing: "0.16em",
                color: "rgba(255,255,255,0.2)",
                textTransform: "uppercase",
              }}
            >
              24 ROUNDS
            </span>
            <div
              style={{
                width: 24,
                height: 1,
                background: "rgba(255,255,255,0.1)",
              }}
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
      </div>
    ),
    { ...size },
  );
}
