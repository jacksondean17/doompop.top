import type { Metadata } from "next";
import MiniPlayer from "@/components/MiniPlayer";
import Nav from "@/components/Nav";
import VoteBar from "@/components/VoteBar";
import "./globals.css";

export const metadata: Metadata = {
  title: "doompop.top — the doom 100",
  description: "Songs made by machines about the end of everything, ranked by Elo, two at a time.",
  metadataBase: new URL("https://doompop.top"),
  // X's video CDN refuses MP4 requests that carry a referrer from other sites, so send none.
  // YouTube embeds need one and opt back in on the iframe (components/Embed.tsx).
  referrer: "no-referrer",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Anton&family=JetBrains+Mono:wght@400;700&display=swap"
        />
      </head>
      <body>
        <header className="top">
          <div className="wrap">
            <a className="logo" href="/" aria-label="doompop.top, the chart">
              doompop<b>.top</b>
            </a>
            <Nav />
          </div>
        </header>
        <main className="wrap">{children}</main>
        <footer className="foot">
          <div className="wrap">
            <p className="foot-cta">
              The chart only moves when you vote. <a href="/vote">Judge a matchup</a> or{" "}
              <a href="/submit">submit a song</a>.
            </p>
            <p>
              Doom pop: AI-made songs about AI-made doom. Ratings are Elo (K=32, everyone starts at 1500). Not
              affiliated with anyone, least of all the machines.
            </p>
          </div>
        </footer>
        <MiniPlayer />
        <VoteBar />
      </body>
    </html>
  );
}
