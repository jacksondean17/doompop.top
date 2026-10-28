"use client";
import { useCallback, useEffect, useState } from "react";
import Embed from "@/components/Embed";
import { formatCount, PLATFORM_LABEL } from "@/components/format";
import type { MatchSong } from "@/app/api/matchup/route";
import type { Scene } from "@/lib/db";

type Matchup = { token: string; songs: [MatchSong, MatchSong] };

const ERRORS: Record<string, string> = {
  offline: "No database connected yet. The chart is offline.",
  not_enough_songs: "Need at least two songs on the chart to fight. Submit some.",
  slow_down: "Easy. You're voting faster than a human listens. Take a breath.",
};

function SongCard({
  song,
  scenes,
  state,
  busy,
  delta,
  onVote,
}: {
  song: MatchSong;
  scenes: Record<Scene, string>;
  state: "won" | "lost" | null;
  busy: boolean;
  delta: number | null;
  onVote: () => void;
}) {
  const [pick, setPick] = useState(0);
  const video = song.videos[pick] ?? song.videos[0];
  const meta = [song.scene && song.scene !== "other" ? scenes[song.scene] : null, song.views > 0 ? `${formatCount(song.views)} views` : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className={`card${state ? ` ${state}` : ""}`}>
      <div>
        <div className="title">{song.title}</div>
        {song.artist && <div className="artist">{song.artist}</div>}
        {meta && <div className="meta">{meta}</div>}
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
        <Embed key={video.id} platform={video.platform} embedId={video.embed_id} url={video.url} />
      ) : (
        <div className="embed" />
      )}
      <button className="btn" disabled={busy} onClick={onVote}>
        This one slaps
      </button>
      <div className={`delta${state === "lost" ? " neg" : ""}`}>
        {delta !== null && state && (state === "won" ? `+${delta.toFixed(1)}` : `−${delta.toFixed(1)}`)}
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

  const load = useCallback(async () => {
    setBusy(true);
    setPicked(null);
    setDelta(null);
    try {
      const r = await fetch("/api/matchup", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) {
        setError(ERRORS[d.error] ?? "Something broke.");
        setMatch(null);
      } else {
        setError(null);
        setMatch(d);
      }
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function vote(winner: number) {
    if (!match || busy || picked) return;
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
        setTimeout(load, 900);
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

  return (
    <>
      <section className="hero">
        <p className="kicker">Head to head{count > 0 ? ` · ${count} judged` : ""}</p>
        <h1>
          Which one <em>hits</em>?
        </h1>
        <p>Listen to both. Pick the one that makes you feel the singularity in your bones.</p>
      </section>

      {error && <div className="notice">{error}</div>}

      {match && (
        <>
          <div className="versus">
            {match.songs.map((s, i) => (
              <div key={`${match.token}-${s.id}`} style={{ display: "contents" }}>
                {i === 1 && <div className="vs">vs</div>}
                <SongCard
                  song={s}
                  scenes={scenes}
                  state={picked === s.id ? "won" : picked ? "lost" : null}
                  busy={busy}
                  delta={delta}
                  onVote={() => vote(s.id)}
                />
              </div>
            ))}
          </div>
          <p className="center">
            <button className="btn ghost" disabled={busy} onClick={load}>
              Skip — can&apos;t decide
            </button>
          </p>
        </>
      )}
    </>
  );
}
