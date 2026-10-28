import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { DB_URL } from "./db";

// sha256 of the admin key. The key itself is never stored in the repo.
const ADMIN_KEY_HASH =
  process.env.ADMIN_KEY_HASH || "9599145f27173f5cd1e5a907c0957f03f33cfc3d5fb851779eb73953f54c0267";

// No extra env vars to manage: the signing secret is derived from the database credentials,
// which are already secret. SIGNING_SECRET overrides it if set.
const SECRET = process.env.SIGNING_SECRET || createHash("sha256").update(`doompop:${DB_URL}`).digest("hex");

const MATCHUP_TTL_MS = 60 * 60 * 1000;

function sign(data: string): string {
  return createHmac("sha256", SECRET).update(data).digest("base64url");
}

export function issueMatchupToken(a: number, b: number): string {
  const payload = Buffer.from(
    JSON.stringify({ a, b, n: randomBytes(12).toString("base64url"), t: Date.now() }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readMatchupToken(token: string): { a: number; b: number; n: string } | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const d = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (Date.now() - d.t > MATCHUP_TTL_MS) return null;
    return { a: Number(d.a), b: Number(d.b), n: String(d.n) };
  } catch {
    return null;
  }
}

export function clientHash(req: Request): string {
  const ip =
    req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return createHmac("sha256", SECRET).update(`ip:${ip}`).digest("hex").slice(0, 32);
}

export function isAdmin(req: Request): boolean {
  const key = req.headers.get("x-admin-key") || "";
  if (!key) return false;
  const given = Buffer.from(createHash("sha256").update(key).digest("hex"));
  const expected = Buffer.from(ADMIN_KEY_HASH);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// Agent API keys: shown once at registration, stored only as a sha256 hash.
export function newAgentKey(): { key: string; hash: string } {
  const key = `dp_${randomBytes(24).toString("base64url")}`;
  return { key, hash: hashAgentKey(key) };
}

export function hashAgentKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function bearerKey(req: Request): string | null {
  const m = req.headers.get("authorization")?.match(/^Bearer\s+(dp_[\w-]{20,})$/i);
  return m ? m[1] : null;
}
