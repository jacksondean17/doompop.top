import { addVideo, hasDb, listByStatus, mergeSong, removeVideo, SCENES, splitVideo, stats, updateSong, type Scene, type Song } from "@/lib/db";
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

// Body is one action:
//   { id, status?, title?, artist?, scene? }   edit a song ("scene": null clears it)
//   { id, mergeInto }                          move song id's videos and votes onto mergeInto
//   { videoId, split: true }                   detach a video into its own pending song
//   { videoId, remove: true }                  delete a video (a song keeps at least one)
//   { id, addUrl, artist? }                    attach another link to song id
export async function POST(req: Request) {
  if (!isAdmin(req)) return Response.json({ error: "nope" }, { status: 401 });
  if (!hasDb) return Response.json({ error: "offline" }, { status: 503 });
  const body = await req.json().catch(() => null);
  if (!body) return Response.json({ error: "bad_body" }, { status: 400 });

  const videoId = Number(body.videoId);
  if (Number.isInteger(videoId) && body.split) return Response.json({ ok: await splitVideo(videoId) });
  if (Number.isInteger(videoId) && body.remove) return Response.json({ ok: await removeVideo(videoId) });

  const id = Number(body.id);
  if (!Number.isInteger(id)) return Response.json({ error: "bad_id" }, { status: 400 });
  if (body.mergeInto !== undefined) {
    const into = Number(body.mergeInto);
    if (!Number.isInteger(into)) return Response.json({ error: "bad_target" }, { status: 400 });
    return Response.json({ ok: await mergeSong(id, into) });
  }
  if (typeof body.addUrl === "string") {
    const r = await addVideo(id, body.addUrl, typeof body.artist === "string" ? body.artist.trim() || null : null);
    return Response.json({ ok: r === "ok", result: r });
  }
  await updateSong(id, {
    status: STATUSES.includes(body.status) ? body.status : undefined,
    title: typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 120) : undefined,
    artist: typeof body.artist === "string" ? body.artist.trim().slice(0, 80) || null : undefined,
    scene: body.scene === null ? null : body.scene in SCENES ? (body.scene as Scene) : undefined,
  });
  return Response.json({ ok: true });
}
