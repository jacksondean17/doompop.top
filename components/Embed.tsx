"use client";
import { useEffect, useRef } from "react";
import { iframeSrc, type Platform } from "@/lib/embed";

declare global {
  interface Window {
    twttr?: { widgets: { createTweet: (id: string, el: HTMLElement, opts: object) => Promise<unknown> } };
  }
}

let twitterScript: Promise<void> | null = null;
function loadTwitter(): Promise<void> {
  twitterScript ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://platform.twitter.com/widgets.js";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return twitterScript;
}

// `onFail` hears about posts that are gone or a widget that never loads (often a tracker blocker).
export function Tweet({ id, url, onFail }: { id: string; url: string; onFail?: (why: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const failRef = useRef(onFail);
  useEffect(() => {
    failRef.current = onFail;
  });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    const fallback = (why: string) => {
      if (cancelled) return;
      cancelled = true;
      el.innerHTML = `<a href="${url}" target="_blank" rel="noreferrer">Open on X ↗</a>`;
      failRef.current?.(why);
    };
    const t = setTimeout(() => fallback("tweet_timeout"), 10000);
    el.innerHTML = "";
    loadTwitter()
      .then(() => {
        if (!cancelled && window.twttr) return window.twttr.widgets.createTweet(id, el, { theme: "dark", dnt: true, align: "center" });
      })
      .then((made) => {
        clearTimeout(t);
        if (!cancelled && !made) fallback("tweet_missing");
      })
      .catch(() => {
        clearTimeout(t);
        fallback("tweet_blocked");
      });
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [id, url]);
  return <div className="embed tweet" ref={ref} />;
}

const HEIGHTS: Partial<Record<Platform, number>> = {
  youtube: 220,
  suno: 240,
  soundcloud: 300,
  spotify: 152,
  tiktok: 560,
};

export default function Embed({
  platform,
  embedId,
  url,
  start,
  autoplay,
}: {
  platform: Platform;
  embedId: string;
  url: string;
  start?: number;
  autoplay?: boolean;
}) {
  if (platform === "x") return <Tweet id={embedId} url={url} />;
  const src = iframeSrc(platform, embedId, { start, autoplay });
  if (!src) {
    return (
      <div className="embed">
        <a className="btn ghost" href={url} target="_blank" rel="noreferrer">
          Listen ↗
        </a>
      </div>
    );
  }
  return (
    <div className={`embed embed-${platform}`}>
      <iframe
        src={src}
        height={HEIGHTS[platform] ?? 240}
        loading="lazy"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        title="player"
      />
    </div>
  );
}
