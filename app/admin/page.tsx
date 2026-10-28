"use client";
import { useCallback, useEffect, useState } from "react";
import Embed from "@/components/Embed";
import type { Song } from "@/lib/db";

type Status = Song["status"];
const KEY_STORE = "doompop-admin-key";

export default function AdminPage() {
  const [key, setKey] = useState("");
  const [authed, setAuthed] = useState(false);
  const [tab, setTab] = useState<Status>("pending");
  const [songs, setSongs] = useState<Song[]>([]);
  const [stats, setStats] = useState<{ songs: number; votes: number; pending: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (k: string, status: Status) => {
      const r = await fetch(`/api/admin?status=${status}`, { headers: { "x-admin-key": k }, cache: "no-store" });
      if (r.status === 401) {
        setAuthed(false);
        setError("Wrong key.");
        return;
      }
      const d = await r.json();
      if (!r.ok) {
        setError(d.error === "offline" ? "No database connected." : "Something broke.");
        return;
      }
      setError(null);
      setAuthed(true);
      setSongs(d.songs);
      setStats(d.stats);
      try {
        localStorage.setItem(KEY_STORE, k);
      } catch {}
    },
    [],
  );

  useEffect(() => {
    try {
      const k = localStorage.getItem(KEY_STORE);
      if (k) {
        setKey(k);
        load(k, "pending");
      }
    } catch {}
  }, [load]);

  async function act(id: number, body: Partial<Pick<Song, "status" | "title" | "artist">>) {
    await fetch("/api/admin", {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-key": key },
      body: JSON.stringify({ id, ...body }),
    });
    load(key, tab);
  }

  if (!authed) {
    return (
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          load(key, tab);
        }}
      >
        <section className="hero">
          <h1>Back room</h1>
        </section>
        <label>
          Admin key
          <input type="password" value={key} onChange={(e) => setKey(e.target.value)} />
        </label>
        {error && <div className="msg err">{error}</div>}
        <div>
          <button className="btn">Enter</button>
        </div>
      </form>
    );
  }

  return (
    <>
      <section className="hero">
        <h1>Back room</h1>
        {stats && (
          <p>
            {stats.songs} on the chart · {stats.pending} waiting · {stats.votes} votes cast
          </p>
        )}
      </section>
      <div className="tabs">
        {(["pending", "approved", "rejected"] as Status[]).map((s) => (
          <button
            key={s}
            className="btn ghost"
            style={tab === s ? { borderColor: "var(--acid)", color: "var(--acid)" } : undefined}
            onClick={() => {
              setTab(s);
              load(key, s);
            }}
          >
            {s}
          </button>
        ))}
      </div>
      {error && <div className="msg err">{error}</div>}
      {songs.length === 0 && <div className="empty">Nothing here.</div>}
      {songs.map((s) => (
        <AdminRow key={s.id} song={s} onAct={(b) => act(s.id, b)} />
      ))}
    </>
  );
}

function AdminRow({ song, onAct }: { song: Song; onAct: (b: Partial<Song>) => void }) {
  const [title, setTitle] = useState(song.title);
  const [artist, setArtist] = useState(song.artist ?? "");
  const dirty = title !== song.title || artist !== (song.artist ?? "");
  return (
    <div className="admin-row">
      <input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Title" />
      <input value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="Artist" aria-label="Artist" />
      <div className="artist">
        <a href={song.url} target="_blank" rel="noreferrer">
          {song.url}
        </a>
        {song.submitted_by && ` · from ${song.submitted_by}`} · {Math.round(song.rating)} ({song.wins}W–{song.losses}L)
      </div>
      {song.note && <div className="artist">“{song.note}”</div>}
      <Embed platform={song.platform} embedId={song.embed_id} url={song.url} />
      <div className="acts">
        {dirty && (
          <button className="btn ghost" onClick={() => onAct({ title, artist })}>
            Save edits
          </button>
        )}
        {song.status !== "approved" && (
          <button className="btn ghost" onClick={() => onAct({ status: "approved" })}>
            Approve
          </button>
        )}
        {song.status !== "rejected" && (
          <button className="btn ghost" onClick={() => onAct({ status: "rejected" })}>
            Reject
          </button>
        )}
        {song.status !== "pending" && (
          <button className="btn ghost" onClick={() => onAct({ status: "pending" })}>
            Back to queue
          </button>
        )}
      </div>
    </div>
  );
}
