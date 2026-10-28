import {
  addVideo, dismissDuplicate, duplicatePairs, findDuplicates, hasDb, listByStatus, mergeSong, removeVideo, SCENES,
  searchSongs, setAgentDisabled, setHook, splitVideo, stats, updateSong, type Scene, type Song,
} from "@/lib/db";
import { isAdmin } from "@/lib/security";

export const dynamic = "force-dynamic";

const STATUSES: Song["status"][] = ["pending", "approved", "rejected"];

// ?status=… lists a tab, with duplicate hints for pending songs and likely duplicate pairs on the chart.
// ?q=… finds any song by title, artist or link.
export async function GET(req: Request) {
  if (!isAdmin(req)) return Response.json({ error: "nope" }, { status: 401 });
  if (!hasDb) return Response.json({ error: "offline" }, { status: 503 });
  const params = new URL(req.url).searchParams;
  const q = params.get("q");
  if (q !== null) return Response.json({ songs: await searchSongs(q.slice(0, 200)) });
  const raw = params.get("status") as Song["status"];
  const status = STATUSES.includes(raw) ? raw : "pending";
  const [songs, s, hints, pairs] = await Promise.all([
    listByStatus(status),
    stats(),
    status === "pending" ? findDuplicates() : {},
    duplicatePairs(),
  ]);
  return Response.json({ songs, stats: s, hints, pairs });
}

// Body is one action:
//   { id, status?, title?, artist?, scene? }   edit a song ("scene": null clears it)
//   { id, mergeInto }                          move song id's videos and votes onto mergeInto
//   { id, notDupeOf }                          stop suggesting id and notDupeOf as the same song
//   { videoId, split: true }                   detach a video into its own pending song
//   { videoId, remove: true }                  delete a video (a song keeps at least one)
//   { id, addUrl, artist? }                    attach another link to song id
//   { agent, disabled }                        switch a registered AI agent off or back on
//   { videoId, hook }                          set where the catchy bit starts, in seconds (null = guess)
export async function POST(req: Request) {
  if (!isAdmin(req)) return Response.json({ error: "nope" }, { status: 401 });
  if (!hasDb) return Response.json({ error: "offline" }, { status: 503 });
  const body = await req.json().catch(() => null);
  if (!body) return Response.json({ error: "bad_body" }, { status: 400 });

  if (typeof body.agent === "string") return Response.json({ ok: await setAgentDisabled(body.agent, Boolean(body.disabled)) });

  const videoId = Number(body.videoId);
  if (Number.isInteger(videoId) && body.split) return Response.json({ ok: await splitVideo(videoId) });
  if (Number.isInteger(videoId) && body.remove) return Response.json({ ok: await removeVideo(videoId) });
  if (Number.isInteger(videoId) && "hook" in body) {
    const hook = body.hook === null ? null : Number(body.hook);
    if (hook !== null && !(hook >= 0 && hook < 3600)) return Response.json({ error: "bad_hook" }, { status: 400 });
    return Response.json({ ok: await setHook(videoId, hook) });
  }

  const id = Number(body.id);
  if (!Number.isInteger(id)) return Response.json({ error: "bad_id" }, { status: 400 });
  if (body.mergeInto !== undefined || body.notDupeOf !== undefined) {
    const other = Number(body.mergeInto ?? body.notDupeOf);
    if (!Number.isInteger(other)) return Response.json({ error: "bad_target" }, { status: 400 });
    return Response.json({ ok: await (body.mergeInto !== undefined ? mergeSong(id, other) : dismissDuplicate(id, other)) });
  }
  if (typeof body.addUrl === "string") {
    const r = await addVideo(id, body.addUrl, typeof body.artist === "string" ? body.artist.trim() || null : null);
    return Response.json({ ok: r === "ok", result: r });
  }
  await updateSong(id, {
    status: STATUSES.includes(body.status) ? body.status : undefined,
    title: typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 120) : undefined,
    artist: typeof body.artist === "string" ? body.artist.trim().slice(0, 80) || null : undefined,
    scene: body.scene === null ? null : Object.hasOwn(SCENES, body.scene) ? (body.scene as Scene) : undefined,
  });
  return Response.json({ ok: true });
}
