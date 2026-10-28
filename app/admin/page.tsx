"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Embed from "@/components/Embed";
import type { DupeMatch, DupePair, Scene, Song, Video } from "@/lib/db";
import "./admin.css";

type Status = Song["status"];
type Stats = { songs: number; votes: number; pending: number };
type Post = (body: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
type Search = (q: string) => Promise<Song[]>;
const KEY_STORE = "doompop-admin-key";
// Mirrors SCENES in lib/db, which can't be imported client-side (it pulls in postgres).
const SCENES: Record<Scene, string> = { claudia: "Claudia", slopcore: "Slopcore", "claude-pop": "Claude-Pop", other: "Other" };

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const fmtViews = (n: number | null) => (n == null ? "?" : compact.format(n));
const isUrl = (t: string) => /^https?:\/\//i.test(t.trim());

// Runs a search a moment after the text stops changing, and again whenever `rev` bumps.
function useSearch(search: Search, text: string, rev = 0): Song[] | null {
  const [hits, setHits] = useState<Song[] | null>(null);
  useEffect(() => {
    if (!text.trim()) {
      setHits(null);
      return;
    }
    let live = true;
    const t = setTimeout(() => search(text).then((s) => live && setHits(s)), 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [search, text, rev]);
  return hits;
}

export default function AdminPage() {
  const [key, setKey] = useState("");
  const [authed, setAuthed] = useState(false);
  const [tab, setTab] = useState<Status>("pending");
  const [songs, setSongs] = useState<Song[]>([]);
  const [hints, setHints] = useState<Record<number, DupeMatch[]>>({});
  const [pairs, setPairs] = useState<DupePair[]>([]);
  const [rev, setRev] = useState(0); // bumps after every load so open searches refresh too
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async (k: string, status: Status) => {
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
    setHints(d.hints ?? {});
    setPairs(d.pairs ?? []);
    setRev((n) => n + 1);
    try {
      localStorage.setItem(KEY_STORE, k);
    } catch {}
  }, []);

  const search: Search = useCallback(
    async (q) => {
      const r = await fetch(`/api/admin?q=${encodeURIComponent(q)}`, { headers: { "x-admin-key": key }, cache: "no-store" });
      return r.ok ? (await r.json()).songs : [];
    },
    [key],
  );

  const switchTab = (s: Status) => {
    setTab(s);
    setFlash(null);
    load(key, s);
  };

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
          <button key={s} className={`btn ghost${tab === s ? " on" : ""}`} onClick={() => switchTab(s)}>
            {s}
          </button>
        ))}
      </div>
      {error && <div className="msg err">{error}</div>}
      {flash && <div className="msg err">{flash}</div>}
      <Finder search={search} rev={rev} post={post} />
      {tab === "approved" ? (
        <Pairs pairs={pairs} post={post} />
      ) : (
        pairs.length > 0 && (
          <button className="adm-pairs-link" onClick={() => switchTab("approved")}>
            {pairs.length} possible duplicate{pairs.length === 1 ? "" : "s"} on the chart →
          </button>
        )
      )}
      {songs.length === 0 && <div className="empty">Nothing here.</div>}
      {songs.map((s) => (
        <AdminRow key={s.id} song={s} hints={hints[s.id]} post={post} search={search} />
      ))}
    </div>
  );
}

const who = (m: DupeMatch) => `${m.artist ? `${m.artist} · ` : ""}${m.status} · ${m.votes} votes · ${Math.round(m.rating)}`;

// Finds any song by title, artist or link, with the full row so it can be merged or given a link.
function Finder({ search, rev, post }: { search: Search; rev: number; post: Post }) {
  const [text, setText] = useState("");
  const hits = useSearch(search, text, rev);
  return (
    <div className="adm-find">
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Find any song by title, artist or link" aria-label="Find a song" />
      {hits && hits.length === 0 && (
        <div className="artist">
          {isUrl(text) ? "No song has this link yet. Find the song by title and use its Add link box." : "No match."}
        </div>
      )}
      {hits && hits.length > 0 && isUrl(text) && <div className="artist">This link is already on:</div>}
      {hits?.map((s) => (
        <AdminRow key={s.id} song={s} post={post} search={search} />
      ))}
    </div>
  );
}

