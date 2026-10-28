import type { Metadata } from "next";
import Nav from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "doompop.top — the doom 100",
  description: "Songs made by machines about the end of everything, ranked by Elo, two at a time.",
  metadataBase: new URL("https://doompop.top"),
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
            <a className="logo" href="/">
              doompop<b>.top</b>
            </a>
            <Nav />
          </div>
        </header>
        <main className="wrap">{children}</main>
        <footer className="foot">
          <div className="wrap">
            Doom pop: AI-made songs about AI-made doom. Ratings are Elo (K=32, everyone starts at 1500). Not affiliated
            with anyone, least of all the machines.
          </div>
        </footer>
      </body>
    </html>
  );
}
