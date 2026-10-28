import { hasDb, leaderboard, SCENES, type ChartSort, type ChartWindow, type Scene, type Song } from "@/lib/db";
import { formatCount, videoLabel } from "@/components/format";

export const dynamic = "force-dynamic";

const SORTS: [ChartSort, string][] = [
  ["rating", "Top rated"],
  ["views", "Most viewed"],
  ["hot", "Hot this week"],
  ["new", "Newest"],
];
const WINDOWS: [ChartWindow, string][] = [
  ["all", "All time"],
  ["month", "This month"],
  ["week", "This week"],
];
const DEFAULTS = { sort: "rating", window: "all", scene: "", q: "" };
type Params = typeof DEFAULTS;
type RawParams = Record<string, string | string[] | undefined>;

function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

function parse(raw: RawParams): Params {
  const sort = one(raw.sort);
  const window = one(raw.window);
  const scene = one(raw.scene);
  return {
    sort: SORTS.some(([k]) => k === sort) ? sort : DEFAULTS.sort,
    window: WINDOWS.some(([k]) => k === window) ? window : DEFAULTS.window,
    scene: scene in SCENES ? scene : "",
    q: one(raw.q).slice(0, 80),
  };
}

function href(p: Params, change: Partial<Params>): string {
  const next = { ...p, ...change };
  const qs = new URLSearchParams();
  for (const k of Object.keys(DEFAULTS) as (keyof Params)[]) {
    if (next[k] && next[k] !== DEFAULTS[k]) qs.set(k, next[k]);
  }
  const s = qs.toString();
  return s ? `/?${s}` : "/";
}

function Chips({ label, items, active, to }: { label: string; items: [string, string][]; active: string; to: (k: string) => string }) {
  return (
    <div className="chips">
      <span className="chips-label">{label}</span>
      {items.map(([k, text]) => (
        <a key={k} href={to(k)} className={`chip${k === active ? " on" : ""}`} aria-current={k === active ? "true" : undefined}>
          {text}
        </a>
      ))}
    </div>
  );
}

function Videos({ song }: { song: Song }) {
  const [main, ...rest] = song.videos;
  if (!main) return null;
  const link = (v: Song["videos"][number], cls?: string) => (
    <a key={v.id} className={cls} href={v.url} target="_blank" rel="noreferrer">
      ▶ {videoLabel(v)}
    </a>
  );
  const shown = rest.slice(0, 2);
  const more = rest.slice(2);
  return (
    <div className="vids">
      {link(main, "main")}
      {shown.map((v) => link(v))}
      {more.length > 0 && (
        <details>
          <summary>+{more.length} more</summary>
          <div className="vids">{more.map((v) => link(v))}</div>
        </details>
      )}
    </div>
  );
}

export default async function Home({ searchParams }: { searchParams: Promise<RawParams> }) {
  const p = parse(await searchParams);
  const filtered = href(p, {}) !== "/";
  let songs: Song[] = [];
  let error = false;
  if (hasDb) {
    try {
      songs = await leaderboard({
        sort: p.sort as ChartSort,
        window: p.window as ChartWindow,
        scene: (p.scene || undefined) as Scene | undefined,
        q: p.q || undefined,
      });
    } catch (e) {
      console.error(e);
      error = true;
    }
  }
  const scenes: [string, string][] = [["", "All"], ...Object.entries(SCENES)];

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

      {hasDb && !error && (
        <section className="filters">
          <Chips label="Sort" items={SORTS} active={p.sort} to={(sort) => href(p, { sort })} />
          <Chips label="When" items={WINDOWS} active={p.window} to={(window) => href(p, { window })} />
          <Chips label="Scene" items={scenes} active={p.scene} to={(scene) => href(p, { scene })} />
          <form className="search" action="/" method="get" role="search">
            {p.sort !== DEFAULTS.sort && <input type="hidden" name="sort" value={p.sort} />}
            {p.window !== DEFAULTS.window && <input type="hidden" name="window" value={p.window} />}
            {p.scene && <input type="hidden" name="scene" value={p.scene} />}
            <input type="search" name="q" defaultValue={p.q} placeholder="Search title or artist" aria-label="Search" />
            <button className="btn ghost" type="submit">
              Find
            </button>
            {filtered && (
              <a className="reset" href="/">
                Reset
              </a>
            )}
          </form>
        </section>
      )}

      {hasDb && !error && songs.length === 0 &&
        (filtered ? (
          <div className="empty">
            Nothing on the chart matches that. <a href="/">Reset the filters</a>.
          </div>
        ) : (
          <div className="empty">
            The chart is empty. <a href="/submit">Submit the first track</a>.
          </div>
        ))}

      {songs.length > 0 && (
        <ol className="chart">
          {songs.slice(0, 100).map((s, i) => (
            <li className="row" key={s.id}>
              <div className="rank">{i + 1}</div>
              <div className="song">
                <div className="title">
                  {s.videos[0] ? (
                    <a href={s.videos[0].url} target="_blank" rel="noreferrer">
                      {s.title}
                    </a>
                  ) : (
                    s.title
                  )}
                  {s.scene && s.scene !== "other" && <span className={`badge scene-${s.scene}`}>{SCENES[s.scene]}</span>}
                </div>
                {s.artist && <div className="artist">{s.artist}</div>}
                <Videos song={s} />
              </div>
              <div className="nums">
                <strong>{Math.round(s.rating)}</strong>
                <span>
                  {s.wins}W–{s.losses}L
                </span>
                {s.views > 0 && <span className="views">{formatCount(s.views)} views</span>}
                {p.sort === "hot" && s.recent_votes ? <span className="views">{s.recent_votes} votes/wk</span> : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
