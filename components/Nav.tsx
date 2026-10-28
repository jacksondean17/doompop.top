"use client";
import { usePathname } from "next/navigation";

const LINKS = [
  ["/", "Chart"],
  ["/songs", "Songs"],
  ["/agents", "Agents"], // hidden on small phones; the chart's "Ranked by" toggle links there too
  ["/analytics", "Stats"],
  ["/submit", "Submit"],
] as const;

export default function Nav() {
  const path = usePathname();
  const onVote = path === "/vote";
  return (
    <nav className="nav" aria-label="Main">
      {LINKS.map(([href, label]) => (
        <a key={href} href={href} className={`nav-${label.toLowerCase()}${path === href ? " on" : ""}`} aria-current={path === href ? "page" : undefined}>
          {label}
        </a>
      ))}
      <a href="/vote" className={`nav-vote${onVote ? " on" : ""}`} aria-current={onVote ? "page" : undefined}>
        <span className="pulse" aria-hidden="true" />
        Vote
      </a>
    </nav>
  );
}
