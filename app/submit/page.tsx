"use client";
import { useState } from "react";

const ERRORS: Record<string, string> = {
  bad_url: "That link doesn't look right.",
  duplicate: "Already got that one. Great taste, though.",
  missing_fields: "Need at least a link and a title.",
  slow_down: "That's a lot of doom for one hour. Come back later.",
  offline: "No database connected yet. Submissions are closed.",
};

export default function SubmitPage() {
  const [state, setState] = useState<{ ok?: boolean; msg?: string }>({});
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    try {
      const r = await fetch("/api/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      const d = await r.json();
      if (r.ok) {
        form.reset();
        setState({ ok: true, msg: "Received. A human will check it's actually doom pop, then it hits the chart." });
      } else {
        setState({ ok: false, msg: ERRORS[d.error] ?? "Something broke." });
      }
    } catch {
      setState({ ok: false, msg: "Couldn't reach the server." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="hero">
        <p className="kicker">Feed the chart</p>
        <h1>
          Submit <em>doom</em>
        </h1>
        <p>
          AI-made songs about AI, existential dread, alignment, the singularity, or the general vibe of it all.
          Links from X, YouTube, Suno, SoundCloud, Spotify or TikTok embed best.
        </p>
      </section>
      <form className="stack" onSubmit={onSubmit}>
        <label>
          Link
          <input name="url" type="url" required placeholder="https://suno.com/song/…" />
        </label>
        <label>
          Title
          <input name="title" required maxLength={120} placeholder="Hit the Brakes" />
        </label>
        <label>
          Artist / creator (optional)
          <input name="artist" maxLength={80} />
        </label>
        <label>
          Your name (optional)
          <input name="submittedBy" maxLength={60} />
        </label>
        <label>
          Why it slaps (optional)
          <textarea name="note" rows={3} maxLength={500} />
        </label>
        <input className="hp" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
        {state.msg && <div className={`msg${state.ok ? "" : " err"}`}>{state.msg}</div>}
        <div>
          <button className="btn" disabled={busy}>
            Send it
          </button>
        </div>
      </form>
    </>
  );
}
