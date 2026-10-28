import { hasDb, pickMatchup, type Song } from "@/lib/db";
import { clientHash, issueMatchupToken } from "@/lib/security";

export const dynamic = "force-dynamic";

export type MatchSong = Pick<Song, "id" | "title" | "artist" | "scene" | "views" | "videos">;

// ?recent=1,2,3: songs this visitor was just shown, so the next pair avoids them.
export async function GET(req: Request) {
  if (!hasDb) return Response.json({ error: "offline" }, { status: 503 });
  const recent = (new URL(req.url).searchParams.get("recent") ?? "")
    .split(",")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, 20);
  const pair = await pickMatchup({ exclude: recent, voter: clientHash(req) });
  if (!pair) return Response.json({ error: "not_enough_songs" }, { status: 404 });
  const [a, b] = pair;
  const pick = ({ id, title, artist, scene, views, videos }: Song): MatchSong => ({ id, title, artist, scene, views, videos });
  return Response.json({ token: issueMatchupToken(a.id, b.id), songs: [pick(a), pick(b)] });
}
