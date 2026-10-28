import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { hasDb, leaderboard, type Song } from "@/lib/db";

export const alt = "doompop.top — The Doom 100: the current top 3";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
// Link previews show the live top 3; regenerate at most every 10 minutes.
export const revalidate = 600;

const anton = readFile(join(process.cwd(), "assets/anton.woff"));

const ACID = "#c6ff00";
const BLOOD = "#ff3b30";
const INK = "#ece6d9";
const DIM = "#8d877b";

// Long titles lose their bracketed subtitle first ("WHITEPILL (Universal High Income)" → "WHITEPILL"), then get cut.
const clip = (s: string, n: number) => {
  const short = s.length > n ? s.replace(/\s*[([][^)\]]*[)\]]\s*/g, " ").trim() || s : s;
  return short.length > n ? `${short.slice(0, n - 1)}…` : short;
};

async function topThree(): Promise<Song[]> {
  if (!hasDb) return [];
  try {
    return (await leaderboard()).slice(0, 3);
  } catch {
    return [];
  }
}

export default async function OgImage() {
  const [font, top] = await Promise.all([anton, topThree()]);
  const frame = {
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column" as const,
    background: "radial-gradient(ellipse at 50% -20%, #2a3d00 0%, #0a0a0a 65%)",
    color: INK,
    fontFamily: "Anton",
  };
  const fonts = [{ name: "Anton", data: await font, weight: 400 as const, style: "normal" as const }];

  if (top.length < 3) {
    return new ImageResponse(
      (
        <div style={{ ...frame, justifyContent: "space-between", padding: 72 }}>
          <div style={{ display: "flex", fontSize: 28, letterSpacing: 8, color: BLOOD, textTransform: "uppercase" }}>
            The official chart of the end times
          </div>
          <div style={{ display: "flex", fontSize: 200, lineHeight: 0.9 }}>
            THE DOOM&nbsp;<span style={{ color: ACID }}>100</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 34 }}>
            <span>AI songs about AI doom, ranked by Elo</span>
            <span style={{ color: ACID }}>doompop.top</span>
          </div>
        </div>
      ),
      { ...size, fonts },
    );
  }

  return new ImageResponse(
    (
      <div style={{ ...frame, padding: "48px 64px" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontSize: 76, lineHeight: 1 }}>
            THE DOOM&nbsp;<span style={{ color: ACID }}>100</span>
          </div>
          <div style={{ display: "flex", fontSize: 24, letterSpacing: 6, color: BLOOD, textTransform: "uppercase", paddingBottom: 8 }}>
            Top 3 right now
          </div>
        </div>
        <div style={{ display: "flex", height: 4, background: INK, margin: "20px 0 8px" }} />
        {top.map((s, i) => (
          <div
            key={s.id}
            style={{
              display: "flex",
              alignItems: "center",
              padding: "14px 0",
              borderBottom: i < 2 ? "2px solid #2a2926" : "2px solid transparent",
              background: i === 0 ? "linear-gradient(90deg, rgba(198,255,0,.14), rgba(198,255,0,0) 70%)" : "transparent",
            }}
          >
            <div
              style={{
                width: 120,
                display: "flex",
                justifyContent: "center",
                fontSize: i === 0 ? 108 : 84,
                lineHeight: 1,
                color: i === 0 ? ACID : INK,
                ...(i === 0 ? { textShadow: `5px 5px 0 ${BLOOD}` } : {}),
              }}
            >
              {i + 1}
            </div>
            <div style={{ display: "flex", flexDirection: "column", flex: 1, marginLeft: 24 }}>
              <div style={{ display: "flex", fontSize: i === 0 ? 56 : 44, lineHeight: 1.05, textTransform: "uppercase" }}>
                {clip(s.title, i === 0 ? 30 : 36)}
              </div>
              {s.artist && <div style={{ display: "flex", fontSize: 26, color: DIM, marginTop: 4 }}>{clip(s.artist, 40)}</div>}
            </div>
            <div style={{ display: "flex", fontSize: i === 0 ? 48 : 40, color: i === 0 ? ACID : INK }}>{Math.round(s.rating)}</div>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "auto", fontSize: 30 }}>
          <span style={{ color: DIM }}>AI songs about AI doom · vote on what slaps</span>
          <span style={{ color: ACID }}>doompop.top</span>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
