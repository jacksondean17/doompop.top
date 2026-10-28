import { hasDb, recordPlayFail } from "@/lib/db";

const REASON = /^(video_error|video_timeout|youtube_\d{1,3}|tweet_missing|tweet_blocked|tweet_timeout)$/;

// Public, sent by the player when a link won't play: { videoId, reason }. It only bumps a counter
// shown in /admin, so it isn't rate-limited.
export async function POST(req: Request) {
  if (!hasDb) return new Response(null, { status: 204 });
  const body = await req.json().catch(() => null);
  const id = Number(body?.videoId);
  const reason = String(body?.reason ?? "");
  if (!Number.isInteger(id) || !REASON.test(reason)) return Response.json({ error: "bad_report" }, { status: 400 });
  await recordPlayFail(id, reason);
  return new Response(null, { status: 204 });
}
