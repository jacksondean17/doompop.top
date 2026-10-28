import type { ParsedSource } from "./embed";

export type Preview = { title: string | null; artist: string | null };

const TIMEOUT = 5000;
const MAX_BYTES = 500_000;
const MAX_REDIRECTS = 3;

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–", hellip: "…" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

export function clean(s: string | null | undefined, n = 120): string | null {
  if (!s) return null;
  const v = s.replace(/\s+/g, " ").trim();
  if (!v) return null;
  return v.length > n ? v.slice(0, n - 1).trimEnd() + "…" : v;
}

// Song posts on X usually bury the title: "I gave Claude 12 hours… / Macrohard: Windows XP / I'm blown away".
// Prefer a quoted name, then a short standalone line that isn't narration, then the first line.
export function guessTitle(text: string): string | null {
  const body = text.replace(/(?:https?:\/\/)?t\.co\/\S+|pic\.twitter\.com\/\S+|https?:\/\/\S+/g, "");
  const quoted = body.match(/["“]([^"”\n]{2,48})["”]/)?.[1];
  if (quoted) return clean(quoted, 80);
  const lines = body
    .split("\n")
    .map((l) => l.trim().replace(/^(woke up to|presenting|introducing|meet|behold)\b[.:…\s-]*/i, ""))
    .filter(Boolean);
  const narration = /^(i|i'm|im|i've|we|my|this|it|here'?s|just|gave|so|and|wow|lol|omg|the most)\b|[.!?…]$|\?|\b(claude|opus|hours?|minutes?)\b/i;
  const standalone = lines.find((l) => l.length <= 48 && !narration.test(l) && !/^[@#]/.test(l));
  return clean(standalone ?? lines[0], 80);
}

// Text of the tweet from publish.twitter.com oEmbed html.
export function tweetTitle(html: string): string | null {
  const p = html.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1];
  if (!p) return null;
  return guessTitle(decodeEntities(p.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")));
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  }
  return out;
}

export function metaTags(html: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrs(tag);
    const key = (a.property ?? a.name ?? a.itemprop)?.toLowerCase();
    if (key && a.content != null && !map.has(key)) map.set(key, decodeEntities(a.content));
  }
  return map;
}

const notUrl = (v: string | undefined) => (v && !/^https?:\/\//i.test(v.trim()) ? v : undefined);

export function pageMeta(html: string): Preview {
  const meta = metaTags(html);
  const docTitle = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const title = meta.get("og:title") ?? meta.get("twitter:title") ?? (docTitle ? decodeEntities(docTitle) : undefined);
  const artist =
    notUrl(meta.get("music:musician_description")) ??
    notUrl(meta.get("music:musician")) ??
    notUrl(meta.get("author")) ??
    notUrl(meta.get("article:author")) ??
    meta.get("og:site_name");
  return { title: clean(title), artist: clean(artist, 80) };
}

// Suno titles look like "Song Name by someone | Suno".
export function sunoMeta(p: Preview): Preview {
  const t = p.title?.replace(/\s*[|·-]\s*Suno\s*$/i, "") ?? null;
  const m = t?.match(/^(.*\S)\s+by\s+(.+)$/);
  if (m) return { title: clean(m[1]), artist: clean(m[2], 80) };
  return { title: clean(t), artist: p.artist && !/^suno$/i.test(p.artist) ? p.artist : null };
}

export function blockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  if (!h || !h.includes(".")) return true;
  if (h.startsWith("[") || h.includes(":")) return true;
  if (/^[\d.]+$/.test(h) || /^0x/i.test(h)) return true;
  return h === "localhost" || /\.(localhost|local|internal)$/.test(h);
}

async function readCapped(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
  }
  reader.cancel().catch(() => {});
  const buf = new Uint8Array(Math.min(size, MAX_BYTES));
  let off = 0;
  for (const c of chunks) {
    const part = c.subarray(0, buf.length - off);
    buf.set(part, off);
    off += part.length;
    if (off >= buf.length) break;
  }
  return new TextDecoder().decode(buf);
}

const UA = "Mozilla/5.0 (compatible; doompop.top preview)";

async function fetchPage(raw: string): Promise<string | null> {
  const signal = AbortSignal.timeout(TIMEOUT);
  let url = new URL(raw);
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    if ((url.protocol !== "https:" && url.protocol !== "http:") || blockedHost(url.hostname)) return null;
    const res = await fetch(url, { redirect: "manual", signal, headers: { "user-agent": UA, accept: "text/html" } });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      res.body?.cancel().catch(() => {});
      if (!loc) return null;
      url = new URL(loc, url);
      continue;
    }
    if (!res.ok) return null;
    return readCapped(res);
  }
  return null;
}

async function oembed(endpoint: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(endpoint, { signal: AbortSignal.timeout(TIMEOUT), headers: { "user-agent": UA } });
  if (!res.ok) return null;
  return JSON.parse(await readCapped(res));
}

const str = (v: unknown) => (typeof v === "string" ? v : null);
const enc = encodeURIComponent;

export async function preview(src: ParsedSource): Promise<Preview> {
  switch (src.platform) {
    case "x": {
      const d = await oembed(`https://publish.twitter.com/oembed?url=${enc(src.url)}&omit_script=1`);
      let handle = new URL(src.url).pathname.split("/")[1];
      if (!handle || handle === "i") handle = str(d?.author_url)?.match(/\/([\w]{1,15})\/?$/)?.[1] ?? "";
      return { title: tweetTitle(str(d?.html) ?? ""), artist: handle ? `@${handle}` : null };
    }
    case "youtube": {
      const d = await oembed(`https://www.youtube.com/oembed?url=${enc(src.url)}&format=json`);
      return { title: clean(str(d?.title)), artist: clean(str(d?.author_name), 80) };
    }
    case "soundcloud": {
      const d = await oembed(`https://soundcloud.com/oembed?format=json&url=${enc(src.url)}`);
      const artist = clean(str(d?.author_name), 80);
      const title = str(d?.title);
      const suffix = artist ? ` by ${artist}` : "";
      return { title: clean(suffix && title?.endsWith(suffix) ? title.slice(0, -suffix.length) : title), artist };
    }
    case "tiktok": {
      const d = await oembed(`https://www.tiktok.com/oembed?url=${enc(src.url)}`);
      const handle = str(d?.author_unique_id);
      const caption = str(d?.title)?.split("\n").find((l) => l.trim());
      return { title: clean(caption, 80), artist: handle ? `@${handle}` : clean(str(d?.author_name), 80) };
    }
    case "spotify": {
      const html = await fetchPage(src.url).catch(() => null);
      const p = html ? pageMeta(html) : { title: null, artist: null };
      if (p.artist === "Spotify") p.artist = null;
      if (!p.title) {
        const d = await oembed(`https://open.spotify.com/oembed?url=${enc(src.url)}`).catch(() => null);
        p.title = clean(str(d?.title));
      }
      return p;
    }
    default: {
      const html = await fetchPage(src.url);
      if (!html) return { title: null, artist: null };
      const p = pageMeta(html);
      return src.platform === "suno" || /(^|\.)suno\.(com|ai)$/.test(new URL(src.url).hostname) ? sunoMeta(p) : p;
    }
  }
}
