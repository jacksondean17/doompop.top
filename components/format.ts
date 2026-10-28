import type { Platform } from "@/lib/embed";

export function formatCount(n: number | null | undefined): string {
  if (!n || n < 0) return "0";
  if (n < 1000) return String(Math.round(n));
  const [div, unit] = n >= 1e9 ? [1e9, "B"] : n >= 1e6 ? [1e6, "M"] : [1e3, "K"];
  const v = n / div;
  const s = v >= 100 ? Math.round(v).toString() : v.toFixed(1).replace(/\.0$/, "");
  // 999.95K rounds up to "1000K"; bump to the next unit instead.
  if (s === "1000" && unit !== "B") return `1${unit === "K" ? "M" : "B"}`;
  return s + unit;
}

export const PLATFORM_LABEL: Record<Platform, string> = {
  x: "X",
  youtube: "YouTube",
  suno: "Suno",
  soundcloud: "SoundCloud",
  spotify: "Spotify",
  tiktok: "TikTok",
  link: "Link",
};

export function videoLabel(v: { platform: Platform; views: number | null }): string {
  const p = PLATFORM_LABEL[v.platform] ?? v.platform;
  return v.views ? `${p} · ${formatCount(v.views)}` : p;
}

export function ago(when: string | Date | null): string {
  if (!when) return "";
  const s = Math.max(0, (Date.now() - new Date(when).getTime()) / 1000);
  if (s < 60) return "just now";
  const units: [number, string][] = [
    [60, "min"],
    [3600, "h"],
    [86400, "d"],
    [604800, "w"],
  ];
  let out = "";
  for (const [secs, label] of units) if (s >= secs) out = `${Math.floor(s / secs)}${label === "min" ? " min" : label}`;
  return `${out} ago`;
}

export function day(when: string | Date | null): string {
  if (!when) return "";
  return new Date(when).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}
