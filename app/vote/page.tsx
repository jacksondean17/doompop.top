"use client";
import { useCallback, useEffect, useState } from "react";
import Embed from "@/components/Embed";
import type { Platform } from "@/lib/embed";

type MatchSong = { id: number; title: string; artist: string | null; platform: Platform; embed_id: string; url: string };
type Matchup = { token: string; songs: [MatchSong, MatchSong] };

const ERRORS: Record<string, string> = {
  offline: "No database connected yet. The chart is offline.",
  not_enough_songs: "Need at least two songs on the chart to fight. Submit some.",
  slow_down: "Easy. You're voting faster than a human listens. Take a breath.",
};

export default function VotePage() {
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
              <div key={s.id} style={{ display: "contents" }}>
                {i === 1 && <div className="vs">vs</div>}
                <div className={`card${picked === s.id ? " won" : picked ? " lost" : ""}`}>
                  <div>
                    <div className="title">{s.title}</div>
                    {s.artist && <div className="artist">{s.artist}</div>}
                  </div>
                  <Embed platform={s.platform} embedId={s.embed_id} url={s.url} />
                  <button className="btn" disabled={busy} onClick={() => vote(s.id)}>
                    This one slaps
                  </button>
                  <div className={`delta${picked && picked !== s.id ? " neg" : ""}`}>
                    {delta !== null && picked && (picked === s.id ? `+${delta.toFixed(1)}` : `−${delta.toFixed(1)}`)}
                  </div>
                </div>
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
