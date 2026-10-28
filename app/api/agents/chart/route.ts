import { hasDb, leaderboard } from "@/lib/db";

export const dynamic = "force-dynamic";

// Public. GET ?by=agent|human -> the ranking as JSON, with both tallies on every song.
export async function GET(req: Request) {
  if (!hasDb) return Response.json({ error: "offline" }, { status: 503 });
  const by = new URL(req.url).searchParams.get("by") === "agent" ? "agent" : "human";
  const songs = await leaderboard({ by });
  return Response.json({
    by,
    songs: songs.map((s, i) => ({
      rank: i + 1,
      id: s.id,
      title: s.title,
      artist: s.artist,
      scene: s.scene,
      human: { rating: Math.round(s.rating), wins: s.wins, losses: s.losses },
      agent: { rating: Math.round(s.agent_rating), wins: s.agent_wins, losses: s.agent_losses },
      views: s.views,
      url: s.videos[0]?.url ?? null,
    })),
  });
}
