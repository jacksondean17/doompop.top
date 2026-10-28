export type Platform = "x" | "youtube" | "suno" | "soundcloud" | "spotify" | "tiktok" | "link";

export type ParsedSource = {
  platform: Platform;
  embedId: string;
  url: string; // canonical form, used for de-duplication
};

// Turns whatever link someone pastes into something we can embed and dedupe.
export function parseSource(raw: string): ParsedSource | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.replace(/^(www\.|m\.|mobile\.)/, "");
  const parts = u.pathname.split("/").filter(Boolean);

  if (host === "x.com" || host === "twitter.com" || host === "fxtwitter.com" || host === "vxtwitter.com") {
    const i = parts.indexOf("status");
    const id = i >= 0 ? parts[i + 1] : undefined;
    if (id && /^\d+$/.test(id)) {
      return { platform: "x", embedId: id, url: `https://x.com/${parts[0]}/status/${id}` };
    }
  }

  if (host === "youtube.com" || host === "music.youtube.com" || host === "youtu.be") {
    let id: string | null = null;
    if (host === "youtu.be") id = parts[0] ?? null;
    else if (parts[0] === "watch") id = u.searchParams.get("v");
    else if (parts[0] === "shorts" || parts[0] === "embed" || parts[0] === "live") id = parts[1] ?? null;
    if (id && /^[\w-]{6,}$/.test(id)) {
      return { platform: "youtube", embedId: id, url: `https://www.youtube.com/watch?v=${id}` };
    }
  }

  if (host === "suno.com" || host === "app.suno.ai" || host === "suno.ai") {
    const i = parts.findIndex((p) => p === "song" || p === "s" || p === "embed");
    const id = i >= 0 ? parts[i + 1] : undefined;
    if (id && /^[\w-]+$/.test(id)) {
      // Short /s/ links can't be embedded directly; link out instead.
      if (parts[i] === "s") return { platform: "link", embedId: "", url: `https://suno.com/s/${id}` };
      return { platform: "suno", embedId: id, url: `https://suno.com/song/${id}` };
    }
  }

  if (host === "soundcloud.com" && parts.length >= 2) {
    const clean = `https://soundcloud.com/${parts.slice(0, 2).join("/")}`;
    return { platform: "soundcloud", embedId: clean, url: clean };
  }

  if (host === "open.spotify.com") {
    const i = parts.indexOf("track");
    const id = i >= 0 ? parts[i + 1] : undefined;
    if (id) return { platform: "spotify", embedId: id, url: `https://open.spotify.com/track/${id}` };
  }

  if (host === "tiktok.com") {
    const i = parts.indexOf("video");
    const id = i >= 0 ? parts[i + 1] : undefined;
    if (id && /^\d+$/.test(id)) {
      return { platform: "tiktok", embedId: id, url: `https://www.tiktok.com/${parts[0]}/video/${id}` };
    }
  }

  u.hash = "";
  return { platform: "link", embedId: "", url: u.toString() };
}

export function iframeSrc(
  platform: Platform,
  embedId: string,
  opts: { start?: number; autoplay?: boolean } = {},
): string | null {
  switch (platform) {
    case "youtube": {
      const qs = new URLSearchParams({ playsinline: "1" });
      if (opts.start) qs.set("start", String(Math.floor(opts.start)));
      if (opts.autoplay) qs.set("autoplay", "1");
      return `https://www.youtube-nocookie.com/embed/${embedId}?${qs}`;
    }
    case "suno":
      return `https://suno.com/embed/${embedId}`;
    case "soundcloud":
      return `https://w.soundcloud.com/player/?url=${encodeURIComponent(embedId)}&color=%23c6ff00&visual=true`;
    case "spotify":
      return `https://open.spotify.com/embed/track/${embedId}?theme=0`;
    case "tiktok":
      return `https://www.tiktok.com/embed/v2/${embedId}`;
    default:
      return null;
  }
}
