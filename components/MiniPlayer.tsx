"use client";
import { useEffect, useRef, useState } from "react";
import Embed from "@/components/Embed";
import { videoLabel } from "@/components/format";
import type { Video } from "@/lib/db";

type NowPlaying = { title: string; artist: string | null; video: Video };

const EVENT = "doompop:play";

export function play(now: NowPlaying) {
  window.dispatchEvent(new CustomEvent<NowPlaying>(EVENT, { detail: now }));
}

// A small window docked at the bottom of the page, so songs play without leaving the chart.
export default function MiniPlayer() {
  const [now, setNow] = useState<NowPlaying | null>(null);
  const [broken, setBroken] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const on = (e: Event) => {
      setBroken(false);
      setNow((e as CustomEvent<NowPlaying>).detail);
    };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);

  useEffect(() => {
    ref.current?.play().catch(() => {});
  }, [now]);

  if (!now) return null;
  const v = now.video;
  return (
    <aside className="mini" aria-label="Now playing">
      <div className="mini-head">
        <div className="mini-title">
          <b>{now.title}</b>
          <span>
            {now.artist ? `${now.artist} · ` : ""}
            {videoLabel(v)}
          </span>
        </div>
        <a className="mini-out" href={v.url} target="_blank" rel="noreferrer" title="Open the original post">
          ↗
        </a>
        <button className="mini-close" onClick={() => setNow(null)} aria-label="Close player">
          ✕
        </button>
      </div>
      {v.media_url && !broken ? (
        <video
          key={v.id}
          ref={ref}
          className="mini-video"
          src={v.media_url}
          controls
          autoPlay
          playsInline
          onError={() => setBroken(true)}
        />
      ) : (
        <div className="mini-embed">
          <Embed key={v.id} platform={v.platform} embedId={v.embed_id} url={v.url} autoplay />
        </div>
      )}
    </aside>
  );
}
