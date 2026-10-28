import { hasDb, listByStatus, stats, updateSong, type Song } from "@/lib/db";
import { isAdmin } from "@/lib/security";

export const dynamic = "force-dynamic";

const STATUSES: Song["status"][] = ["pending", "approved", "rejected"];

export async function GET(req: Request) {
  if (!isAdmin(req)) return Response.json({ error: "nope" }, { status: 401 });
  if (!hasDb) return Response.json({ error: "offline" }, { status: 503 });
  const status = new URL(req.url).searchParams.get("status") as Song["status"];
  const [songs, s] = await Promise.all([listByStatus(STATUSES.includes(status) ? status : "pending"), stats()]);
  return Response.json({ songs, stats: s });
}

export async function POST(req: Request) {
  if (!isAdmin(req)) return Response.json({ error: "nope" }, { status: 401 });
  if (!hasDb) return Response.json({ error: "offline" }, { status: 503 });
  const body = await req.json().catch(() => null);
  const id = Number(body?.id);
  if (!Number.isInteger(id)) return Response.json({ error: "bad_id" }, { status: 400 });
  await updateSong(id, {
    status: STATUSES.includes(body.status) ? body.status : undefined,
    title: typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 120) : undefined,
    artist: typeof body.artist === "string" ? body.artist.trim().slice(0, 80) || null : undefined,
  });
  return Response.json({ ok: true });
}
