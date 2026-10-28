import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { hasDb } from "@/lib/db";
import { getRank, getSong, parseId } from "./data";

export const alt = "A song on doompop.top, the Doom 100";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 600;

const anton = readFile(join(process.cwd(), "assets/anton.woff"));

const ACID = "#c6ff00";
const BLOOD = "#ff3b30";
const INK = "#ece6d9";
const DIM = "#8d877b";

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

async function load(raw: string) {
  const id = parseId(raw);
  if (!id || !hasDb) return null;
  try {
    const [song, rank] = await Promise.all([getSong(id), getRank(id, "human")]);
    return song ? { song, rank } : null;
  } catch {
    return null;
  }
}

export default async function OgImage({ params }: { params: Promise<{ id: string }> }) {
  const [font, found] = await Promise.all([anton, load((await params).id)]);
  const fonts = [{ name: "Anton", data: font, weight: 400 as const, style: "normal" as const }];
  const song = found?.song;
  const title = song ? clip(song.title, 60) : "THE DOOM 100";
  const stat = (label: string, value: string, hot?: boolean) => (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <span style={{ fontSize: 24, letterSpacing: 6, color: DIM }}>{label}</span>
      <span style={{ fontSize: 96, lineHeight: 1, color: hot ? ACID : INK, ...(hot ? { textShadow: `5px 5px 0 ${BLOOD}` } : {}) }}>
        {value}
      </span>
    </div>
  );
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "56px 72px",
          background: "radial-gradient(ellipse at 50% -20%, #2a3d00 0%, #0a0a0a 65%)",
          color: INK,
          fontFamily: "Anton",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 28, letterSpacing: 8, textTransform: "uppercase" }}>
          <span style={{ color: BLOOD }}>On the Doom 100</span>
          <span style={{ color: ACID, letterSpacing: 2 }}>doompop.top</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: title.length > 28 ? 84 : 120, lineHeight: 0.95, textTransform: "uppercase" }}>{title}</div>
          {song?.artist && <div style={{ display: "flex", fontSize: 40, color: DIM, marginTop: 14 }}>{clip(song.artist, 50)}</div>}
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 56, borderTop: `4px solid ${INK}`, paddingTop: 20 }}>
          {found?.rank && stat("RANK", `#${found.rank.rank}`, true)}
          {song && stat("ELO", String(Math.round(song.rating)))}
          {song && stat("RECORD", `${song.wins}–${song.losses}`)}
          <span style={{ display: "flex", marginLeft: "auto", fontSize: 32, color: DIM }}>
            {song ? "vote on what slaps" : "AI songs about AI doom"}
          </span>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
