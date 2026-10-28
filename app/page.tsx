import { hasDb, leaderboard, type Song } from "@/lib/db";

export const dynamic = "force-dynamic";

const PLATFORM_LABEL: Record<string, string> = {
  x: "X",
  youtube: "YouTube",
  suno: "Suno",
  soundcloud: "SoundCloud",
  spotify: "Spotify",
  tiktok: "TikTok",
  link: "Link",
};

export default async function Home() {
  let songs: Song[] = [];
  let error = false;
  if (hasDb) {
    try {
      songs = await leaderboard();
    } catch (e) {
      console.error(e);
      error = true;
    }
  }

  return (
    <>
      <section className="hero">
        <p className="kicker">The official chart of the end times</p>
        <h1>
          The Doom <em>100</em>
        </h1>
        <p>
          Songs made by machines about the end of everything. Ranked by Elo, two at a time, by people who should
          probably be doing something else.
        </p>
        <p>
          <a className="btn" href="/vote">
            Start ranking
          </a>
        </p>
      </section>

      {!hasDb && (
        <div className="notice">
          <strong>Chart offline.</strong> No database is connected yet, so nothing can be ranked. The singularity
          is delayed.
        </div>
      )}
      {error && (
        <div className="notice">
          <strong>Chart glitched.</strong> The database didn&apos;t answer. Try again in a minute.
        </div>
      )}
      {hasDb && !error && songs.length === 0 && (
        <div className="empty">
          The chart is empty. <a href="/submit">Submit the first track</a>.
        </div>
      )}

      {songs.length > 0 && (
        <ol className="chart">
          {songs.slice(0, 100).map((s, i) => (
            <li className="row" key={s.id}>
              <div className="rank">{i + 1}</div>
              <div>
                <div className="title">
                  <a href={s.url} target="_blank" rel="noreferrer">
                    {s.title}
                  </a>
                  <span className="badge">{PLATFORM_LABEL[s.platform] ?? s.platform}</span>
                </div>
                {s.artist && <div className="artist">{s.artist}</div>}
              </div>
              <div className="nums">
                <strong>{Math.round(s.rating)}</strong>
                {s.wins}W–{s.losses}L
              </div>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
