import { addCandidate, claimIngestRun, saveVideoStats, setLyrics, staleVideos, videosNeedingLyrics, type Scene } from "./db";
import { guessTitle } from "./preview";

// Finds fresh doom pop on X (via twitterapi.io) and YouTube, and drops it in the moderation queue.
// Each source only runs when its key is configured.

// Creators who reliably make the genre. Add handles as new regulars show up in the queue.
const WATCHLIST = ["anabology", "sappyalien", "niuniu255431", "JagTheHero", "slimer48484", "other__reality", "Skoorbkaz"];

// Two scenes so far: "slopcore" ("I gave Claude N hours…" music videos; Claudia is @anabology's
// open character that others reuse) and "Claude-Pop" (code-drawn Clawd animations to AI-doom songs).
const X_QUERIES = [
  `(${WATCHLIST.map((h) => `from:${h}`).join(" OR ")}) filter:videos -filter:retweets -filter:replies`,
  `(slopcore OR #slopcore OR (claudia (song OR suno OR "music video" OR anabology))) filter:videos min_faves:50 -solana -from:colossalmeiraz -from:slopcoresolana -filter:retweets -filter:replies`,
  `("gave claude" OR "asked claude" OR "claude made" OR "claude wrote" OR "gave opus") (song OR "music video") filter:videos min_faves:10 -filter:retweets -filter:replies`,
  `("claude-pop" OR "claude pop" OR clawd OR "p(doom)") (song OR "music video") filter:videos min_faves:20 -filter:retweets -filter:replies`,
  `(song OR "music video") (agi OR singularity OR superintelligence OR "ai safety" OR alignment OR "ai bubble" OR "p(doom)" OR "pace the frontier") filter:videos min_faves:25 -filter:retweets -filter:replies`,
];

const YT_QUERIES = ["AI doom song suno", "AGI singularity song AI generated", "AI alignment song"];

const MIN_INTERVAL_SECONDS = 50 * 60;
// Posts need time to collect likes before min_faves lets them through, so look back two days.
const LOOKBACK_SECONDS = 48 * 60 * 60;

type Found = {
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
};

type XTweet = {
  id: string;
  text?: string;
  createdAt?: string;
  likeCount?: number;
  viewCount?: number;
  author?: { userName?: string };
  extendedEntities?: {
    media?: {
      type?: string;
      media_url_https?: string;
      video_info?: { duration_millis?: number; variants?: { content_type?: string; bitrate?: number; url?: string }[] };
    }[];
  };
};

// Picks a mid-quality MP4 (smooth enough, light enough to start fast) from a tweet's video.
export function tweetVideo(t: XTweet): {
  mediaUrl: string | null;
  audioUrl: string | null; // the smallest MP4, light enough to send for transcription
  thumbUrl: string | null;
  durationMs: number | null;
} {
  const media = t.extendedEntities?.media?.find((m) => m.type === "video" || m.type === "animated_gif");
  const mp4s = (media?.video_info?.variants ?? [])
    .filter((v) => v.content_type === "video/mp4" && v.url)
    .sort((a, b) => (a.bitrate ?? 0) - (b.bitrate ?? 0));
  const pick = mp4s.filter((v) => (v.bitrate ?? 0) <= 2_500_000).pop() ?? mp4s[0];
  return {
    mediaUrl: pick?.url ?? null,
    audioUrl: mp4s[0]?.url ?? null,
    thumbUrl: media?.media_url_https ?? null,
    durationMs: media?.video_info?.duration_millis ?? null,
  };
}

