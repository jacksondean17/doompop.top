import postgres from "postgres";
import { SEED_SONGS } from "./seed";
import { parseSource, type Platform } from "./embed";

export const SCENES = {
  claudia: "Claudia",
  slopcore: "Slopcore",
  "claude-pop": "Claude-Pop",
  other: "Other",
} as const;
export type Scene = keyof typeof SCENES;

export type Video = {
  id: number;
  song_id: number;
  url: string;
  platform: Platform;
  embed_id: string;
  artist: string | null;
  views: number | null;
  likes: number | null;
  posted_at: string | null;
  media_url: string | null; // direct MP4 (X), so the vote page can start at the hook
  duration_ms: number | null;
  hook_s: number | null; // where the catchy bit starts; null = guess
};

export type Song = {
  id: number;
  title: string;
  artist: string | null;
  scene: Scene | null;
  status: "pending" | "approved" | "rejected";
  rating: number;
  prior: number;
  wins: number;
  losses: number;
  views: number;
  likes: number;
  released_at: string | null;
  submitted_by: string | null;
  note: string | null;
  submitted_at: string;
  recent_votes?: number;
  videos: Video[]; // most-viewed first
};

export const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
export const hasDb = Boolean(DB_URL);

const local = /@(localhost|127\.0\.0\.1)[:/]/.test(DB_URL);
// One connection per serverless instance; prepare:false keeps it compatible with pooled (pgbouncer) URLs.
const sql = hasDb
  ? postgres(DB_URL, {
      max: 1,
      idle_timeout: 20,
      prepare: false,
      ssl: local ? false : "require",
      onnotice: () => {},
      // View counts fit comfortably in a JS number.
      types: { bigint: { to: 20, from: [20], serialize: (x: number) => String(x), parse: (x: string) => Number(x) } },
    })
  : null;

let ready: Promise<void> | null = null;

