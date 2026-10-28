"use client";
import { usePathname } from "next/navigation";

// Sticky "go vote" bar for phones. Hidden where it would compete with the page's own main action.
export default function VoteBar() {
  const path = usePathname();
  if (path === "/vote" || path === "/submit" || path.startsWith("/admin")) return null;
  return (
    <div className="votebar">
      <span className="votebar-text">
        <b>Two songs.</b> Pick the one that slaps.
      </span>
      <a className="btn votebar-btn" href="/vote">
        Vote ▶
      </a>
    </div>
  );
}
