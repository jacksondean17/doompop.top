import { hasDb } from "@/lib/db";
import { runIngest } from "@/lib/ingest";
import { isAdmin } from "@/lib/security";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Called by the scheduled GitHub Action and the daily Vercel cron.
// Safe to expose: runs are throttled in the database and results only land in the moderation queue.
export async function GET(req: Request) {
  if (!hasDb) return Response.json({ error: "offline" }, { status: 503 });
  // Admins can skip the throttle and widen the search window (?hours=) to test a change right away.
  if (isAdmin(req)) {
    const hours = Math.min(Number(new URL(req.url).searchParams.get("hours")) || 3, 24 * 7);
    return Response.json(await runIngest(true, hours * 3600));
  }
  return Response.json(await runIngest());
}
