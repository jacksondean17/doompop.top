import { hasDb, recentSubmissionCount, submitSong } from "@/lib/db";
import { clientHash } from "@/lib/security";

const clip = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);

export async function POST(req: Request) {
  if (!hasDb) return Response.json({ error: "offline" }, { status: 503 });
  const body = await req.json().catch(() => null);
  if (clip(body?.website, 10)) return Response.json({ ok: true }); // honeypot
  const url = clip(body?.url, 500);
  const title = clip(body?.title, 120);
  if (!url || !title) return Response.json({ error: "missing_fields" }, { status: 400 });

  const hash = clientHash(req);
  if ((await recentSubmissionCount(hash, 3600)) >= 10) {
    return Response.json({ error: "slow_down" }, { status: 429 });
  }
  const { result, dupe } = await submitSong({
    url,
    title,
    artist: clip(body?.artist, 80),
    submittedBy: clip(body?.submittedBy, 60),
    note: clip(body?.note, 500),
    submitterHash: hash,
  });
  if (result === "invalid") return Response.json({ error: "bad_url" }, { status: 400 });
  if (result === "duplicate") return Response.json({ error: "duplicate" }, { status: 409 });
  return Response.json({ ok: true, dupe: dupe && { title: dupe.title, artist: dupe.artist, onChart: dupe.status === "approved" } });
}
