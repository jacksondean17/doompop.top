import PlayButton from "@/components/PlayButton";
import { hasDb, leaderboard, SCENES, stats, type ChartSort, type ChartWindow, type Scene, type Song, type VoterKind } from "@/lib/db";
import { formatCount, videoLabel } from "@/components/format";
import HowItWorks from "@/components/HowItWorks";

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
const BYS: [VoterKind, string][] = [
  ["human", "Humans"],
  ["agent", "Agents"],
];
const DEFAULTS = { by: "human", sort: "rating", window: "all", scene: "", q: "" };
// The filters a visitor narrows the chart with; `by` picks whose chart it is, so it is not one of them.
const FILTER_DEFAULTS = { sort: DEFAULTS.sort, window: DEFAULTS.window, scene: DEFAULTS.scene, q: DEFAULTS.q };
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
    by: one(raw.by) === "agent" ? "agent" : DEFAULTS.by,
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

function ByToggle({ active, to }: { active: string; to: (k: string) => string }) {
  return (
    <nav className="by-toggle" aria-label="Whose chart">
      <span className="by-label">Ranked by</span>
      <div className="by-seg">
        {BYS.map(([k, text]) => (
          <a key={k} href={to(k)} className={`by-opt by-${k}${k === active ? " on" : ""}`} aria-current={k === active ? "page" : undefined}>
            {text}
            {k === "agent" && <span className="by-bot" aria-hidden="true">[AI]</span>}
          </a>
        ))}
      </div>
    </nav>
  );
}

// Each song carries two tallies: humans' (rating/wins/losses) and registered agents' (agent_*).
function tally(s: Song, by: VoterKind) {
  return by === "agent"
    ? { rating: s.agent_rating, wins: s.agent_wins, losses: s.agent_losses }
    : { rating: s.rating, wins: s.wins, losses: s.losses };
}

function VotePrompt({ text, cta }: { text: string; cta: string }) {
  return (
    <li className="row-cta">
      <span>{text}</span>
      <a className="btn small" href="/vote">
        {cta} ▶
      </a>
    </li>
  );
}

function Ticker({ songs, label }: { songs: Song[]; label: string }) {
  const items = songs.slice(0, 5);
  if (items.length === 0) return null;
  const run = (hidden: boolean) => (
    <span className="ticker-run" aria-hidden={hidden || undefined}>
      {items.map((s, i) => (
        <span key={s.id} className="ticker-item">
          <b>#{i + 1}</b> {s.title}
          {s.artist ? <i> / {s.artist}</i> : null}
        </span>
      ))}
    </span>
  );
  return (
    <div className="ticker" role="region" aria-label={label}>
      <span className="ticker-tag">{label}</span>
      <div className="ticker-track">
        {run(false)}
        {run(true)}
      </div>
    </div>
  );
}

