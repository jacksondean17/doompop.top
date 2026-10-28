"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import HookPlayer, { CLIP_SECONDS } from "@/components/HookPlayer";
import { formatCount, PLATFORM_LABEL } from "@/components/format";
import type { MatchSong } from "@/app/api/matchup/route";
import type { Scene } from "@/lib/db";

type Matchup = { token: string; songs: [MatchSong, MatchSong] };
type Autoplay = "off" | "hook" | "full";

const AUTOPLAY: [Autoplay, string][] = [
  ["off", "Off"],
  ["hook", "Hook"],
  ["full", "Full song"],
];
const AUTOPLAY_STORE = "doompop-autoplay";

const ERRORS: Record<string, string> = {
  offline: "No database connected yet. The chart is offline.",
  not_enough_songs: "Need at least two songs on the chart to fight. Submit some.",
  slow_down: "Easy. You're voting faster than a human listens. Take a breath.",
};

function SongCard({
  song,
  side,
  scenes,
  state,
  busy,
  delta,
  onVote,
  active,
  full,
  onPlay,
  onBlocked,
  onUserPlay,
  onEnded,
}: {
  song: MatchSong;
  side: "A" | "B";
  scenes: Record<Scene, string>;
  state: "won" | "lost" | null;
  busy: boolean;
  delta: number | null;
  onVote: () => void;
  active: boolean;
  full: boolean;
  onPlay: () => void;
  onBlocked: () => void;
  onUserPlay: () => void;
  onEnded: () => void;
}) {
  const [pick, setPick] = useState(0);
  const video = song.videos[pick] ?? song.videos[0];
  const meta = [song.scene && song.scene !== "other" ? scenes[song.scene] : null, song.views > 0 ? `${formatCount(song.views)} views` : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className={`card${state ? ` ${state}` : ""}${song.scene ? ` scene-${song.scene}` : ""}`}>
      <div className="card-head">
        <span className="side" aria-hidden="true">
          {side}
        </span>
        <div className="title">{song.title}</div>
        {song.artist && <div className="artist">{song.artist}</div>}
        {meta && <div className="meta">{meta}</div>}
        {!state && (
          <button className={`chip play-chip${active ? " on" : ""}`} onClick={onPlay} aria-pressed={active}>
            {`${active ? "♪ Playing" : "▶ Play"} ${full ? "from start" : "the hook"}`}
          </button>
        )}
      </div>
      {song.videos.length > 1 && (
        <div className="versions" role="tablist" aria-label="Versions">
          {song.videos.map((v, i) => (
            <button
              key={v.id}
              role="tab"
              aria-selected={i === pick}
              className={`chip${i === pick ? " on" : ""}`}
              onClick={() => setPick(i)}
              title={PLATFORM_LABEL[v.platform]}
            >
              v{i + 1}
              {v.views ? ` · ${formatCount(v.views)}` : ` · ${PLATFORM_LABEL[v.platform]}`}
            </button>
          ))}
        </div>
      )}
      {video ? (
        <HookPlayer
          key={video.id}
          video={video}
          active={active && !state}
          full={full}
          onBlocked={onBlocked}
          onUserPlay={onUserPlay}
          onEnded={onEnded}
        />
      ) : (
        <div className="embed" />
      )}
      <button className="btn vote-btn" disabled={busy} onClick={onVote} aria-label={`Vote for ${song.title}: this one slaps`}>
        {state === "won" ? "✓ Your pick" : state === "lost" ? "Not this time" : `▲ ${side} slaps`}
      </button>
      <div className={`delta${state === "lost" ? " neg" : ""}`}>
        {delta !== null && state && (state === "won" ? `+${delta.toFixed(1)} Elo` : `−${delta.toFixed(1)} Elo`)}
        {state && (
          <a className="card-link" href={`/song/${song.id}`}>
            song page →
          </a>
        )}
      </div>
    </div>
  );
}

