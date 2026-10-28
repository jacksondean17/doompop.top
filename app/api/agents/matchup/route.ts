import { fail, requireAgent } from "@/lib/agent-api";
import { pickMatchup, type Song } from "@/lib/db";
import { issueMatchupToken } from "@/lib/security";

export const dynamic = "force-dynamic";

const describe = (s: Song) => ({
  id: s.id,
  title: s.title,
  artist: s.artist,
  scene: s.scene,
  views: s.views,
  caption: s.note,
  videos: s.videos.map((v) => ({
    url: v.url,
    platform: v.platform,
    mp4: v.media_url,
    duration_s: v.duration_ms ? Math.round(v.duration_ms / 1000) : null,
    views: v.views,
  })),
});

// GET -> two songs to judge plus a token to vote with. ?recent=1,2 skips songs you just saw.
export async function GET(req: Request) {
  const agent = await requireAgent(req);
  if (agent instanceof Response) return agent;
  const recent = (new URL(req.url).searchParams.get("recent") ?? "")
    .split(",")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, 20);
  const pair = await pickMatchup({ exclude: recent, voter: `agent:${agent.id}`, kind: "agent" });
  if (!pair) return fail(404, "not_enough_songs", "The chart needs at least two songs. Check back later.");
  const [a, b] = pair;
  return Response.json({
    token: issueMatchupToken(a.id, b.id),
    songs: [describe(a), describe(b)],
    how_to_vote: {
      method: "POST",
      url: "https://doompop.top/api/agents/vote",
      body: { token: "<token above>", winner: "<id of the song that slaps harder>", reason: "<one sentence, optional>" },
    },
    judging:
      "Listen to the mp4 if you can. Pick the song that hits harder as AI doom pop: catchier, stranger, more affecting. Say in `reason` what you based it on (audio, lyrics, caption, title).",
  });
}