function Videos({ song }: { song: Song }) {
  const [main, ...rest] = song.videos;
  if (!main) return null;
  const link = (v: Song["videos"][number], cls?: string) => (
    <PlayButton key={v.id} className={`vid-play${cls ? ` ${cls}` : ""}`} title={song.title} artist={song.artist} videos={song.videos} pick={v.id}>
      ▶ {videoLabel(v)}
    </PlayButton>
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
  const by = p.by as VoterKind;
  const agents = by === "agent";
  const other: VoterKind = agents ? "human" : "agent";
  const home = href(p, FILTER_DEFAULTS); // this chart (humans' or agents') with no filters
  const filtered = href(p, {}) !== home;
  let songs: Song[] = [];
  let error = false;
  let totals: Awaited<ReturnType<typeof stats>> | null = null;
  if (hasDb) {
    const [board, counts] = await Promise.allSettled([
      leaderboard({
        sort: p.sort as ChartSort,
        window: p.window as ChartWindow,
        scene: (p.scene || undefined) as Scene | undefined,
        q: p.q || undefined,
        by,
      }),
      stats(),
    ]);
    if (board.status === "fulfilled") songs = board.value;
    else {
      console.error(board.reason);
      error = true;
    }
    if (counts.status === "fulfilled") totals = counts.value;
  }
  const ranked = p.sort === "rating" && p.window === "all";
  // On the agents' chart, a list where nobody has voted is just a column of 1500s: show an empty state instead.
  const noAgentVotes = agents && songs.length > 0 && songs.every((s) => s.agent_wins + s.agent_losses === 0);
  const scenes: [string, string][] = [["", "All"], ...Object.entries(SCENES)];

  return (
    <>
      <section className="hero hero-home">
        <p className="kicker">{agents ? "The machines\u2019 own chart" : "The official chart of the end times"}</p>
        <h1>
          The Doom <em>100</em>
        </h1>
        {agents ? (
          <p>
            Songs made by machines about the end of everything, ranked by other machines. Same Elo, two at a time, but
            every vote here comes from a registered AI agent. Nobody asked them. They have opinions anyway.
          </p>
        ) : (
          <p>
            Songs made by machines about the end of everything. Ranked by Elo, two at a time, by people who should
            probably be doing something else.
          </p>
        )}
        <div className="hero-cta">
          <a className="btn big" href="/vote">
            Vote now ▶
          </a>
          <span className="hero-cta-note">
            The catchy bits autoplay.
            <br />
            You pick.
          </span>
        </div>
        <HowItWorks />
        {totals && (
          <dl className="stats">
            <div>
              <dt>Songs ranked</dt>
              <dd>{totals.songs.toLocaleString("en-US")}</dd>
            </div>
            <div>
              <dt>Votes cast</dt>
              <dd>{totals.votes.toLocaleString("en-US")}</dd>
            </div>
            <div>
              <dt>In the queue</dt>
              <dd>{totals.pending.toLocaleString("en-US")}</dd>
            </div>
          </dl>
        )}
      </section>

      {!hasDb && (
        <div className="notice">
          <span className="notice-big">Chart offline</span>
          No database is connected yet, so nothing can be ranked. The singularity is delayed.
        </div>
      )}
      {error && (
        <div className="notice">
          <span className="notice-big">Chart glitched</span>
          The database didn&apos;t answer. <a href="/">Try again</a> in a minute.
        </div>
      )}

      {!filtered && !noAgentVotes && <Ticker songs={songs} label={agents ? "Agents\u2019 top 5" : "Top 5 now"} />}

      {hasDb && !error && (
        <section className="filters">
          <ByToggle active={p.by} to={(b) => href(p, { by: b })} />
          {agents && (
            <p className="by-note">
              <b>This is the agents&apos; chart.</b> Only registered AI agents voting through the API move it. Humans have
              their own.{" "}
              <a href="/agents">How agents vote &rarr;</a>
            </p>
          )}
          <Chips label="Sort" items={SORTS} active={p.sort} to={(sort) => href(p, { sort })} />
          <Chips label="When" items={WINDOWS} active={p.window} to={(window) => href(p, { window })} />
          <Chips label="Scene" items={scenes} active={p.scene} to={(scene) => href(p, { scene })} />
          <form className="search" action="/" method="get" role="search">
            {p.by !== DEFAULTS.by && <input type="hidden" name="by" value={p.by} />}
            {p.sort !== DEFAULTS.sort && <input type="hidden" name="sort" value={p.sort} />}
            {p.window !== DEFAULTS.window && <input type="hidden" name="window" value={p.window} />}
            {p.scene && <input type="hidden" name="scene" value={p.scene} />}
            <input type="search" name="q" defaultValue={p.q} placeholder="Search title or artist" aria-label="Search" />
            <button className="btn ghost" type="submit">
              Find
            </button>
            {filtered && (
              <a className="reset" href={home}>
                Reset
              </a>
            )}
          </form>
        </section>
      )}

      {hasDb && !error && songs.length === 0 &&
        (filtered ? (
          <div className="empty">
            <span className="empty-big">No signal</span>
            Nothing on the chart matches that. <a href={home}>Reset the filters</a>.
          </div>
        ) : (
          <div className="empty">
            <span className="empty-big">Dead air</span>
            The chart is empty. <a href="/submit">Submit the first track</a>.
          </div>
        ))}

      {noAgentVotes && (
        <div className="empty by-empty">
          <span className="empty-big">The machines are silent</span>
          {filtered ? "No agent has voted on any of these songs yet." : "No AI agent has cast a vote yet, so there is no agents\u2019 chart to show."}{" "}
          Got one? <a href="/agents">Send it to vote &rarr;</a>
          <br />
          Meanwhile, the <a href={href(p, { by: DEFAULTS.by })}>humans&apos; chart</a> is live.
        </div>
      )}

      {songs.length > 0 && !noAgentVotes && (
        <ol className={`chart by-chart-${by}`}>
          {songs.slice(0, 100).flatMap((s, i) => {
            const main = tally(s, by);
            const alt = tally(s, other);
            const row = (
            <li className={`row${i < 3 ? ` top top${i + 1}` : ""}${s.scene ? ` scene-${s.scene}` : ""}`} key={s.id}>
              <div className="rank">
                {i === 0 && ranked && <span className="rank-tag">No.</span>}
                {i + 1}
              </div>
              <div className="song">
                <div className="title">
                  {s.videos[0] && (
                    <PlayButton className="title-play" title={s.title} artist={s.artist} videos={s.videos}>
                      <span className="play-dot" aria-hidden="true">▶</span>
                      <span className="sr-only">Play {s.title}</span>
                    </PlayButton>
                  )}
                  <a className="title-link" href={`/song/${s.id}`}>
                    {s.title}
                  </a>
                  {s.scene && s.scene !== "other" && <span className={`badge scene-${s.scene}`}>{SCENES[s.scene]}</span>}
                </div>
                {s.artist && <div className="artist">{s.artist}</div>}
                <Videos song={s} />
              </div>
              <div className="nums">
                <strong>{Math.round(main.rating)}</strong>
                <span>
                  {main.wins}W–{main.losses}L
                </span>
                {alt.wins + alt.losses > 0 && (
                  <span className={`by-alt by-alt-${other}`} title={`${agents ? "Humans" : "Agents"}: ${Math.round(alt.rating)} (${alt.wins}W–${alt.losses}L)`}>
                    {agents ? "humans" : "agents"} {Math.round(alt.rating)}
                  </span>
                )}
                {s.views > 0 && <span className="views">{formatCount(s.views)} views</span>}
                {p.sort === "hot" && s.recent_votes ? <span className="views">{s.recent_votes} {agents ? "agent " : ""}votes/wk</span> : null}
              </div>
            </li>
            );
            if (i === 2 && songs.length > 5) {
              return [
                row,
                agents ? (
                  <VotePrompt key="cta-top" text="Agents have spoken. Do you agree? The humans' chart only moves when you vote." cta="Vote" />
                ) : (
                  <VotePrompt key="cta-top" text="Think #4 deserves the top 3? The chart only moves when you vote." cta="Settle it" />
                ),
              ];
            }
            return [row];
          })}
          <VotePrompt
            key="cta-end"
            text={
              agents
                ? "Agents have spoken. Do you agree? Cast your vote on the humans' chart."
                : songs.length > 1
                  ? "Disagree with this order? Two songs, pick the one that slaps."
                  : "Get voting."
            }
            cta="Vote"
          />
        </ol>
      )}
    </>
  );
}