// Schema is created and migrated lazily on first use so nobody has to run migrations.
function ensureSchema(): Promise<void> {
  if (!sql) return Promise.reject(new Error("No database configured"));
  ready ??= sql.begin(async (sql) => {
    // Cold starts can race on a fresh database; serialize setup.
    await sql`SELECT pg_advisory_xact_lock(424242)`;
    await sql`
      CREATE TABLE IF NOT EXISTS songs (
        id SERIAL PRIMARY KEY,
        url TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        artist TEXT,
        platform TEXT NOT NULL,
        embed_id TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending',
        rating DOUBLE PRECISION NOT NULL DEFAULT 1500,
        wins INT NOT NULL DEFAULT 0,
        losses INT NOT NULL DEFAULT 0,
        submitted_by TEXT,
        submitter_hash TEXT,
        note TEXT,
        submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
    // v2: a song has many videos; songs.url/platform/embed_id are kept only as the first video seen.
    await sql`ALTER TABLE songs ADD COLUMN IF NOT EXISTS scene TEXT`;
    await sql`ALTER TABLE songs ADD COLUMN IF NOT EXISTS views BIGINT NOT NULL DEFAULT 0`;
    await sql`ALTER TABLE songs ADD COLUMN IF NOT EXISTS likes BIGINT NOT NULL DEFAULT 0`;
    await sql`ALTER TABLE songs ADD COLUMN IF NOT EXISTS prior DOUBLE PRECISION NOT NULL DEFAULT 0`;
    await sql`ALTER TABLE songs ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ`;
    await sql`
      CREATE TABLE IF NOT EXISTS videos (
        id SERIAL PRIMARY KEY,
        song_id INT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
        url TEXT NOT NULL UNIQUE,
        platform TEXT NOT NULL,
        embed_id TEXT NOT NULL DEFAULT '',
        artist TEXT,
        views BIGINT,
        likes BIGINT,
        posted_at TIMESTAMPTZ,
        stats_at TIMESTAMPTZ,
        added_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
    await sql`CREATE INDEX IF NOT EXISTS videos_song ON videos (song_id)`;
    // The title a video arrived with, so splitting it back off after a merge restores it.
    await sql`ALTER TABLE videos ADD COLUMN IF NOT EXISTS title TEXT`;
    await sql`ALTER TABLE videos ADD COLUMN IF NOT EXISTS media_url TEXT`;
    await sql`ALTER TABLE videos ADD COLUMN IF NOT EXISTS duration_ms INT`;
    await sql`ALTER TABLE videos ADD COLUMN IF NOT EXISTS hook_s DOUBLE PRECISION`;
    await sql`
      INSERT INTO videos (song_id, url, platform, embed_id, artist, title, added_at)
      SELECT id, url, platform, embed_id, artist, title, submitted_at FROM songs
      WHERE NOT EXISTS (SELECT 1 FROM videos v WHERE v.song_id = songs.id)
      ON CONFLICT (url) DO NOTHING`;
    await sql`
      CREATE TABLE IF NOT EXISTS votes (
        id SERIAL PRIMARY KEY,
        nonce TEXT NOT NULL UNIQUE,
        winner_id INT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
        loser_id INT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
        voter_hash TEXT NOT NULL,
        delta DOUBLE PRECISION NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
    await sql`CREATE INDEX IF NOT EXISTS votes_voter_time ON votes (voter_hash, created_at)`;
    await sql`CREATE INDEX IF NOT EXISTS votes_time ON votes (created_at)`;
    await sql`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, at TIMESTAMPTZ NOT NULL DEFAULT now())`;
    for (const s of SEED_SONGS) {
      const p = parseSource(s.url);
      if (!p) continue;
      const exists = await sql`SELECT 1 FROM videos WHERE url = ${p.url}`;
      if (exists.length) continue;
      const [song] = await sql`
        INSERT INTO songs (url, title, artist, platform, embed_id, status, submitted_by)
        VALUES (${p.url}, ${s.title}, ${s.artist ?? null}, ${p.platform}, ${p.embedId}, 'approved', 'seed')
        ON CONFLICT (url) DO NOTHING RETURNING id`;
      if (song) {
        await sql`
          INSERT INTO videos (song_id, url, platform, embed_id, artist, title)
          VALUES (${song.id}, ${p.url}, ${p.platform}, ${p.embedId}, ${s.artist ?? null}, ${s.title})
          ON CONFLICT (url) DO NOTHING`;
      }
    }
  }).then(
    () => undefined,
    (e) => {
      ready = null;
      throw e;
    },
  );
  return ready;
}

async function db() {
  await ensureSchema();
  return sql!;
}

// Head start from social reach, in Elo points: 10k views is neutral, 1M is +120, 10M is +180,
// 1k is -60, capped at -120/+200. Unknown reach (no stats yet) stays neutral.
// Votes move the rating from there, so reach only decides where a song starts.
export function priorFor(views: number): number {
  if (!views || views <= 0) return 0;
  return Math.max(-120, Math.min(200, 60 * (Math.log10(views) - 4)));
}

const SONG_COLS = sql
  ? sql`s.id, s.title, s.artist, s.scene, s.status, s.rating, s.prior, s.wins, s.losses, s.views, s.likes,
        s.released_at, s.submitted_by, s.note, s.submitted_at`
  : null;

async function withVideos(songs: Omit<Song, "videos">[]): Promise<Song[]> {
  if (!songs.length) return [];
  const q = await db();
  const vids = (await q`
    SELECT id, song_id, url, platform, embed_id, artist, views, likes, posted_at, media_url, duration_ms, hook_s FROM videos
    WHERE song_id = ANY(${songs.map((s) => s.id)})
    ORDER BY views DESC NULLS LAST, likes DESC NULLS LAST, added_at ASC`) as Video[];
  const by = new Map<number, Video[]>();
  for (const v of vids) by.set(v.song_id, [...(by.get(v.song_id) ?? []), v]);
  return songs.map((s) => ({ ...s, videos: by.get(s.id) ?? [] }));
}

export type ChartSort = "rating" | "views" | "hot" | "new";
export type ChartWindow = "all" | "month" | "week";
export type ChartFilters = { sort?: ChartSort; window?: ChartWindow; scene?: Scene; q?: string };

const ORDER: Record<ChartSort, string> = {
  rating: "s.rating DESC, s.views DESC",
  views: "s.views DESC, s.rating DESC",
  hot: "recent_votes DESC, s.rating DESC",
  new: "COALESCE(s.released_at, s.submitted_at) DESC",
};
const WINDOW_DAYS: Record<ChartWindow, number | null> = { all: null, month: 30, week: 7 };

export async function leaderboard(f: ChartFilters = {}): Promise<Song[]> {
  const q = await db();
  const sort = f.sort && f.sort in ORDER ? f.sort : "rating";
  const days = WINDOW_DAYS[f.window ?? "all"] ?? null;
  const search = f.q?.trim() ? `%${f.q.trim().replace(/[%_\\]/g, "\\$&")}%` : null;
  const rows = (await q`
    SELECT ${SONG_COLS!},
      (SELECT count(*)::int FROM votes v
        WHERE (v.winner_id = s.id OR v.loser_id = s.id) AND v.created_at > now() - interval '7 days') AS recent_votes
    FROM songs s
    WHERE s.status = 'approved'
      ${f.scene ? q`AND s.scene = ${f.scene}` : q``}
      ${days ? q`AND COALESCE(s.released_at, s.submitted_at) > now() - make_interval(days => ${days})` : q``}
      ${search ? q`AND (s.title ILIKE ${search} OR s.artist ILIKE ${search})` : q``}
    ORDER BY ${q.unsafe(ORDER[sort])}
    LIMIT 100`) as Omit<Song, "videos">[];
  return withVideos(rows);
}

// Matchups lean toward songs that have been played less and toward songs with more reach,
// so a first-time voter meets the big songs first; the opponent is nearby in rating.
// `exclude` holds songs this visitor just saw; pairs they already voted on are never served again.
// Both fall away if the chart is too small to honour them.
export async function pickMatchup(opts: { exclude?: number[]; voter?: string } = {}): Promise<[Song, Song] | null> {
  const q = await db();
  const exclude = opts.exclude?.length ? opts.exclude : [0];
  const voter = opts.voter ?? "";
  type Row = Omit<Song, "videos">;
  const pickA = async (avoid: number[]): Promise<Row[]> => (await q`
    SELECT ${SONG_COLS!} FROM songs s WHERE s.status = 'approved' AND s.id <> ALL(${avoid})
    ORDER BY (s.wins + s.losses) - s.prior / 50.0 + random() * 14 ASC LIMIT 1`) as Row[];
  const pickB = async (a: Row, avoid: number[], fresh: boolean): Promise<Row[]> => (await q`
    SELECT ${SONG_COLS!} FROM songs s
    WHERE s.status = 'approved' AND s.id <> ${a.id} AND s.id <> ALL(${avoid})
      ${fresh ? q`AND NOT EXISTS (
        SELECT 1 FROM votes v WHERE v.voter_hash = ${voter}
          AND ((v.winner_id = ${a.id} AND v.loser_id = s.id) OR (v.winner_id = s.id AND v.loser_id = ${a.id})))` : q``}
    ORDER BY abs(s.rating - ${a.rating}) + random() * 400 ASC LIMIT 1`) as Row[];

  let [a] = await pickA(exclude);
  a ??= (await pickA([0]))[0];
  if (!a) return null;
  let [b] = await pickB(a, exclude, true);
  b ??= (await pickB(a, [0], true))[0];
  b ??= (await pickB(a, [0], false))[0];
  if (!b) return null;
  const pair = await withVideos(Math.random() < 0.5 ? [a, b] : [b, a]);
  return [pair[0], pair[1]];
}

export const K_FACTOR = 32;

// Records the vote and applies the Elo update in a single statement.
// Returns the rating delta, or null if the nonce was already used.
export async function recordVote(
  nonce: string,
  winnerId: number,
  loserId: number,
  voterHash: string,
): Promise<number | null> {
  const q = await db();
  const rows = (await q`
    WITH r AS (
      SELECT
        (SELECT rating FROM songs WHERE id = ${winnerId} AND status = 'approved') AS w,
        (SELECT rating FROM songs WHERE id = ${loserId} AND status = 'approved') AS l
    ),
    d AS (
      SELECT ${K_FACTOR}::float8 * (1 - 1 / (1 + power(10, (l - w) / 400.0))) AS delta
      FROM r WHERE w IS NOT NULL AND l IS NOT NULL
    ),
    ins AS (
      INSERT INTO votes (nonce, winner_id, loser_id, voter_hash, delta)
      SELECT ${nonce}, ${winnerId}, ${loserId}, ${voterHash}, delta FROM d
      ON CONFLICT (nonce) DO NOTHING
      RETURNING delta
    ),
    upd AS (
      UPDATE songs SET
        rating = rating + CASE WHEN id = ${winnerId} THEN ins.delta ELSE -ins.delta END,
        wins = wins + CASE WHEN id = ${winnerId} THEN 1 ELSE 0 END,
        losses = losses + CASE WHEN id = ${loserId} THEN 1 ELSE 0 END
      FROM ins WHERE id IN (${winnerId}, ${loserId})
      RETURNING 1
    )
    SELECT (SELECT delta FROM ins) AS delta, (SELECT count(*) FROM upd) AS n`) as {
    delta: number | null;
  }[];
  return rows[0]?.delta ?? null;
}

export async function recentVoteCount(voterHash: string, seconds: number): Promise<number> {
  const q = await db();
  const [r] = (await q`
    SELECT count(*)::int AS n FROM votes
    WHERE voter_hash = ${voterHash} AND created_at > now() - make_interval(secs => ${seconds})`) as {
    n: number;
  }[];
  return r.n;
}

export async function recentSubmissionCount(hash: string, seconds: number): Promise<number> {
  const q = await db();
  const [r] = (await q`
    SELECT count(*)::int AS n FROM songs
    WHERE submitter_hash = ${hash} AND submitted_at > now() - make_interval(secs => ${seconds})`) as {
    n: number;
  }[];
  return r.n;
}

type NewVideo = {
  url: string;
  title: string;
  artist: string | null;
  note: string | null;
  submittedBy: string | null;
  submitterHash?: string | null;
  scene?: Scene | null;
  views?: number | null;
  likes?: number | null;
  postedAt?: string | null;
  mediaUrl?: string | null;
  durationMs?: number | null;
};

// Every submission starts as its own pending song; an admin can merge it into an existing one.
async function insertSongWithVideo(v: NewVideo): Promise<"ok" | "duplicate" | "invalid"> {
  const p = parseSource(v.url);
  if (!p) return "invalid";
  const q = await db();
  return q.begin(async (tx) => {
    const dup = await tx`SELECT 1 FROM videos WHERE url = ${p.url} UNION SELECT 1 FROM songs WHERE url = ${p.url}`;
    if (dup.length) return "duplicate" as const;
    const views = v.views ?? 0;
    const prior = priorFor(views);
    const [song] = await tx`
      INSERT INTO songs (url, title, artist, platform, embed_id, submitted_by, note, submitter_hash,
                         scene, views, likes, prior, rating, released_at)
      VALUES (${p.url}, ${v.title}, ${v.artist}, ${p.platform}, ${p.embedId}, ${v.submittedBy}, ${v.note},
              ${v.submitterHash ?? null}, ${v.scene ?? null}, ${views}, ${v.likes ?? 0}, ${prior}, ${1500 + prior},
              ${v.postedAt ?? null})
      RETURNING id`;
    await tx`
      INSERT INTO videos (song_id, url, platform, embed_id, artist, title, views, likes, posted_at, media_url, duration_ms, stats_at)
      VALUES (${song.id}, ${p.url}, ${p.platform}, ${p.embedId}, ${v.artist}, ${v.title}, ${v.views ?? null}, ${v.likes ?? null},
              ${v.postedAt ?? null}, ${v.mediaUrl ?? null}, ${v.durationMs ?? null}, CASE WHEN ${v.views != null} THEN now() END)`;
    return "ok" as const;
  });
}

export async function submitSong(input: {
  url: string;
  title: string;
  artist: string | null;
  submittedBy: string | null;
  note: string | null;
  submitterHash: string;
}): Promise<"ok" | "duplicate" | "invalid"> {
  return insertSongWithVideo(input);
}

export async function addCandidate(f: {
  url: string;
  title: string;
  artist: string | null;
  note: string | null;
  scene?: Scene | null;
  views?: number | null;
  likes?: number | null;
  postedAt?: string | null;
  mediaUrl?: string | null;
  durationMs?: number | null;
}): Promise<boolean> {
  return (await insertSongWithVideo({ ...f, submittedBy: "bot" })) === "ok";
}

export async function listByStatus(status: Song["status"]): Promise<Song[]> {
  const q = await db();
  const rows = (await q`
    SELECT ${SONG_COLS!} FROM songs s WHERE s.status = ${status}
    ORDER BY ${status === "approved" ? q`s.rating DESC` : q`s.submitted_at DESC`} LIMIT 300`) as Omit<Song, "videos">[];
  return withVideos(rows);
}

export async function updateSong(
  id: number,
  fields: { status?: Song["status"]; title?: string; artist?: string | null; scene?: Scene | null },
): Promise<void> {
  const q = await db();
  await q`
    UPDATE songs SET
      status = COALESCE(${fields.status ?? null}, status),
      title = COALESCE(${fields.title ?? null}, title),
      artist = CASE WHEN ${fields.artist !== undefined} THEN ${fields.artist ?? null} ELSE artist END,
      scene = CASE WHEN ${fields.scene !== undefined} THEN ${fields.scene ?? null} ELSE scene END
    WHERE id = ${id}`;
}

// Recomputes a song's reach from its videos and shifts its rating by the change in head start.
async function refreshSongs(tx: postgres.TransactionSql | postgres.Sql, ids: number[]): Promise<void> {
  if (!ids.length) return;
  const rows = (await tx`
    SELECT s.id, s.prior, COALESCE(sum(v.views), 0)::bigint AS views, COALESCE(sum(v.likes), 0)::bigint AS likes,
           min(v.posted_at) AS released_at
    FROM songs s LEFT JOIN videos v ON v.song_id = s.id
    WHERE s.id = ANY(${ids}) GROUP BY s.id`) as { id: number; prior: number; views: number; likes: number; released_at: string | null }[];
  for (const r of rows) {
    const prior = priorFor(Number(r.views));
    await tx`
      UPDATE songs SET views = ${r.views}, likes = ${r.likes}, released_at = COALESCE(${r.released_at}, released_at),
        rating = rating + ${prior - r.prior}, prior = ${prior}
      WHERE id = ${r.id}`;
  }
}

// Moves every video and vote of `fromId` onto `intoId`, then deletes `fromId`.
// The target keeps its rating; win/loss counts are combined.
export async function mergeSong(fromId: number, intoId: number): Promise<boolean> {
  if (fromId === intoId) return false;
  const q = await db();
  return q.begin(async (tx) => {
    const both = await tx`SELECT id FROM songs WHERE id IN (${fromId}, ${intoId}) FOR UPDATE`;
    if (both.length !== 2) return false;
    await tx`UPDATE videos SET song_id = ${intoId} WHERE song_id = ${fromId}`;
    // Votes between the two are now a song against itself: drop them and their win/loss counts.
    const internal = await tx`
      DELETE FROM votes WHERE (winner_id = ${fromId} AND loser_id = ${intoId}) OR (winner_id = ${intoId} AND loser_id = ${fromId})
      RETURNING 1`;
    await tx`UPDATE votes SET winner_id = ${intoId} WHERE winner_id = ${fromId}`;
    await tx`UPDATE votes SET loser_id = ${intoId} WHERE loser_id = ${fromId}`;
    await tx`
      UPDATE songs t SET wins = t.wins + f.wins - ${internal.length}, losses = t.losses + f.losses - ${internal.length},
        scene = COALESCE(t.scene, f.scene), artist = COALESCE(t.artist, f.artist),
        status = CASE WHEN 'approved' IN (t.status, f.status) THEN 'approved' ELSE t.status END
      FROM songs f WHERE t.id = ${intoId} AND f.id = ${fromId}`;
    await tx`DELETE FROM songs WHERE id = ${fromId}`;
    await refreshSongs(tx, [intoId]);
    return true;
  });
}

// Detaches one video into its own pending song (undo for a wrong merge).
export async function splitVideo(videoId: number): Promise<boolean> {
  const q = await db();
  return q.begin(async (tx) => {
    const [v] = await tx`
      SELECT v.*, s.title AS song_title FROM videos v JOIN songs s ON s.id = v.song_id WHERE v.id = ${videoId}`;
    if (!v) return false;
    const [{ n }] = await tx`SELECT count(*)::int AS n FROM videos WHERE song_id = ${v.song_id}`;
    if (n < 2) return false;
    // songs.url must be unique, and the video's own url may already be the parent's.
    const taken = await tx`SELECT 1 FROM songs WHERE url = ${v.url}`;
    const [song] = await tx`
      INSERT INTO songs (url, title, artist, platform, embed_id, submitted_by)
      VALUES (${taken.length ? `${v.url}#split${videoId}` : v.url}, ${v.title ?? v.song_title}, ${v.artist},
              ${v.platform}, ${v.embed_id}, 'split')
      RETURNING id`;
    await tx`UPDATE videos SET song_id = ${song.id} WHERE id = ${videoId}`;
    await refreshSongs(tx, [v.song_id, song.id]);
    return true;
  });
}

export async function removeVideo(videoId: number): Promise<boolean> {
  const q = await db();
  return q.begin(async (tx) => {
    const [v] = await tx`SELECT song_id FROM videos WHERE id = ${videoId}`;
    if (!v) return false;
    const [{ n }] = await tx`SELECT count(*)::int AS n FROM videos WHERE song_id = ${v.song_id}`;
    if (n < 2) return false; // a song always keeps at least one video
    await tx`DELETE FROM videos WHERE id = ${videoId}`;
    await refreshSongs(tx, [v.song_id]);
    return true;
  });
}

// Attaches another link to an existing song directly (admin).
export async function addVideo(
  songId: number,
  url: string,
  artist: string | null,
): Promise<"ok" | "duplicate" | "invalid" | "missing"> {
  const p = parseSource(url);
  if (!p) return "invalid";
  const q = await db();
  return q.begin(async (tx) => {
    const [song] = await tx`SELECT title FROM songs WHERE id = ${songId}`;
    if (!song) return "missing" as const;
    const r = await tx`
      INSERT INTO videos (song_id, url, platform, embed_id, artist, title)
      VALUES (${songId}, ${p.url}, ${p.platform}, ${p.embedId}, ${artist}, ${song.title})
      ON CONFLICT (url) DO NOTHING RETURNING id`;
    if (!r.length) return "duplicate" as const;
    await refreshSongs(tx, [songId]);
    return "ok" as const;
  });
}

export async function setHook(videoId: number, seconds: number | null): Promise<boolean> {
  const q = await db();
  const r = await q`UPDATE videos SET hook_s = ${seconds} WHERE id = ${videoId} RETURNING 1`;
  return r.length > 0;
}

export async function staleVideos(platform: Platform, olderThanHours: number, limit: number): Promise<Video[]> {
  const q = await db();
  return (await q`
    SELECT v.id, v.song_id, v.url, v.platform, v.embed_id, v.artist, v.views, v.likes, v.posted_at,
           v.media_url, v.duration_ms, v.hook_s
    FROM videos v JOIN songs s ON s.id = v.song_id
    WHERE v.platform = ${platform} AND s.status <> 'rejected'
      AND (v.stats_at IS NULL OR v.stats_at < now() - make_interval(hours => ${olderThanHours}))
    ORDER BY v.stats_at ASC NULLS FIRST LIMIT ${limit}`) as Video[];
}

export async function saveVideoStats(
  stats: {
    id: number;
    views: number | null;
    likes: number | null;
    postedAt: string | null;
    mediaUrl?: string | null;
    durationMs?: number | null;
  }[],
): Promise<void> {
  if (!stats.length) return;
  const q = await db();
  await q.begin(async (tx) => {
    const songIds = new Set<number>();
    for (const s of stats) {
      const [r] = await tx`
        UPDATE videos SET views = COALESCE(${s.views}, views), likes = COALESCE(${s.likes}, likes),
          posted_at = COALESCE(${s.postedAt}, posted_at), media_url = COALESCE(${s.mediaUrl ?? null}, media_url),
          duration_ms = COALESCE(${s.durationMs ?? null}, duration_ms), stats_at = now()
        WHERE id = ${s.id} RETURNING song_id`;
      if (r) songIds.add(r.song_id);
    }
    await refreshSongs(tx, [...songIds]);
  });
}

export async function stats(): Promise<{ songs: number; votes: number; pending: number }> {
  const q = await db();
  const [r] = (await q`
    SELECT
      (SELECT count(*)::int FROM songs WHERE status = 'approved') AS songs,
      (SELECT count(*)::int FROM songs WHERE status = 'pending') AS pending,
      (SELECT count(*)::int FROM votes) AS votes`) as { songs: number; votes: number; pending: number }[];
  return r;
}

// Atomically claims the next bot run if the last one was long enough ago.
export async function claimIngestRun(minSeconds: number): Promise<boolean> {
  const q = await db();
  const rows = await q`
    INSERT INTO meta (key, at) VALUES ('ingest', now())
    ON CONFLICT (key) DO UPDATE SET at = now()
      WHERE meta.at < now() - make_interval(secs => ${minSeconds})
    RETURNING 1`;
  return rows.length > 0;
}
