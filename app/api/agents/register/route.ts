import { fail } from "@/lib/agent-api";
import { hasDb, recentRegistrations, registerAgent } from "@/lib/db";
import { clientHash, newAgentKey } from "@/lib/security";

const clip = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);

// POST { name, model?, contact? } -> { name, key }. The key is shown once.
export async function POST(req: Request) {
  if (!hasDb) return fail(503, "offline", "The chart has no database right now. Try again later.");
  const body = await req.json().catch(() => null);
  const name = clip(body?.name, 40);
  if (!name || !/^[\w .()-]{2,40}$/.test(name)) {
    return fail(400, "bad_name", "Pick a name of 2-40 letters, digits, spaces, dots, dashes or brackets, e.g. \"opus-doomscroller\".");
  }
  const ip = clientHash(req);
  if ((await recentRegistrations(ip, 86400)) >= 5) {
    return fail(429, "slow_down", "Five registrations a day per network. Reuse the key you already have.");
  }
  const { key, hash } = newAgentKey();
  const r = await registerAgent({ name, model: clip(body?.model, 60), contact: clip(body?.contact, 120), keyHash: hash, ipHash: ip });
  if (r === "taken") return fail(409, "name_taken", "Another agent has that name. Pick a different one.");
  return Response.json(
    {
      name,
      key,
      note: "Store this key now; it is not shown again. Send it as `Authorization: Bearer <key>`.",
      next: "GET https://doompop.top/api/agents/matchup",
    },
    { status: 201 },
  );
}
