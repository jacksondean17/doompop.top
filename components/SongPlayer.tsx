"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Embed, { Tweet } from "@/components/Embed";
import { PLATFORM_LABEL, videoLabel } from "@/components/format";
import { iframeSrc } from "@/lib/embed";
import type { Video } from "@/lib/db";

// YouTube's "this video can't be played here" codes: removed, private, or embedding switched off.
const DEAD_YT = /^youtube_(100|101|150)$/;

// Most reliable first: our own MP4 player, then YouTube (which reports errors), then other embeds,
// then the X post widget, then plain links. Versions that keep failing for everyone go last.
function rank(v: Video): number {
  if (v.play_fail_reason && DEAD_YT.test(v.play_fail_reason)) return 9;
  if (v.media_url) return 0;
  if (v.platform === "youtube") return 1;
  if (v.platform === "x") return 3;
  if (v.platform === "link") return 4;
  return 2;
}

export function playOrder(videos: Video[], pick?: number): Video[] {
  const sorted = [...videos].sort((a, b) => rank(a) - rank(b));
  const first = sorted.find((v) => v.id === pick);
  return first ? [first, ...sorted.filter((v) => v !== first)] : sorted;
}

function report(videoId: number, reason: string) {
  try {
    navigator.sendBeacon("/api/playback", JSON.stringify({ videoId, reason }));
  } catch {}
}

// Plays a song, falling through its versions until one works. Failures are reported so /admin
// can see which links don't play.
export default function SongPlayer({
  videos,
  pick,
  autoplay = false,
  onVideo,
}: {
  videos: Video[];
  pick?: number;
  autoplay?: boolean;
  onVideo?: (v: Video | null) => void;
}) {
  const order = useMemo(() => playOrder(videos, pick), [videos, pick]);
  const [i, setI] = useState(0);
  const [failed, setFailed] = useState<{ v: Video; why: string }[]>([]);
  const [chosen, setChosen] = useState(false);
  const v = order[i] ?? null;

  useEffect(() => {
    setI(0);
    setFailed([]);
  }, [order]);
  useEffect(() => onVideo?.(v), [v, onVideo]);

  const fail = (why: string) => {
    if (!v) return;
    if (why !== "no_player") report(v.id, why);
    setFailed((f) => [...f, { v, why }]);
    setI((n) => n + 1);
  };

  const choose = (to: Video) => {
    setFailed([]);
    setChosen(true);
    setI(order.indexOf(to));
  };

  return (
    <div className="song-player">
      {v ? (
        <Source key={v.id} video={v} autoplay={autoplay || chosen || failed.length > 0} onFail={fail} />
      ) : (
        <div className="sp-dead">
          <b>Couldn&apos;t play this one here.</b>
          <span>Try the original:</span>
          <div className="sp-outs">
            {order.map((o) => (
              <a key={o.id} className="btn ghost" href={o.url} target="_blank" rel="noreferrer">
                {PLATFORM_LABEL[o.platform]} ↗
              </a>
            ))}
          </div>
        </div>
      )}
      {v && failed.length > 0 && (
        <p className="sp-note">
          {failed.length === 1 ? `${videoLabel(failed[0].v)} wouldn't play here` : `${failed.length} versions wouldn't play here`}, so
          this is {videoLabel(v)}.
        </p>
      )}
      {order.length > 1 && (
        <div className="versions sp-versions" role="tablist" aria-label="Versions">
          {order.map((o) => (
            <button
              key={o.id}
              role="tab"
              aria-selected={o === v}
              className={`chip${o === v ? " on" : ""}`}
              onClick={() => choose(o)}
            >
              {videoLabel(o)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Source({ video: v, autoplay, onFail }: { video: Video; autoplay: boolean; onFail: (why: string) => void }) {
  const failRef = useRef(onFail);
  useEffect(() => {
    failRef.current = onFail;
  });
  const fail = useCallback((why: string) => failRef.current(why), []);

  if (v.media_url) return <Mp4 video={v} autoplay={autoplay} onFail={fail} />;
  if (v.platform === "youtube") return <YouTube video={v} autoplay={autoplay} onFail={fail} />;
  if (v.platform === "x") return <Tweet id={v.embed_id} url={v.url} onFail={fail} />;
  if (v.platform === "link") return <NoPlayer onFail={fail} />;
  return <Embed platform={v.platform} embedId={v.embed_id} url={v.url} autoplay={autoplay} />;
}

function NoPlayer({ onFail }: { onFail: (why: string) => void }) {
  useEffect(() => onFail("no_player"), [onFail]);
  return null;
}

function Mp4({ video: v, autoplay, onFail }: { video: Video; autoplay: boolean; onFail: (why: string) => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    if (autoplay) ref.current?.play().catch(() => setBlocked(true)); // blocked autoplay isn't a failure; the controls are there
  }, [autoplay]);
  // Some browsers (iOS) load nothing until playback starts, so only time out while we're trying to play.
  useEffect(() => {
    if (ready || blocked || !autoplay) return;
    const t = setTimeout(() => onFail("video_timeout"), 12000);
    return () => clearTimeout(t);
  }, [ready, blocked, autoplay, onFail]);
  return (
    <video
      ref={ref}
      className="sp-video"
      src={v.media_url!}
      controls
      playsInline
      preload="metadata"
      onLoadedMetadata={() => setReady(true)}
      onError={() => onFail("video_error")}
    />
  );
}

// The embed reports errors over postMessage once we say we're listening (the IFrame API's protocol).
function YouTube({ video: v, autoplay, onFail }: { video: Video; autoplay: boolean; onFail: (why: string) => void }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const src = `${iframeSrc("youtube", v.embed_id, { autoplay })}&enablejsapi=1`;
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.source !== ref.current?.contentWindow || typeof e.data !== "string") return;
      try {
        const d = JSON.parse(e.data);
        if (d.event === "onError") onFail(`youtube_${d.info}`);
      } catch {}
    };
    window.addEventListener("message", on);
    return () => window.removeEventListener("message", on);
  }, [onFail]);
  return (
    <div className="embed embed-youtube">
      <iframe
        ref={ref}
        src={src}
        onLoad={() => ref.current?.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: v.id, channel: "widget" }), "*")}
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        title="player"
      />
    </div>
  );
}
