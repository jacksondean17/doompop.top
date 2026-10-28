"use client";
import { play } from "@/components/MiniPlayer";
import type { Video } from "@/lib/db";

export default function PlayButton({
  title,
  artist,
  video,
  className,
  children,
}: {
  title: string;
  artist: string | null;
  video: Video;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button type="button" className={className} onClick={() => play({ title, artist, video })}>
      {children}
    </button>
  );
}
