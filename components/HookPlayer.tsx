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

// Plays a video from its hook (or from 0 when `full`) while `active`, pauses otherwise. Direct MP4s (X)
// get full control; YouTube is restarted at the hook; anything else falls back to the plain embed.
export default function HookPlayer({
  video,
  active,
  full = false,
  onBlocked,
  onUserPlay,
  onEnded,
}: {
  video: Video;
  active: boolean;
  full?: boolean;
  onBlocked: () => void;
  onUserPlay: () => void; // the visitor pressed play on this player's own controls
  onEnded?: () => void; // full mode: the song finished (or, for YouTube, is presumed to have)
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const ours = useRef(false); // true while a play() we started is pending, to tell it apart from the visitor's
  const [muted, setMuted] = useState(false);
  const [broken, setBroken] = useState(false);
  const start = full ? 0 : hookStart(video);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!active) {
      el.pause();
      return;
    }
    if (!el.paused) return; // already playing because the visitor started it; leave their position alone
    if (full) {
      if (el.ended) el.currentTime = 0;
    } else if (Math.abs(el.currentTime - start) > 1 && el.currentTime < start + CLIP_SECONDS - 1) el.currentTime = start;
    ours.current = true;
    el.play().catch(() => {
      // Sound blocked until the visitor interacts: play muted and ask for a tap.
      el.muted = true;
      setMuted(true);
      el.play().catch(onBlocked);
    });
  }, [active, full, start, onBlocked]);

  // A YouTube iframe doesn't tell us when it ends, so guess from the known duration (it can't see pauses or
  // buffering). With no duration we never report an end, and the A-then-B sequence stops after A.
  const yt = !(video.media_url && !broken) && video.platform === "youtube";
  const ended = useRef(onEnded);
  useEffect(() => {
    ended.current = onEnded;
  });
  useEffect(() => {
    if (!full || !active || !yt || !video.duration_ms) return;
    const t = setTimeout(() => ended.current?.(), video.duration_ms);
    return () => clearTimeout(t);
  }, [full, active, yt, video.duration_ms]);

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
          onEnded={full ? onEnded : undefined}
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
