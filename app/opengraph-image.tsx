import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt = "doompop.top — The Doom 100";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage() {
  const anton = await readFile(join(process.cwd(), "node_modules/@fontsource/anton/files/anton-latin-400-normal.woff"));
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "radial-gradient(ellipse at 50% -20%, #2a3d00 0%, #0a0a0a 65%)",
          color: "#ece6d9",
          fontFamily: "Anton",
        }}
      >
        <div style={{ fontSize: 28, letterSpacing: 8, color: "#ff3b30", textTransform: "uppercase" }}>
          The official chart of the end times
        </div>
        <div style={{ display: "flex", fontSize: 200, lineHeight: 0.9 }}>
          THE DOOM&nbsp;<span style={{ color: "#c6ff00" }}>100</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 34 }}>
          <span>AI songs about AI doom, ranked by Elo</span>
          <span style={{ color: "#c6ff00" }}>doompop.top</span>
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: "Anton", data: anton, weight: 400, style: "normal" }] },
  );
}
