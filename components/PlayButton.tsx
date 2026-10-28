"use client";
import { play } from "@/components/MiniPlayer";
import type { Video } from "@/lib/db";

// Plays a song in the docked player, starting with `pick` (a video id) if given, then any other version.
export default function PlayButton({
  title,
  artist,
  videos,
  pick,
  className,
  children,
}: {
  title: string;
  artist: string | null;
  videos: Video[];
  pick?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button type="button" className={className} onClick={() => play({ title, artist, videos, pick })}>
      {children}
    </button>
  );
}
