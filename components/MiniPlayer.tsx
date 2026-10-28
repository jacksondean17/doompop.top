"use client";
import { useCallback, useEffect, useState } from "react";
import SongPlayer from "@/components/SongPlayer";
import { videoLabel } from "@/components/format";
import type { Video } from "@/lib/db";

type NowPlaying = { title: string; artist: string | null; videos: Video[]; pick?: number };

const EVENT = "doompop:play";

export function play(now: NowPlaying) {
  window.dispatchEvent(new CustomEvent<NowPlaying>(EVENT, { detail: now }));
}

// A small window docked at the bottom of the page, so songs play without leaving the chart.
export default function MiniPlayer() {
  const [now, setNow] = useState<NowPlaying | null>(null);
  const [current, setCurrent] = useState<Video | null>(null);
  const onVideo = useCallback((v: Video | null) => setCurrent(v), []);

  useEffect(() => {
    const on = (e: Event) => setNow((e as CustomEvent<NowPlaying>).detail);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);

  if (!now) return null;
  return (
    <aside className="mini" aria-label="Now playing">
      <div className="mini-head">
        <div className="mini-title">
          <b>{now.title}</b>
          <span>
            {now.artist ? `${now.artist} · ` : ""}
            {current ? videoLabel(current) : "no playable version"}
          </span>
        </div>
        {current && (
          <a className="mini-out" href={current.url} target="_blank" rel="noreferrer" title="Open the original post">
            ↗
          </a>
        )}
        <button className="mini-close" onClick={() => setNow(null)} aria-label="Close player">
          ✕
        </button>
      </div>
      <div className="mini-body">
        <SongPlayer key={`${now.title}-${now.pick}-${now.videos.map((v) => v.id).join()}`} videos={now.videos} pick={now.pick} autoplay onVideo={onVideo} />
      </div>
    </aside>
  );
}
