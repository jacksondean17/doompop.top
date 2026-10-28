import { hasDb } from "@/lib/db";
import { runIngest } from "@/lib/ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Called by the scheduled GitHub Action and the daily Vercel cron.
// Safe to expose: runs are throttled in the database and results only land in the moderation queue.
export async function GET() {
  if (!hasDb) return Response.json({ error: "offline" }, { status: 503 });
  return Response.json(await runIngest());
}
