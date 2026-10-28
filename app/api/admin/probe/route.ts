import { isAdmin } from "@/lib/security";

export const dynamic = "force-dynamic";

// Admin-only check of how X's video CDN answers a request that looks like our vote page's player.
export async function GET(req: Request) {
  if (!isAdmin(req)) return Response.json({ error: "nope" }, { status: 401 });
  const url = new URL(req.url).searchParams.get("url") ?? "";
  if (!/^https:\/\/video\.twimg\.com\//.test(url)) return Response.json({ error: "twimg only" }, { status: 400 });
  const out: Record<string, unknown> = {};
  for (const [name, headers] of [
    ["no-referer", {}],
    ["doompop-referer", { Referer: "https://doompop.top/vote", Origin: "https://doompop.top" }],
  ] as const) {
    const r = await fetch(url, { headers: { Range: "bytes=0-1023", ...headers } });
    out[name] = {
      status: r.status,
      type: r.headers.get("content-type"),
      ranges: r.headers.get("accept-ranges"),
      range: r.headers.get("content-range"),
      corp: r.headers.get("cross-origin-resource-policy"),
    };
  }
  return Response.json(out);
}
