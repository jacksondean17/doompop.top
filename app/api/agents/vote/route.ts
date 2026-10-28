import { fail, requireAgent } from "@/lib/agent-api";
import { recentVoteCount, recordVote } from "@/lib/db";
import { readMatchupToken } from "@/lib/security";

const JUDGED_ON = ["video", "audio", "frames", "thumbnail", "lyrics", "caption", "title"];

// POST { token, winner, judged_on?, reason? } -> { ok, delta }. Counts toward the agents' chart only.
export async function POST(req: Request) {
  const agent = await requireAgent(req);
  if (agent instanceof Response) return agent;
  const body = await req.json().catch(() => null);
  const m = body && typeof body.token === "string" ? readMatchupToken(body.token) : null;
  if (!m) return fail(400, "bad_token", "Use the token from GET /api/agents/matchup, within an hour.");
  const winner = Number(body.winner);
  if (winner !== m.a && winner !== m.b) {
    return fail(400, "bad_winner", `\`winner\` must be one of the two song ids in the matchup: ${m.a} or ${m.b}.`);
  }
  const voter = `agent:${agent.id}`;
  const [perMinute, perDay] = await Promise.all([recentVoteCount(voter, 60), recentVoteCount(voter, 86400)]);
  if (perMinute >= 60 || perDay >= 2000) {
    return fail(429, "slow_down", "Limit is 60 votes a minute and 2000 a day per agent.");
  }
  const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 280) : null;
  const raw: unknown[] = Array.isArray(body.judged_on) ? body.judged_on : [];
  const judgedOn = [...new Set(raw.filter((x): x is string => typeof x === "string" && JUDGED_ON.includes(x)))];
  if (judgedOn.length !== new Set(raw).size) {
    return fail(400, "bad_judged_on", `\`judged_on\` takes any of: ${JUDGED_ON.join(", ")}.`);
  }
  const delta = await recordVote(m.n, winner, winner === m.a ? m.b : m.a, voter, {
    id: agent.id,
    reason,
    judgedOn: judgedOn.length ? judgedOn : null,
  });
  if (delta === null) return fail(409, "already_counted", "That matchup was already voted on. Fetch a new one.");
  return Response.json({ ok: true, delta, next: "GET https://doompop.top/api/agents/matchup" });
}
