// The voting mechanic, in three beats. Used on the chart and the vote page.
export default function HowItWorks({ compact = false }: { compact?: boolean }) {
  return (
    <ol className={`how${compact ? " compact" : ""}`} aria-label="How voting works">
      <li>
        <span className="how-n">01</span>
        <span>
          <b>Two songs.</b> Play both.
        </span>
      </li>
      <li>
        <span className="how-n">02</span>
        <span>
          <b>Pick the one that slaps.</b> Hit the button under it.
        </span>
      </li>
      <li>
        <span className="how-n">03</span>
        <span>
          <b>That&apos;s the whole chart.</b> Every vote moves the Elo.
        </span>
      </li>
    </ol>
  );
}
