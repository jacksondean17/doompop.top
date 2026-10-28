"use client";
import { useEffect, useRef, useState } from "react";
import Embed from "@/components/Embed";
import type { Video } from "@/lib/db";

export const CLIP_SECONDS = 15;

// Where the catchy bit starts: the admin-set hook, else about a third in (roughly the first chorus).
export function hookStart(v: Video): number {
  if (v.hook_s != null) return v.hook_s;
  if (v.duration_ms) return Math.round((v.duration_ms / 1000) * 0.33);
  return v.platform === "youtube" ? 45 : 0;
}

// Plays a video from its hook while `active`, pauses otherwise. Direct MP4s (X) get full control;
// YouTube is restarted at the hook; anything else falls back to the plain embed.
export default function HookPlayer({
  video,
  active,
  onBlocked,
  onUserPlay,
}: {
  video: Video;
  active: boolean;
  onBlocked: () => void;
  onUserPlay: () => void; // the visitor pressed play on this player's own controls
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const ours = useRef(false); // true while a play() we started is pending, to tell it apart from the visitor's
  const [muted, setMuted] = useState(false);
  const [broken, setBroken] = useState(false);
  const start = hookStart(video);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!active) {
      el.pause();
      return;
    }
    if (!el.paused) return; // already playing because the visitor started it; leave their position alone
    if (Math.abs(el.currentTime - start) > 1 && el.currentTime < start + CLIP_SECONDS - 1) el.currentTime = start;
    ours.current = true;
    el.play().catch(() => {
      // Sound blocked until the visitor interacts: play muted and ask for a tap.
      el.muted = true;
      setMuted(true);
      el.play().catch(onBlocked);
    });
  }, [active, start, onBlocked]);

  if (video.media_url && !broken) {
    return (
      <div className="embed hook-player">
        <video
          ref={ref}
          src={`${video.media_url}#t=${start}`}
          controls
          playsInline
          preload="metadata"
          onError={() => setBroken(true)}
          onPlay={() => {
            if (ours.current) ours.current = false;
            else onUserPlay();
          }}
        />
        {muted && active && (
          <button
            className="btn ghost unmute"
            onClick={() => {
              if (ref.current) ref.current.muted = false;
              setMuted(false);
            }}
          >
            🔊 Tap for sound
          </button>
        )}
      </div>
    );
  }
  if (video.platform === "youtube") {
    return <Embed key={`${video.id}-${active}`} platform="youtube" embedId={video.embed_id} url={video.url} start={start} autoplay={active} />;
  }
  return <Embed platform={video.platform} embedId={video.embed_id} url={video.url} />;
}
