import { hasDb, recentVoteCount, recordVote } from "@/lib/db";
import { clientHash, readMatchupToken } from "@/lib/security";

export async function POST(req: Request) {
  if (!hasDb) return Response.json({ error: "offline" }, { status: 503 });
  const body = await req.json().catch(() => null);
  const m = body && typeof body.token === "string" ? readMatchupToken(body.token) : null;
  const winner = Number(body?.winner);
  if (!m || (winner !== m.a && winner !== m.b)) {
    return Response.json({ error: "bad_token" }, { status: 400 });
  }
  const voter = clientHash(req);
  const [perMinute, perDay] = await Promise.all([recentVoteCount(voter, 60), recentVoteCount(voter, 86400)]);
  if (perMinute >= 30 || perDay >= 1000) {
    return Response.json({ error: "slow_down" }, { status: 429 });
  }
  const loser = winner === m.a ? m.b : m.a;
  const delta = await recordVote(m.n, winner, loser, voter);
  if (delta === null) return Response.json({ error: "already_counted" }, { status: 409 });
  return Response.json({ ok: true, delta });
}
