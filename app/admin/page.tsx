"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Embed from "@/components/Embed";
import type { Scene, Song, Video } from "@/lib/db";
import "./admin.css";

type Status = Song["status"];
type Stats = { songs: number; votes: number; pending: number };
type Post = (body: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
const KEY_STORE = "doompop-admin-key";
// Mirrors SCENES in lib/db, which can't be imported client-side (it pulls in postgres).
const SCENES: Record<Scene, string> = { claudia: "Claudia", slopcore: "Slopcore", "claude-pop": "Claude-Pop", other: "Other" };

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const fmtViews = (n: number | null) => (n == null ? "?" : compact.format(n));

// "Doom Song (Opus 5.5 video)!" -> "doom song"
const norm = (t: string) =>
  t
    .toLowerCase()
    .replace(/[([{][^)\]}]*[)\]}]/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

export default function AdminPage() {
  const [key, setKey] = useState("");
  const [authed, setAuthed] = useState(false);
  const [tab, setTab] = useState<Status>("pending");
  const [songs, setSongs] = useState<Song[]>([]);
  const [approved, setApproved] = useState<Song[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async (k: string, status: Status) => {
    const get = (s: Status) => fetch(`/api/admin?status=${s}`, { headers: { "x-admin-key": k }, cache: "no-store" });
    const r = await get(status);
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
    if (status === "approved") setApproved(d.songs);
    else {
      const a = await get("approved");
      if (a.ok) setApproved((await a.json()).songs);
    }
  }, []);

  useEffect(() => {
    try {
      const k = localStorage.getItem(KEY_STORE);
      if (k) {
        setKey(k);
        load(k, "pending");
      }
    } catch {}
  }, [load]);

  const post: Post = async (body) => {
    const r = await fetch("/api/admin", {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-key": key },
      body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => null);
    if ((!r.ok || d?.ok === false) && !d?.result) setFlash(`Didn't work${d?.result ? ` (${d.result})` : d?.error ? ` (${d.error})` : ""}.`);
    else setFlash(null);
    await load(key, tab);
    return d;
  };

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
    <div className="adm">
      <section className="hero">
        <h1>Back room</h1>
        {stats && (
          <p>
            {stats.songs} on the chart · {stats.pending} waiting · {stats.votes} votes cast
          </p>
        )}
      </section>
      <div className="adm-tabs">
        {(["pending", "approved", "rejected"] as Status[]).map((s) => (
          <button
            key={s}
            className={`btn ghost${tab === s ? " on" : ""}`}
            onClick={() => {
              setTab(s);
              setFlash(null);
              load(key, s);
            }}
          >
            {s}
          </button>
        ))}
      </div>
      {error && <div className="msg err">{error}</div>}
      {flash && <div className="msg err">{flash}</div>}
      {songs.length === 0 && <div className="empty">Nothing here.</div>}
      {songs.map((s) => (
        <AdminRow key={s.id} song={s} approved={approved} post={post} />
      ))}
    </div>
  );
}

