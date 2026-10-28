import { isAdmin } from "@/lib/security";

export const dynamic = "force-dynamic";

type Tweet = {
  id: string;
  text?: string;
  createdAt?: string;
  likeCount?: number;
  retweetCount?: number;
  viewCount?: number;
  author?: { userName?: string; followers?: number };
  extendedEntities?: { media?: { type?: string }[] };
  entities?: { urls?: { expanded_url?: string }[] };
  quoted_tweet?: Tweet | null;
  inReplyToId?: string | null;
};

// Admin-only window onto X search, used to discover what terms the bot should watch.
// ?q=<X search query>&type=Top|Latest  or  ?ids=<comma-separated tweet ids>
export async function GET(req: Request) {
  if (!isAdmin(req)) return Response.json({ error: "nope" }, { status: 401 });
  const key = process.env.TWITTERAPI_IO_KEY;
  if (!key) return Response.json({ error: "no_key" }, { status: 503 });

  const params = new URL(req.url).searchParams;
  const ids = params.get("ids");
  const url = ids
    ? new URL("https://api.twitterapi.io/twitter/tweets")
    : new URL("https://api.twitterapi.io/twitter/tweet/advanced_search");
  if (ids) url.searchParams.set("tweet_ids", ids);
  else {
    url.searchParams.set("query", params.get("q") ?? "");
    url.searchParams.set("queryType", params.get("type") === "Latest" ? "Latest" : "Top");
    if (params.get("cursor")) url.searchParams.set("cursor", params.get("cursor")!);
  }

  const r = await fetch(url, { headers: { "X-API-Key": key } });
  const d = (await r.json().catch(() => ({}))) as { tweets?: Tweet[]; next_cursor?: string };
  if (!r.ok) return Response.json({ error: r.status, detail: d }, { status: 502 });
  if (params.get("raw")) return Response.json(d);
  return Response.json({
    next_cursor: d.next_cursor ?? null,
    tweets: (d.tweets ?? []).map((t) => ({
      url: `https://x.com/${t.author?.userName}/status/${t.id}`,
      at: t.createdAt,
      likes: t.likeCount,
      rts: t.retweetCount,
      views: t.viewCount,
      followers: t.author?.followers,
      media: t.extendedEntities?.media?.map((m) => m.type) ?? [],
      links: t.entities?.urls?.map((u) => u.expanded_url).filter(Boolean) ?? [],
      quoted: t.quoted_tweet ? `https://x.com/${t.quoted_tweet.author?.userName}/status/${t.quoted_tweet.id}` : null,
      replyTo: t.inReplyToId ?? null,
      text: t.text,
    })),
  });
}
