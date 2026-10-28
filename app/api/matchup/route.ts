import { hasDb, pickMatchup } from "@/lib/db";
import { issueMatchupToken } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!hasDb) return Response.json({ error: "offline" }, { status: 503 });
  const pair = await pickMatchup();
  if (!pair) return Response.json({ error: "not_enough_songs" }, { status: 404 });
  const [a, b] = pair;
  const pick = ({ id, title, artist, platform, embed_id, url }: typeof a) => ({
    id,
    title,
    artist,
    platform,
    embed_id,
    url,
  });
  return Response.json({ token: issueMatchupToken(a.id, b.id), songs: [pick(a), pick(b)] });
}