function AdminRow({ song, approved, post }: { song: Song; approved: Song[]; post: Post }) {
  const [title, setTitle] = useState(song.title);
  const [artist, setArtist] = useState(song.artist ?? "");
  const [scene, setScene] = useState<Scene | "">(song.scene ?? "");
  const [merging, setMerging] = useState(false);
  const dirty = title !== song.title || artist !== (song.artist ?? "") || scene !== (song.scene ?? "");
  const act = (body: Record<string, unknown>) => post({ id: song.id, ...body });

  const lookalike = useMemo(() => {
    if (song.status !== "pending") return null;
    const me = norm(song.title);
    if (!me) return null;
    return approved.find((a) => a.id !== song.id && (norm(a.title) === me || norm(a.title).includes(me))) ?? null;
  }, [song, approved]);

  const mergeInto = (target: Song) => {
    if (confirm(`Merge "${song.title}" into "${target.title}"? Its videos and votes move over and this entry goes away.`)) {
      act({ mergeInto: target.id });
    }
  };

  return (
    <div className="adm-row">
      <div className="adm-fields">
        <input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Title" />
        <input value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="Artist" aria-label="Artist" />
        <select value={scene} onChange={(e) => setScene(e.target.value as Scene | "")} aria-label="Scene">
          <option value="">no scene</option>
          {(Object.keys(SCENES) as Scene[]).map((k) => (
            <option key={k} value={k}>
              {SCENES[k]}
            </option>
          ))}
        </select>
      </div>
      <div className="artist">
        <b>{fmtViews(song.views)}</b> views · {Math.round(song.rating)} ({song.wins}W–{song.losses}L)
        {song.submitted_by && ` · from ${song.submitted_by}`}
      </div>
      {song.note && <div className="artist">“{song.note}”</div>}
      {lookalike && (
        <div className="adm-hint">
          Looks like: <b>{lookalike.title}</b>
          <button className="btn ghost" onClick={() => mergeInto(lookalike)}>
            Merge?
          </button>
        </div>
      )}
      <ul className="adm-videos">
        {song.videos.map((v, i) => (
          <VideoItem key={v.id} video={v} first={i === 0} many={song.videos.length > 1} post={post} />
        ))}
      </ul>
      <div className="acts">
        {dirty && (
          <button className="btn ghost" onClick={() => act({ title, artist, scene: scene || null })}>
            Save edits
          </button>
        )}
        {song.status !== "approved" && (
          <button className="btn ghost" onClick={() => act({ status: "approved" })}>
            Approve
          </button>
        )}
        {song.status !== "rejected" && (
          <button className="btn ghost" onClick={() => act({ status: "rejected" })}>
            Reject
          </button>
        )}
        {song.status !== "pending" && (
          <button className="btn ghost" onClick={() => act({ status: "pending" })}>
            Back to queue
          </button>
        )}
        <button className={`btn ghost${merging ? " on" : ""}`} onClick={() => setMerging(!merging)}>
          Merge into…
        </button>
      </div>
      {merging && <MergePicker song={song} approved={approved} onPick={mergeInto} />}
      <AddLink onAdd={(url) => act({ addUrl: url })} />
    </div>
  );
}

function VideoItem({ video: v, first, many, post }: { video: Video; first: boolean; many: boolean; post: Post }) {
  const [open, setOpen] = useState(first);
  return (
    <li>
      <div className="adm-vid">
        <span className="badge">{v.platform}</span>
        <span>{fmtViews(v.views)} views</span>
        {v.artist && <span>{v.artist}</span>}
        <a href={v.url} target="_blank" rel="noreferrer">
          {v.url.replace(/^https?:\/\/(www\.)?/, "")}
        </a>
      </div>
      <div className="acts">
        <button className="btn ghost" onClick={() => setOpen(!open)}>
          {open ? "hide player" : "show player"}
        </button>
        {many && (
          <>
            <button className="btn ghost" onClick={() => post({ videoId: v.id, split: true })}>
              Split off
            </button>
            <button
              className="btn ghost"
              onClick={() => confirm(`Remove ${v.url} from this song?`) && post({ videoId: v.id, remove: true })}
            >
              Remove
            </button>
          </>
        )}
      </div>
      {open && <Embed platform={v.platform} embedId={v.embed_id} url={v.url} />}
    </li>
  );
}

function MergePicker({ song, approved, onPick }: { song: Song; approved: Song[]; onPick: (s: Song) => void }) {
  const [q, setQ] = useState("");
  const hits = useMemo(() => {
    const n = norm(q);
    return approved
      .filter((a) => a.id !== song.id && (!n || norm(`${a.title} ${a.artist ?? ""}`).includes(n)))
      .slice(0, 8);
  }, [q, approved, song.id]);
  return (
    <div className="adm-merge">
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search approved songs" aria-label="Search approved songs" />
      {hits.length === 0 && <div className="artist">No match.</div>}
      {hits.map((a) => (
        <button key={a.id} className="adm-pick" onClick={() => onPick(a)}>
          {a.title}
          <span className="artist">
            {a.artist ?? "?"} · {fmtViews(a.views)} views · {a.videos.length} video{a.videos.length === 1 ? "" : "s"}
          </span>
        </button>
      ))}
    </div>
  );
}

function AddLink({ onAdd }: { onAdd: (url: string) => Promise<Record<string, unknown> | null> }) {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<string | null>(null);
  return (
    <form
      className="adm-add"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!url.trim()) return;
        const d = await onAdd(url.trim());
        const r = typeof d?.result === "string" ? d.result : "error";
        setResult(r);
        if (r === "ok") setUrl("");
      }}
    >
      <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Add link (another video of this song)" aria-label="Add link" />
      <button className="btn ghost">Add</button>
      {result && <span className={result === "ok" ? "adm-ok" : "adm-bad"}>{result === "ok" ? "added" : result}</span>}
    </form>
  );
}