// Hand-added posts would otherwise show as a full tweet until the next ingest run fills in the MP4.
// Best effort: no key, a rate limit or a post without video just leaves that to the refresh.
export async function fetchTweetVideo(id: string): Promise<ReturnType<typeof tweetVideo> | null> {
  const key = process.env.TWITTERAPI_IO_KEY;
  if (!key) return null;
  try {
    const url = new URL("https://api.twitterapi.io/twitter/tweets");
    url.searchParams.set("tweet_ids", id);
    const r = await fetch(url, { headers: { "X-API-Key": key }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const t = ((await r.json()) as { tweets?: XTweet[] }).tweets?.[0];
    return t ? tweetVideo(t) : null;
  } catch {
    return null;
  }
}

export function sceneFor(text: string): Scene | null {
  if (/claudia|anabology/i.test(text)) return "claudia";
  if (/clawd|claude[- ]pop|p\(doom\)/i.test(text)) return "claude-pop";
  if (/slopcore/i.test(text)) return "slopcore";
  return null;
}

const toDate = (s?: string) => (s && !Number.isNaN(Date.parse(s)) ? new Date(s).toISOString() : null);
type QueryLog = { source: string; query: string; status: number | string; results: number; error?: string };

function firstLine(text: string, max = 80): string {
  const line = text.replace(/https?:\/\/\S+/g, "").split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  return line.length > max ? `${line.slice(0, max - 1)}…` : line || "Untitled";
}

// twitterapi.io's free tier allows one request per 5 seconds.
const X_SPACING_MS = 5500;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function searchX(key: string, log: QueryLog[], lookback: number): Promise<Found[]> {
  const since = Math.floor(Date.now() / 1000) - lookback;
  const out: Found[] = [];
  for (const [i, q] of X_QUERIES.entries()) {
    if (i > 0) await sleep(X_SPACING_MS);
    const url = new URL("https://api.twitterapi.io/twitter/tweet/advanced_search");
    url.searchParams.set("query", `${q} since_time:${since}`);
    url.searchParams.set("queryType", "Latest");
    const r = await fetch(url, { headers: { "X-API-Key": key } });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      console.error("twitterapi.io", r.status, body);
      log.push({ source: "x", query: q, status: r.status, results: 0, error: body.slice(0, 200) });
      continue;
    }
    const d = (await r.json()) as {
      tweets?: XTweet[];
    };
    log.push({ source: "x", query: q, status: r.status, results: d.tweets?.length ?? 0 });
    for (const t of d.tweets ?? []) {
      const handle = t.author?.userName;
      if (!t.id || !handle) continue;
      out.push({
        url: `https://x.com/${handle}/status/${t.id}`,
        title: guessTitle(t.text ?? "") ?? "Untitled",
        artist: `@${handle}`,
        note: (t.text ?? "").slice(0, 500) || null,
        scene: sceneFor(`${t.text ?? ""} ${handle}`),
        views: t.viewCount ?? null,
        likes: t.likeCount ?? null,
        postedAt: toDate(t.createdAt),
        ...tweetVideo(t),
      });
    }
  }
  return out;
}

async function searchYouTube(key: string, log: QueryLog[]): Promise<Found[]> {
  const after = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const out: Found[] = [];
  for (const q of YT_QUERIES) {
    const url = new URL("https://www.googleapis.com/youtube/v3/search");
    url.search = new URLSearchParams({
      part: "snippet",
      type: "video",
      order: "date",
      maxResults: "15",
      publishedAfter: after,
      q,
      key,
    }).toString();
    const r = await fetch(url);
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      console.error("youtube", r.status, body);
      log.push({ source: "youtube", query: q, status: r.status, results: 0, error: body.slice(0, 200) });
      continue;
    }
    const d = (await r.json()) as {
      items?: { id: { videoId?: string }; snippet: { title: string; channelTitle: string; description: string } }[];
    };
    log.push({ source: "youtube", query: q, status: r.status, results: d.items?.length ?? 0 });
    for (const it of d.items ?? []) {
      if (!it.id.videoId) continue;
      out.push({
        url: `https://www.youtube.com/watch?v=${it.id.videoId}`,
        title: firstLine(decodeEntities(it.snippet.title), 120),
        artist: it.snippet.channelTitle || null,
        note: it.snippet.description?.slice(0, 500) || null,
      });
    }
  }
  return out;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

// Keeps view and like counts current so the chart's reach head start tracks reality.
async function refreshXStats(key: string, log: QueryLog[], maxAgeHours = 20): Promise<number> {
  const stale = await staleVideos("x", maxAgeHours, 100);
  if (!stale.length) return 0;
  const url = new URL("https://api.twitterapi.io/twitter/tweets");
  url.searchParams.set("tweet_ids", stale.map((v) => v.embed_id).join(","));
  const r = await fetch(url, { headers: { "X-API-Key": key } });
  if (!r.ok) {
    log.push({ source: "x-stats", query: `${stale.length} ids`, status: r.status, results: 0, error: (await r.text()).slice(0, 200) });
    return 0;
  }
  const d = (await r.json()) as { tweets?: XTweet[] };
  const byId = new Map((d.tweets ?? []).map((t) => [t.id, t]));
  // Missing tweets (deleted or private) still get stamped so they aren't retried every run.
  await saveVideoStats(
    stale.map((v) => {
      const t = byId.get(v.embed_id);
      return {
        id: v.id,
        views: t?.viewCount ?? null,
        likes: t?.likeCount ?? null,
        postedAt: toDate(t?.createdAt),
        ...(t ? { ...tweetVideo(t), text: t.text ?? null } : {}),
      };
    }),
  );
  log.push({ source: "x-stats", query: `${stale.length} ids`, status: r.status, results: byId.size });
  return byId.size;
}

// Speech-to-text for songs nobody has typed lyrics for. Groq and OpenAI share the same Whisper API shape.
const TRANSCRIBERS = [
  { env: "GROQ_API_KEY", url: "https://api.groq.com/openai/v1/audio/transcriptions", model: "whisper-large-v3" },
  { env: "OPENAI_API_KEY", url: "https://api.openai.com/v1/audio/transcriptions", model: "whisper-1" },
];
const MAX_AUDIO_BYTES = 24 * 1024 * 1024; // both APIs cap uploads at 25MB

export async function transcribeSome(limit: number, log: QueryLog[]): Promise<number> {
  const t = TRANSCRIBERS.find((x) => process.env[x.env]);
  if (!t) return 0;
  let done = 0;
  for (const v of await videosNeedingLyrics(limit)) {
    try {
      const audio = await fetch(v.audio_url);
      const bytes = Number(audio.headers.get("content-length") ?? 0);
      if (!audio.ok || bytes > MAX_AUDIO_BYTES) throw new Error(`audio ${audio.status}, ${bytes} bytes`);
      const form = new FormData();
      form.set("file", new Blob([await audio.arrayBuffer()], { type: "video/mp4" }), "song.mp4");
      form.set("model", t.model);
      form.set("response_format", "text");
      form.set("prompt", `Song lyrics. Title: ${v.title}.`);
      const r = await fetch(t.url, { method: "POST", headers: { Authorization: `Bearer ${process.env[t.env]}` }, body: form });
      if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 150)}`);
      const text = (await r.text()).trim();
      await setLyrics(v.id, text.length > 20 ? text : null, "transcribed");
      done++;
    } catch (e) {
      await setLyrics(v.id, null, "transcribed"); // stamps the try so it waits a week
      log.push({ source: "lyrics", query: v.title, status: "failed", results: 0, error: String(e).slice(0, 200) });
    }
  }
  log.push({ source: "lyrics", query: `${t.env} ${t.model}`, status: 200, results: done });
  return done;
}

export type IngestResult =
  | { skipped: "too_soon" | "no_sources" }
  | { found: number; added: number; sources: string[]; queries: QueryLog[] };

export async function runIngest(force = false, lookback = LOOKBACK_SECONDS, refreshAll = false): Promise<IngestResult> {
  const xKey = process.env.TWITTERAPI_IO_KEY;
  const ytKey = process.env.YOUTUBE_API_KEY;
  if (!xKey && !ytKey) return { skipped: "no_sources" };
  // Anyone can hit the endpoint, so the database decides whether a run is due.
  if (!(await claimIngestRun(force ? 0 : MIN_INTERVAL_SECONDS))) return { skipped: "too_soon" };

  const sources: string[] = [];
  const found: Found[] = [];
  const queries: QueryLog[] = [];
  const failed = (source: string) => (e: unknown) => {
    console.error(e);
    queries.push({ source, query: "*", status: "exception", results: 0, error: String(e).slice(0, 200) });
    return [];
  };
  if (xKey) {
    sources.push("x");
    await refreshXStats(xKey, queries, refreshAll ? 0 : 20).catch(failed("x-stats"));
    await sleep(X_SPACING_MS);
    found.push(...(await searchX(xKey, queries, lookback).catch(failed("x"))));
  }
  if (ytKey) {
    sources.push("youtube");
    found.push(...(await searchYouTube(ytKey, queries).catch(failed("youtube"))));
  }
  // Up to 4 songs a run, so a run stays well inside the function time limit.
  await transcribeSome(4, queries).catch(failed("lyrics"));
  let added = 0;
  for (const f of found) {
    if (await addCandidate(f)) added++;
  }
  return { found: found.length, added, sources, queries };
}
