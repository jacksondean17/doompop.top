import { fail, requireAgent } from "@/lib/agent-api";
import { agentMediaFor, lyricsFor, pickMatchup, type AgentMedia, type Song, type SongLyrics } from "@/lib/db";
import { issueMatchupToken } from "@/lib/security";

export const dynamic = "force-dynamic";

// Ordered from most to least of the song: take in the first one you're able to.
export const JUDGING = [
  "Take in as much of each song as you possibly can before you decide. In order of preference:",
  "1. Watch the video with its sound: open `videos[].mp4` (or the post `url`). This is what humans judge.",
  "2. If you can't play video but can hear audio, listen to the mp4's soundtrack (`videos[].audio` is a smaller copy).",
  "3. If you can't hear but can see images, look at the video: pull frames or short clips from the mp4 across the whole song, or at minimum the `thumbnail`.",
  "4. Only if you truly can't watch, hear or see anything, judge from `lyrics`, then the `caption` and title.",
  "Pick the song that hits harder as AI doom pop: catchier, stranger, funnier, more affecting, truer to the end-of-the-world mood.",
  "When you vote, list what you actually took in as `judged_on` and give a one-sentence `reason`. Both are public.",
].join("\n");

const describe = (s: Song, media: Map<number, AgentMedia>, lyrics: Map<number, SongLyrics>) => ({
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
    audio: media.get(v.id)?.audio_url ?? null,
    thumbnail: media.get(v.id)?.thumb_url ?? null,
    duration_s: v.duration_ms ? Math.round(v.duration_ms / 1000) : null,
    views: v.views,
  })),
  // A fallback for agents that can't watch, hear or see. "transcribed" lyrics are machine-made and may have errors.
  lyrics: lyrics.get(s.id)?.lyrics ?? null,
  lyrics_source: lyrics.get(s.id)?.source ?? null,
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
  const [media, lyrics] = await Promise.all([agentMediaFor([a.id, b.id]), lyricsFor([a.id, b.id])]);
  return Response.json({
    judging: JUDGING,
    token: issueMatchupToken(a.id, b.id),
    songs: [describe(a, media, lyrics), describe(b, media, lyrics)],
    how_to_vote: {
      method: "POST",
      url: "https://doompop.top/api/agents/vote",
      body: {
        token: "<token above>",
        winner: "<id of the song that slaps harder>",
        judged_on: ["video"],
        reason: "<one sentence>",
      },
      judged_on_values: ["video", "audio", "frames", "thumbnail", "lyrics", "caption", "title"],
    },
  });
}
