import postgres from "postgres";
import { SEED_SONGS } from "./seed";
import { parseSource, type Platform } from "./embed";

export type Song = {
  id: number;
  url: string;
  title: string;
  artist: string | null;
  platform: Platform;
  embed_id: string;
  status: "pending" | "approved" | "rejected";
  rating: number;
  wins: number;
  losses: number;
  submitted_by: string | null;
  note: string | null;
  submitted_at: string;
};

export const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
export const hasDb = Boolean(DB_URL);

const local = /@(localhost|127\.0\.0\.1)[:/]/.test(DB_URL);
// One connection per serverless instance; prepare:false keeps it compatible with pooled (pgbouncer) URLs.
const sql = hasDb
  ? postgres(DB_URL, { max: 1, idle_timeout: 20, prepare: false, ssl: local ? false : "require", onnotice: () => {} })
  : null;

let ready: Promise<void> | null = null;

// Schema is created lazily on first use so nobody has to run migrations.
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
    for (const s of SEED_SONGS) {
      const p = parseSource(s.url);
      if (!p) continue;
      await sql`
        INSERT INTO songs (url, title, artist, platform, embed_id, status, submitted_by)
        VALUES (${p.url}, ${s.title}, ${s.artist ?? null}, ${p.platform}, ${p.embedId}, 'approved', 'seed')
        ON CONFLICT (url) DO NOTHING`;
    }
  }).then(() => undefined, (e) => {
    ready = null;
    throw e;
  });
  return ready;
}

async function db() {
  await ensureSchema();
  return sql!;
}

export async function leaderboard(): Promise<Song[]> {
  const q = await db();
  return (await q`
    SELECT * FROM songs WHERE status = 'approved'
    ORDER BY rating DESC, wins DESC, submitted_at ASC`) as Song[];
}

export async function getSongs(ids: number[]): Promise<Song[]> {
  const q = await db();
  return (await q`SELECT * FROM songs WHERE id = ANY(${ids}) AND status = 'approved'`) as Song[];
}

// Under-played songs get picked first; their opponent is someone nearby in rating,
// with enough randomness that the same pairs don't repeat forever.
export async function pickMatchup(): Promise<[Song, Song] | null> {
  const q = await db();
  const [a] = (await q`
    SELECT * FROM songs WHERE status = 'approved'
    ORDER BY (wins + losses) + random() * 6 ASC LIMIT 1`) as Song[];
  if (!a) return null;
  const [b] = (await q`
    SELECT * FROM songs WHERE status = 'approved' AND id <> ${a.id}
    ORDER BY abs(rating - ${a.rating}) + random() * 250 ASC LIMIT 1`) as Song[];
  if (!b) return null;
  return Math.random() < 0.5 ? [a, b] : [b, a];
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

export async function submitSong(input: {
  url: string;
  title: string;
  artist: string | null;
  submittedBy: string | null;
  note: string | null;
  submitterHash: string;
}): Promise<"ok" | "duplicate" | "invalid"> {
  const p = parseSource(input.url);
  if (!p) return "invalid";
  const q = await db();
  const rows = await q`
    INSERT INTO songs (url, title, artist, platform, embed_id, submitted_by, note, submitter_hash)
    VALUES (${p.url}, ${input.title}, ${input.artist}, ${p.platform}, ${p.embedId},
            ${input.submittedBy}, ${input.note}, ${input.submitterHash})
    ON CONFLICT (url) DO NOTHING
    RETURNING id`;
  return rows.length ? "ok" : "duplicate";
}

export async function listByStatus(status: Song["status"]): Promise<Song[]> {
  const q = await db();
  return (await q`SELECT * FROM songs WHERE status = ${status} ORDER BY submitted_at DESC LIMIT 200`) as Song[];
}

export async function updateSong(
  id: number,
  fields: { status?: Song["status"]; title?: string; artist?: string | null },
): Promise<void> {
  const q = await db();
  await q`
    UPDATE songs SET
      status = COALESCE(${fields.status ?? null}, status),
      title = COALESCE(${fields.title ?? null}, title),
      artist = CASE WHEN ${fields.artist !== undefined} THEN ${fields.artist ?? null} ELSE artist END
    WHERE id = ${id}`;
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