// Likely duplicates among approved songs, merged into whichever has more votes (then rating).
function Pairs({ pairs, post }: { pairs: DupePair[]; post: Post }) {
  if (!pairs.length) return null;
  const merge = (from: DupeMatch, into: DupeMatch) =>
    confirm(`Merge "${from.title}" into "${into.title}"? Its videos and votes move over and "${from.title}" goes away.`) &&
    post({ id: from.id, mergeInto: into.id });
  return (
    <section className="adm-pairs">
      <h2>Possible duplicates</h2>
      {pairs.map(({ from, into, score, reasons }) => (
        <div key={`${from.id}:${into.id}`} className="adm-pair">
          <div>
            <b>{from.title}</b> <span className="artist">({who(from)})</span>
            <span className="adm-arrow"> → into </span>
            <b>{into.title}</b> <span className="artist">({who(into)})</span>
          </div>
          <div className="artist">
            {reasons.join(", ")} · score {score.toFixed(2)}
          </div>
          <div className="acts">
            <button className="btn ghost" onClick={() => merge(from, into)}>
              Merge →
            </button>
            <button className="btn ghost" onClick={() => merge(into, from)}>
              Merge the other way
            </button>
            <button className="btn ghost" onClick={() => post({ id: from.id, notDupeOf: into.id })}>
              Not the same
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}

function AdminRow({ song, hints, post, search }: { song: Song; hints?: DupeMatch[]; post: Post; search: Search }) {
  const [title, setTitle] = useState(song.title);
  const [artist, setArtist] = useState(song.artist ?? "");
  const [scene, setScene] = useState<Scene | "">(song.scene ?? "");
  const [merging, setMerging] = useState(false);
  const dirty = title !== song.title || artist !== (song.artist ?? "") || scene !== (song.scene ?? "");
  const act = (body: Record<string, unknown>) => post({ id: song.id, ...body });

  const mergeInto = (target: { id: number; title: string }) => {
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
      {hints?.map((h) => (
        <div key={h.id} className="adm-hint">
          <span>
            Looks like: <b>{h.title}</b> <span className="adm-dim">({who(h)})</span>
            <br />
            <span className="adm-dim">
              {h.reasons.join(", ")}
              {h.score > 0 && ` · score ${h.score.toFixed(2)}`}
            </span>
          </span>
          <button className="btn ghost" onClick={() => mergeInto(h)}>
            Merge into this
          </button>
          <button className="btn ghost" onClick={() => act({ notDupeOf: h.id })}>
            Not the same
          </button>
        </div>
      ))}
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
      {merging && <MergePicker song={song} search={search} onPick={mergeInto} />}
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
        {!!v.play_fails && (
          <span className="adm-fail" title="Reported by visitors' players">
            ⚠ didn&apos;t play {v.play_fails}× ({v.play_fail_reason})
          </span>
        )}
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
      {open && <HookSetter video={v} post={post} />}
      {open && !v.media_url && <Embed platform={v.platform} embedId={v.embed_id} url={v.url} />}
    </li>
  );
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const parseTime = (t: string) => {
  const m = t.trim().match(/^(?:(\d+):)?(\d+(?:\.\d+)?)$/);
  return m ? Number(m[1] ?? 0) * 60 + Number(m[2]) : null;
};

// Where the vote page starts this video. With a direct MP4 you can scrub to the catchy bit and grab the time.
function HookSetter({ video: v, post }: { video: Video; post: Post }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [text, setText] = useState(v.hook_s != null ? mmss(v.hook_s) : "");
  const guess = v.duration_ms ? Math.round((v.duration_ms / 1000) * 0.33) : null;
  const save = (sec: number | null) => post({ videoId: v.id, hook: sec });
  return (
    <div className="adm-hook">
      {v.media_url && (
        <video ref={ref} src={v.media_url} controls preload="metadata" playsInline
          onLoadedMetadata={(e) => { if (v.hook_s != null) e.currentTarget.currentTime = v.hook_s; }} />
      )}
      <div className="acts">
        <span>
          Hook: {v.hook_s != null ? mmss(v.hook_s) : guess != null ? `guess ${mmss(guess)}` : "guess"}
        </span>
        {v.media_url && (
          <button className="btn ghost" onClick={() => ref.current && save(Math.round(ref.current.currentTime))}>
            Set hook here
          </button>
        )}
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="m:ss" aria-label="Hook time" size={6} />
        <button className="btn ghost" onClick={() => { const t = parseTime(text); if (t != null) save(t); }}>
          Save time
        </button>
        {v.hook_s != null && (
          <button className="btn ghost" onClick={() => save(null)}>
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

function MergePicker({ song, search, onPick }: { song: Song; search: Search; onPick: (s: Song) => void }) {
  const [q, setQ] = useState("");
  const hits = useSearch(search, q)?.filter((a) => a.id !== song.id && a.status !== "rejected");
  return (
    <div className="adm-merge">
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search songs by title, artist or link" aria-label="Search songs" />
      {hits?.length === 0 && <div className="artist">No match.</div>}
      {hits?.slice(0, 8).map((a) => (
        <button key={a.id} className="adm-pick" onClick={() => onPick(a)}>
          {a.title}
          <span className="artist">
            {a.artist ?? "?"} · {a.status} · {fmtViews(a.views)} views · {a.videos.map((v) => v.platform).join(", ")}
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
