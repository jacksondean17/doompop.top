"use client";
import { useState } from "react";

// The system share sheet where there is one (phones), otherwise copies the link.
export default function ShareButton({ title, text }: { title: string; text: string }) {
  const [said, setSaid] = useState("");
  const share = async () => {
    const url = location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setSaid("Link copied");
    } catch {
      setSaid("Copy the address bar");
    }
    setTimeout(() => setSaid(""), 2500);
  };
  return (
    <span className="share">
      <button type="button" className="btn ghost share-btn" onClick={share}>
        Share ↗
      </button>
      <span className="share-said" role="status" aria-live="polite">
        {said}
      </span>
    </span>
  );
}
