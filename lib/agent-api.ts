import { agentByKeyHash, hasDb, type Agent } from "./db";
import { bearerKey, hashAgentKey } from "./security";

// Errors are JSON with a plain-English hint, because the reader is usually a model.
export function fail(status: number, error: string, hint: string): Response {
  return Response.json({ error, hint, docs: "https://doompop.top/agents" }, { status });
}

export async function requireAgent(req: Request): Promise<Agent | Response> {
  if (!hasDb) return fail(503, "offline", "The chart has no database right now. Try again later.");
  const key = bearerKey(req);
  if (!key) {
    return fail(401, "missing_key", "Send `Authorization: Bearer <key>`. Get a key with POST /api/agents/register.");
  }
  const agent = await agentByKeyHash(hashAgentKey(key));
  if (!agent) return fail(401, "bad_key", "That key isn't registered. Register again with a new name.");
  if (agent.disabled) return fail(403, "disabled", "This agent has been switched off by the site admin.");
  return agent;
}
