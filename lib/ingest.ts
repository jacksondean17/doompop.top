import { addCandidate, claimIngestRun } from "./db";

// Finds fresh doom pop on X (via twitterapi.io) and YouTube, and drops it in the moderation queue.
// Each source only runs when its key is configured.

const X_QUERIES = [
  `"doom pop" -filter:retweets`,
  `(suno OR udio OR "ai song" OR "ai generated song" OR "ai music") (agi OR singularity OR "ai safety" OR alignment OR doom OR superintelligence OR "p(doom)") filter:videos -filter:retweets`,
];

const YT_QUERIES = ["AI doom song suno", "AGI singularity song AI generated", "AI alignment song"];

const MIN_INTERVAL_SECONDS = 50 * 60;
const LOOKBACK_SECONDS = 3 * 60 * 60;

type Found = { url: string; title: string; artist: string | null; note: string | null };

function firstLine(text: string, max = 80): string {
  const line = text.replace(/https?:\/\/\S+/g, "").split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  return line.length > max ? `${line.slice(0, max - 1)}…` : line || "Untitled";
}

async function searchX(key: string): Promise<Found[]> {
  const since = Math.floor(Date.now() / 1000) - LOOKBACK_SECONDS;
  const out: Found[] = [];
  for (const q of X_QUERIES) {
    const url = new URL("https://api.twitterapi.io/twitter/tweet/advanced_search");
    url.searchParams.set("query", `${q} since_time:${since}`);
    url.searchParams.set("queryType", "Latest");
    const r = await fetch(url, { headers: { "X-API-Key": key } });
    if (!r.ok) {
      console.error("twitterapi.io", r.status, await r.text().catch(() => ""));
      continue;
    }
    const d = (await r.json()) as {
      tweets?: { id: string; url?: string; text?: string; author?: { userName?: string } }[];
    };
    for (const t of d.tweets ?? []) {
      const handle = t.author?.userName;
      if (!t.id || !handle) continue;
      out.push({
        url: `https://x.com/${handle}/status/${t.id}`,
        title: firstLine(t.text ?? ""),
        artist: `@${handle}`,
        note: (t.text ?? "").slice(0, 500) || null,
      });
    }
  }
  return out;
}

async function searchYouTube(key: string): Promise<Found[]> {
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
      console.error("youtube", r.status, await r.text().catch(() => ""));
      continue;
    }
    const d = (await r.json()) as {
      items?: { id: { videoId?: string }; snippet: { title: string; channelTitle: string; description: string } }[];
    };
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

export type IngestResult =
  | { skipped: "too_soon" | "no_sources" }
  | { found: number; added: number; sources: string[] };

export async function runIngest(): Promise<IngestResult> {
  const xKey = process.env.TWITTERAPI_IO_KEY;
  const ytKey = process.env.YOUTUBE_API_KEY;
  if (!xKey && !ytKey) return { skipped: "no_sources" };
  // Anyone can hit the endpoint, so the database decides whether a run is due.
  if (!(await claimIngestRun(MIN_INTERVAL_SECONDS))) return { skipped: "too_soon" };

  const sources: string[] = [];
  const found: Found[] = [];
  if (xKey) {
    sources.push("x");
    found.push(...(await searchX(xKey).catch((e) => (console.error(e), []))));
  }
  if (ytKey) {
    sources.push("youtube");
    found.push(...(await searchYouTube(ytKey).catch((e) => (console.error(e), []))));
  }
  let added = 0;
  for (const f of found) {
    if (await addCandidate(f)) added++;
  }
  return { found: found.length, added, sources };
}
