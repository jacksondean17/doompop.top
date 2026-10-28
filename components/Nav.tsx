"use client";
import { usePathname } from "next/navigation";

const LINKS = [
  ["/", "Chart"],
  ["/vote", "Vote"],
  ["/submit", "Submit"],
] as const;

export default function Nav() {
  const path = usePathname();
  return (
    <nav className="nav">
      {LINKS.map(([href, label]) => (
        <a key={href} href={href} className={path === href ? "on" : undefined}>
          {label}
        </a>
      ))}
    </nav>
  );
}
