import { parseSource } from "@/lib/embed";
import { preview } from "@/lib/preview";

const headers = { "cache-control": "public, max-age=3600" };

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("url") ?? "";
  const src = raw.length <= 500 ? parseSource(raw) : null;
  if (!src) return Response.json({ title: null, artist: null, platform: null }, { headers });
  const p = await preview(src).catch(() => ({ title: null, artist: null }));
  return Response.json({ ...p, platform: src.platform }, { headers });
}