export default function VoteBooth({ scenes }: { scenes: Record<Scene, string> }) {
  const [match, setMatch] = useState<Matchup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [delta, setDelta] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(0);
  const statusRef = useRef<HTMLDivElement>(null);
  const seen = useRef<number[]>([]); // the last few songs shown, so the next pair is someone new
  // Which card is playing (0 = A, 1 = B). `auto` plays A then B: CLIP_SECONDS of each in "hook" mode,
  // each to its end in "full" mode. The visitor's mode lives in localStorage, read after hydration.
  const [playing, setPlaying] = useState<0 | 1 | null>(null);
  const [auto, setAuto] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const [mode, setMode] = useState<Autoplay>("hook");
  const modeRef = useRef<Autoplay>("hook");
  useEffect(() => {
    try {
      const m = localStorage.getItem(AUTOPLAY_STORE);
      if (m === "off" || m === "hook" || m === "full") {
        modeRef.current = m;
        setMode(m);
      }
    } catch {}
  }, []);
  const pickMode = (m: Autoplay) => {
    modeRef.current = m;
    setMode(m);
    setPlaying(null);
    setAuto(false);
    if (m === "off") setNeedsTap(false);
    try {
      localStorage.setItem(AUTOPLAY_STORE, m);
    } catch {}
  };
  const blocked = useCallback(() => {
    setPlaying(null);
    setAuto(false);
    setNeedsTap(true);
  }, []);
  const startHooks = useCallback(() => {
    setNeedsTap(false);
    setAuto(true);
    setPlaying(0);
  }, []);

  // Browsers only allow sound after the visitor has interacted with the page; until then, offer a button.
  useEffect(() => {
    if (!match) return;
    if (modeRef.current === "off") {
      setPlaying(null);
      setNeedsTap(false);
      return;
    }
    const nav = navigator as Navigator & { userActivation?: { hasBeenActive: boolean } };
    if (nav.userActivation?.hasBeenActive) startHooks();
    else {
      setPlaying(null);
      setNeedsTap(true);
    }
  }, [match, startHooks]);

  const advance = useCallback(() => {
    if (playing === 0) setPlaying(1);
    else {
      setPlaying(null);
      setAuto(false);
    }
  }, [playing]);

  useEffect(() => {
    if (!auto || playing === null || mode !== "hook") return;
    const t = setTimeout(advance, CLIP_SECONDS * 1000);
    return () => clearTimeout(t);
  }, [auto, playing, mode, advance]);

  const load = useCallback(async () => {
    setBusy(true);
    setPicked(null);
    setDelta(null);
    try {
      const r = await fetch(`/api/matchup?recent=${seen.current.join(",")}`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) {
        setError(ERRORS[d.error] ?? "Something broke.");
        setMatch(null);
      } else {
        setError(null);
        setMatch(d);
        seen.current = [...(d as Matchup).songs.map((x) => x.id), ...seen.current].slice(0, 8);
      }
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }, []);

  // After a vote, bring the next pair back into view (on phones you're scrolled down to the button).
  const next = useCallback(async () => {
    await load();
    const el = statusRef.current;
    if (el && el.getBoundingClientRect().top < 0) {
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ block: "start", behavior: still ? "auto" : "smooth" });
    }
  }, [load]);

  useEffect(() => {
    load();
  }, [load]);

  async function vote(winner: number) {
    if (!match || busy || picked) return;
    setPlaying(null);
    setAuto(false);
    setBusy(true);
    setPicked(winner);
    try {
      const r = await fetch("/api/vote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: match.token, winner }),
      });
      const d = await r.json();
      if (r.ok) {
        setDelta(d.delta);
        setCount((c) => c + 1);
        setTimeout(next, 1300);
      } else if (d.error === "slow_down") {
        setError(ERRORS.slow_down);
        setBusy(false);
      } else {
        load();
      }
    } catch {
      setError("Vote didn't go through.");
      setBusy(false);
    }
  }

  const winner = match && picked ? match.songs.find((s) => s.id === picked) : null;

  return (
    <>
      <section className="hero hero-vote">
        <p className="kicker">
          Head to head
          {count > 0 && <span className="count-pill">{count} judged</span>}
        </p>
        <h1>
          Which one <em>hits</em>?
        </h1>
        <p className="vote-how">
          {mode === "off" ? (
            <>Nothing plays on its own: hit <b>▶ Play the hook</b> on a card to hear it.</>
          ) : mode === "full" ? (
            <>A plays from the start, then B.</>
          ) : (
            <>The catchy bit of A plays, then B.</>
          )}{" "}
          Press <b>▲ slaps</b> under the one you&apos;d keep. <b>Skip</b> deals a fresh pair and counts nothing.
        </p>
        <div className="chips autoplay" role="group" aria-label="Autoplay">
          <span className="chips-label">Autoplay</span>
          {AUTOPLAY.map(([k, text]) => (
            <button key={k} className={`chip${k === mode ? " on" : ""}`} aria-pressed={k === mode} onClick={() => pickMode(k)}>
              {text}
            </button>
          ))}
        </div>
      </section>

      {error && (
        <div className="notice">
          <span className="notice-big">{error.startsWith("Easy") ? "Cool it" : "No fight right now"}</span>
          {error}{" "}
          {error === ERRORS.not_enough_songs ? (
            <a href="/submit">Submit a song</a>
          ) : error !== ERRORS.offline ? (
            <button className="linkish" onClick={load} disabled={busy}>
              Try again
            </button>
          ) : null}
        </div>
      )}

      {match && (
        <>
          <div ref={statusRef} className={`vote-status${picked ? " live" : ""}`} role="status" aria-live="polite">
            {picked && winner ? (
              delta !== null ? (
                <>
                  <b>Counted.</b> {winner.title} +{delta.toFixed(1)}. Next pair incoming…
                </>
              ) : (
                <>Sending your vote…</>
              )
            ) : count > 0 ? (
              <>Nice. {count === 1 ? "One down." : `${count} down.`} Keep going, the chart is listening.</>
            ) : (
              <>Your pick moves both songs on the chart.</>
            )}
          </div>
          {needsTap && !picked && mode !== "off" && (
            <div className="hooks-cta">
              <button className="btn" onClick={startHooks}>
                {mode === "full" ? "▶ Play songs" : "▶ Play hooks"}
              </button>
              <span className="hint">
                {mode === "full"
                  ? "A from the start, then B."
                  : `${CLIP_SECONDS}s of A, then ${CLIP_SECONDS}s of B, from the catchy bit.`}{" "}
                After this, every pair plays on its own.
              </span>
            </div>
          )}
          <div className="versus">
            {match.songs.map((s, i) => (
              <div key={`${match.token}-${s.id}`} style={{ display: "contents" }}>
                {i === 1 && (
                  <div className="vs" aria-hidden="true">
                    vs
                  </div>
                )}
                <SongCard
                  side={i === 0 ? "A" : "B"}
                  song={s}
                  scenes={scenes}
                  state={picked === s.id ? "won" : picked ? "lost" : null}
                  busy={busy}
                  delta={delta}
                  onVote={() => vote(s.id)}
                  active={playing === i}
                  full={mode === "full"}
                  onPlay={() => {
                    setNeedsTap(false);
                    setAuto(false);
                    setPlaying(playing === i ? null : (i as 0 | 1));
                  }}
                  onBlocked={blocked}
                  onUserPlay={() => {
                    // Starting one side by hand pauses the other and ends the A-then-B sequence.
                    setNeedsTap(false);
                    setAuto(false);
                    setPlaying(i as 0 | 1);
                  }}
                  onEnded={() => {
                    if (auto && playing === i) advance();
                  }}
                />
              </div>
            ))}
          </div>
          <div className="skip-row">
            <button className="btn ghost" disabled={busy} onClick={load}>
              Skip this pair
            </button>
            <span className="hint">Can&apos;t decide? Skipping counts nothing.</span>
            <a className="skip-chart" href="/">
              See the chart
            </a>
          </div>
        </>
      )}
    </>
  );
}
