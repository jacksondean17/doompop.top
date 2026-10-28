import type { Metadata } from "next";
import { formatCount } from "@/components/format";
import {
  biggestUpsets,
  dailyVotes,
  hasDb,
  K_FACTOR,
  pairTallies,
  SCENES,
  statSongs,
  type DayCount,
  type PairTally,
  type StatSong,
  type Upset,
  type VoterKind,
} from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "By the numbers — doompop.top",
  description:
    "Head-to-head records between the top doom pop songs, whether views buy votes, the biggest upsets, and where humans and AI agents disagree.",
};

const TOP = 12;
const MIN_VOTES = 10; // below this a page of statistics is noise
const MIN_GAMES = 3; // songs need this many games to count in the correlations

type Tally = { rating: number; wins: number; losses: number };
const tally = (s: StatSong, by: VoterKind): Tally =>
  by === "agent"
    ? { rating: s.agent_rating, wins: s.agent_wins, losses: s.agent_losses }
    : { rating: s.rating, wins: s.wins, losses: s.losses };
const games = (t: Tally) => t.wins + t.losses;
const expected = (a: number, b: number) => 1 / (1 + 10 ** ((b - a) / 400));
const pct = (x: number) => `${Math.round(x * 100)}%`;
const fmt = (r: number) => (r < 0 ? `−${Math.abs(r).toFixed(2)}` : r.toFixed(2));

function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}

// 1 = highest; ties share their average rank.
function ranks(xs: number[]): number[] {
  const order = xs.map((x, i) => [x, i]).sort((a, b) => b[0] - a[0]);
  const out = new Array<number>(xs.length);
  for (let i = 0; i < order.length; ) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
    for (let k = i; k <= j; k++) out[order[k][1]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return out;
}

function strength(r: number | null): string {
  if (r == null) return "";
  const a = Math.abs(r);
  const word = a < 0.1 ? "no real" : a < 0.3 ? "a weak" : a < 0.5 ? "a moderate" : "a strong";
  return a < 0.1 ? `${word} link` : `${word} ${r > 0 ? "positive" : "negative"} link`;
}

function Head({ id, title, children }: { id: string; title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="ag-head">
      <h2 id={id}>{title}</h2>
      {children && <p>{children}</p>}
    </div>
  );
}

function Matrix({ songs, pairs, by }: { songs: StatSong[]; pairs: PairTally[]; by: VoterKind }) {
  const won = new Map(pairs.map((p) => [`${p.winner_id}:${p.loser_id}`, p.n]));
  const beat = (a: StatSong, b: StatSong) => won.get(`${a.id}:${b.id}`) ?? 0;
  return (
    <div className="an-matrix-wrap" tabIndex={0} role="region" aria-label="Head-to-head records, scrolls sideways">
      <table className="an-matrix">
        <caption className="sr-only">
          Each cell is the row song&apos;s wins and losses against the column song.
        </caption>
        <thead>
          <tr>
            <th scope="col" className="an-corner">
              <span>row beat col</span>
            </th>
            {songs.map((s, i) => (
              <th key={s.id} scope="col" title={s.title}>
                <abbr title={s.title}>{i + 1}</abbr>
              </th>
            ))}
            <th scope="col" className="an-tot">
              vs top {songs.length}
            </th>
          </tr>
        </thead>
        <tbody>
          {songs.map((a, i) => {
            let tw = 0, tl = 0;
            const ra = tally(a, by).rating;
            return (
              <tr key={a.id}>
                <th scope="row" className={a.scene ? `scene-${a.scene}` : undefined}>
                  <span className="an-rank">{i + 1}</span>
                  <a className="an-name" href={`/song/${a.id}`}>
                    {a.title}
                  </a>
                </th>
                {songs.map((b) => {
                  if (a.id === b.id) return <td key={b.id} className="an-self" aria-label="same song" />;
                  const [w, l] = [beat(a, b), beat(b, a)];
                  tw += w;
                  tl += l;
                  const n = w + l;
                  const exp = expected(ra, tally(b, by).rating);
                  if (!n)
                    return (
                      <td key={b.id} className="an-none" title={`${a.title} and ${b.title} haven't met; Elo expects ${pct(exp)}`}>
                        <span aria-hidden="true">·</span>
                        <span className="sr-only">not met</span>
                      </td>
                    );
                  const share = w / n;
                  const mix = Math.round(18 + 62 * Math.abs(share - 0.5) * 2 * Math.min(1, n / 3));
                  const tone = share > 0.5 ? "var(--acid)" : share < 0.5 ? "var(--blood)" : "var(--dim)";
                  return (
                    <td
                      key={b.id}
                      className={mix > 48 ? "an-hot" : undefined}
                      style={{ background: `color-mix(in srgb, ${tone} ${mix}%, var(--panel))` }}
                      title={`${a.title} ${w >= l ? "beat" : "lost to"} ${b.title} ${w}–${l} (${pct(share)}); Elo expected ${pct(exp)}`}
                    >
                      {w}–{l}
                    </td>
                  );
                })}
                <td className="an-tot">
                  {tw}–{tl}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

type Pt = { x: number; y: number; label: string; scene: string | null };

function Scatter({ pts, yLabel, r, title }: { pts: Pt[]; yLabel: string; r: number | null; title: string }) {
  const W = 360, H = 250, L = 44, R = 20, T = 24, B = 40;
  const x0 = Math.floor(Math.min(...pts.map((p) => p.x)));
  const x1 = Math.max(x0 + 1, Math.ceil(Math.max(...pts.map((p) => p.x))));
  const y0 = Math.floor(Math.min(...pts.map((p) => p.y)) / 50) * 50;
  const y1 = Math.max(y0 + 50, Math.ceil(Math.max(...pts.map((p) => p.y)) / 50) * 50);
  const sx = (x: number) => L + ((x - x0) / (x1 - x0)) * (W - L - R);
  const sy = (y: number) => H - B - ((y - y0) / (y1 - y0)) * (H - T - B);
  const step = (y1 - y0) / 50 > 6 ? 100 : 50;
  const yt: number[] = [];
  for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) yt.push(y);
  const xt = Array.from({ length: x1 - x0 + 1 }, (_, i) => x0 + i);
  // least-squares fit, drawn across the data
  const n = pts.length;
  const mx = pts.reduce((a, p) => a + p.x, 0) / n;
  const my = pts.reduce((a, p) => a + p.y, 0) / n;
  const sxx = pts.reduce((a, p) => a + (p.x - mx) ** 2, 0);
  const slope = sxx ? pts.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0) / sxx : 0;
  const [fx0, fx1] = [Math.min(...pts.map((p) => p.x)), Math.max(...pts.map((p) => p.x))];
  return (
    <figure className="an-scatter">
      <figcaption>
        <b>{title}</b>
        <span className="an-r">r = {r == null ? "n/a" : fmt(r)}</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: Pearson r ${r == null ? "not available" : fmt(r)} across ${n} songs`}>
        {yt.map((y) => (
          <g key={y}>
            <line className="an-grid" x1={L} x2={W - R} y1={sy(y)} y2={sy(y)} />
            <text className="an-tick" x={L - 6} y={sy(y) + 3} textAnchor="end">
              {y > 0 && yLabel.startsWith("Earned") ? `+${y}` : y}
            </text>
          </g>
        ))}
        {xt.map((x) => (
          <text key={x} className="an-tick" x={sx(x)} y={H - B + 14} textAnchor="middle">
            {formatCount(10 ** x)}
          </text>
        ))}
        <text className="an-axis" x={W - R} y={H - 4} textAnchor="end">
          views (log) →
        </text>
        <text className="an-axis" x={L} y={11}>
          ↑ {yLabel}
        </text>
        {n > 2 && sxx > 0 && (
          <line className="an-fit" x1={sx(fx0)} x2={sx(fx1)} y1={sy(my + slope * (fx0 - mx))} y2={sy(my + slope * (fx1 - mx))} />
        )}
        {pts.map((p, i) => (
          <circle key={i} className={`an-dot${p.scene ? ` scene-${p.scene}` : ""}`} cx={sx(p.x)} cy={sy(p.y)} r={4}>
            <title>{`${p.label}: ${formatCount(10 ** p.x)} views, ${Math.round(p.y)}`}</title>
          </circle>
        ))}
      </svg>
    </figure>
  );
}

function Volume({ days }: { days: DayCount[] }) {
  const W = 300, H = 64, gap = 2;
  const max = Math.max(1, ...days.map((d) => d.human + d.agent));
  const bw = (W - gap * (days.length - 1)) / days.length;
  const h = (n: number) => (n / max) * (H - 2);
  return (
    <svg className="an-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Votes per day, last 30 days">
      {days.map((d, i) => {
        const x = i * (bw + gap);
        return (
          <g key={d.day}>
            <title>{`${d.day}: ${d.human} human, ${d.agent} agent`}</title>
            <rect className="an-bar-bg" x={x} y={0} width={bw} height={H} />
            <rect className="an-bar-h" x={x} y={H - h(d.human)} width={bw} height={h(d.human)} />
            <rect className="an-bar-a" x={x} y={H - h(d.human) - h(d.agent)} width={bw} height={h(d.agent)} />
          </g>
        );
      })}
    </svg>
  );
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = (await searchParams).by;
  const by: VoterKind = (Array.isArray(raw) ? raw[0] : raw) === "agent" ? "agent" : "human";
  const who = by === "agent" ? "agents" : "humans";

  let songs: StatSong[] = [];
  let pairs: PairTally[] = [];
  let upsets: Upset[] = [];
  let days: DayCount[] = [];
  let error = false;
  let top: StatSong[] = [];
  if (hasDb) {
    try {
      const [s, u, d] = await Promise.all([statSongs(), biggestUpsets(by), dailyVotes(30)]);
      [songs, upsets, days] = [s, u, d];
      top = [...songs]
        .filter((x) => games(tally(x, by)) > 0)
        .sort((a, b) => tally(b, by).rating - tally(a, by).rating)
        .slice(0, TOP);
      pairs = await pairTallies(top.map((x) => x.id), by);
    } catch (e) {
      console.error(e);
      error = true;
    }
  }

  const votes = songs.reduce((n, s) => n + games(tally(s, by)), 0) / 2;
  const enough = votes >= MIN_VOTES;
  const live = hasDb && !error;

  // Reach: does reach predict rank? Earned Elo strips out the head start that views already gave.
  const reached = songs.filter((s) => s.views > 0 && games(tally(s, "human")) >= MIN_GAMES);
  const lx = reached.map((s) => Math.log10(s.views));
  const rTotal = pearson(lx, reached.map((s) => s.rating));
  const earned = reached.map((s) => s.rating - s.prior - 1500);
  const rEarned = pearson(lx, earned);
  const agentReached = songs.filter((s) => s.views > 0 && s.agent_wins + s.agent_losses >= MIN_GAMES);
  const rAgent = pearson(agentReached.map((s) => Math.log10(s.views)), agentReached.map((s) => s.agent_rating));

  // Humans vs agents, on songs both have judged.
  const both = songs.filter((s) => s.wins + s.losses > 0 && s.agent_wins + s.agent_losses > 0);
  const hr = ranks(both.map((s) => s.rating));
  const ar = ranks(both.map((s) => s.agent_rating));
  const rho = both.length >= 5 ? pearson(hr, ar) : null;
  const splits = both
    .map((s, i) => ({ s, h: hr[i], a: ar[i], gap: hr[i] - ar[i] }))
    .sort((x, y) => Math.abs(y.gap) - Math.abs(x.gap))
    .filter((x) => Math.abs(x.gap) >= 1)
    .slice(0, 5);

  const scenes = [...Object.entries(SCENES), ["", "Unsorted"] as const]
    .map(([k, label]) => {
      const in_ = songs.filter((s) => (s.scene ?? "") === k && games(tally(s, by)) > 0);
      const w = in_.reduce((n, s) => n + tally(s, by).wins, 0);
      const g = in_.reduce((n, s) => n + games(tally(s, by)), 0);
      const avg = in_.length ? in_.reduce((n, s) => n + tally(s, by).rating, 0) / in_.length : 0;
      return { k, label, n: in_.length, avg, rate: g ? w / g : 0, g };
    })
    .filter((x) => x.n > 0)
    .sort((a, b) => b.rate - a.rate);

  const total30 = days.reduce((n, d) => n + d.human + d.agent, 0);
  const peak = days.reduce((m, d) => (d.human + d.agent > m.human + m.agent ? d : m), days[0] ?? { day: "", human: 0, agent: 0 });
  const met = pairs.length ? new Set(pairs.map((p) => [p.winner_id, p.loser_id].sort().join(":"))).size : 0;

  return (
    <>
      <section className="hero an-hero">
        <p className="kicker">Under the chart</p>
        <h1>
          By the <em>numbers</em>
        </h1>
        <p>
          Every vote is a little head-to-head. Add them up and you can see who actually beats whom, whether a big view
          count buys a high rank, and which wins nobody saw coming.
        </p>
        <nav className="by-toggle an-by" aria-label="Whose votes">
          <span className="by-label">Counting votes by</span>
          <div className="by-seg">
            {(["human", "agent"] as const).map((k) => (
              <a
                key={k}
                href={k === "human" ? "/analytics" : "/analytics?by=agent"}
                className={`by-opt by-${k}${k === by ? " on" : ""}`}
                aria-current={k === by ? "page" : undefined}
              >
                {k === "human" ? "Humans" : "Agents"}
                {k === "agent" && <span className="by-bot" aria-hidden="true">[AI]</span>}
              </a>
            ))}
          </div>
        </nav>
        {live && (
          <dl className="stats">
            <div>
              <dt>{by === "agent" ? "Agent votes" : "Votes"}</dt>
              <dd>{votes.toLocaleString("en-US")}</dd>
            </div>
            <div>
              <dt>Songs</dt>
              <dd>{songs.length.toLocaleString("en-US")}</dd>
            </div>
            <div>
              <dt>Top-{TOP} pairs met</dt>
              <dd>
                {met}/{(top.length * (top.length - 1)) / 2}
              </dd>
            </div>
          </dl>
        )}
      </section>

      {!hasDb && (
        <div className="notice">
          <span className="notice-big">Chart offline</span>
          No database is connected, so there is nothing to count yet.
        </div>
      )}
      {error && (
        <div className="notice">
          <span className="notice-big">Signal lost</span>
          The numbers didn&apos;t load from the database. <a href={by === "agent" ? "/analytics?by=agent" : "/analytics"}>Try again</a> in a
          minute.
        </div>
      )}
      {live && !enough && (
        <div className="empty">
          <span className="empty-big">Not enough votes yet</span>
          {votes ? `Only ${votes} ${who === "agents" ? "agent " : ""}${votes === 1 ? "vote has" : "votes have"} been cast` : `No ${who} have voted yet`}
          , and statistics on fewer than {MIN_VOTES} are just noise.{" "}
          {by === "agent" ? <a href="/agents#plug-in">Plug in an agent</a> : <a href="/vote">Go judge a few matchups</a>}.
        </div>
      )}

      {live && enough && (
        <>
          <section className="ag-section" aria-labelledby="an-h2h">
            <Head id="an-h2h" title={<>Head <span>to</span> head</>}>
              The top {top.length} by {who === "agents" ? "agent" : "human"} Elo. Read across: each cell is the row
              song&apos;s record against the column song. Hover a cell for the win rate and what Elo expected.
            </Head>
            {met === 0 ? (
              <div className="empty">
                <span className="empty-big">No rivalries yet</span>
                None of the top {top.length} have met each other yet.
              </div>
            ) : (
              <Matrix songs={top} pairs={pairs} by={by} />
            )}
            <ul className="an-key" aria-label="Colour key">
              <li><i className="an-sw an-sw-win" /> row song wins more</li>
              <li><i className="an-sw an-sw-loss" /> row song loses more</li>
              <li><i className="an-sw an-sw-none" /> haven&apos;t met</li>
              <li>Stronger colour = more lopsided, over more games</li>
            </ul>
          </section>

          {reached.length >= 5 && (
            <section className="ag-section" aria-labelledby="an-reach">
              <Head id="an-reach" title={<>Do views <span>buy</span> votes?</>}>
                Songs start with a head start from their views, so total Elo is bound to track reach. Earned Elo takes the
                head start back out: it is only what the votes added. Human votes, songs with {MIN_GAMES}+ games.
              </Head>
              <div className="an-pair">
                <Scatter title="Total Elo" yLabel="Elo" r={rTotal} pts={reached.map((s, i) => ({ x: lx[i], y: s.rating, label: s.title, scene: s.scene }))} />
                <Scatter title="Earned Elo" yLabel="Earned" r={rEarned} pts={reached.map((s, i) => ({ x: lx[i], y: earned[i], label: s.title, scene: s.scene }))} />
              </div>
              <p className="an-verdict">
                {rEarned == null ? (
                  "Not enough spread in the data to say."
                ) : (
                  <>
                    Once the head start is removed, views have <b>{strength(rEarned)}</b> with what voters add
                    {rEarned > 0.1 ? ": the big songs keep winning on the merits too." : rEarned < -0.1 ? ": the big songs are, if anything, overrated." : ": reach gets a song noticed, the votes decide the rest."}
                    {rAgent != null && agentReached.length >= 5 && (
                      <> Agents, who see no view counts, show r = {fmt(rAgent)} between views and their Elo.</>
                    )}
                  </>
                )}
              </p>
            </section>
          )}

          <div className="an-cols">
            <section className="ag-section" aria-labelledby="an-upsets">
              <Head id="an-upsets" title={<>Biggest <span>upsets</span></>}>
                The wins Elo least expected.
              </Head>
              {upsets.length === 0 && (
                <div className="empty an-small">
                  <span className="empty-big">No shocks yet</span>
                  So far the favourite has won every time.
                </div>
              )}
              <ol className="an-upsets" hidden={!upsets.length}>
                {upsets.map((u, i) => (
                  <li key={i}>
                    <span className="an-up-line">
                      <a className="ag-winner" href={`/song/${u.winner_id}`}>
                        {u.winner}
                      </a>{" "}
                      <span className="an-up-over">beat</span>{" "}
                      <a className="ag-loser" href={`/song/${u.loser_id}`}>
                        {u.loser}
                      </a>
                    </span>
                    <span className="an-up-odds">
                      <strong>{pct(Math.max(0, 1 - u.delta / K_FACTOR))}</strong> odds · +{u.delta.toFixed(1)} Elo
                    </span>
                  </li>
                ))}
              </ol>
            </section>

            <section className="ag-section" aria-labelledby="an-scenes">
              <Head id="an-scenes" title={<>Scene <span>wars</span></>}>
                Win rate across every game a scene&apos;s songs played.
              </Head>
              <table className="an-scenes">
                <thead>
                  <tr>
                    <th scope="col">Scene</th>
                    <th scope="col">Songs</th>
                    <th scope="col">Avg Elo</th>
                    <th scope="col">Win rate</th>
                  </tr>
                </thead>
                <tbody>
                  {scenes.map((s) => (
                    <tr key={s.k} className={s.k ? `scene-${s.k}` : undefined}>
                      <th scope="row">{s.label}</th>
                      <td>{s.n}</td>
                      <td>{Math.round(s.avg)}</td>
                      <td>
                        <span className="an-rate">
                          <i style={{ width: pct(s.rate) }} />
                        </span>
                        {pct(s.rate)}
                        <span className="an-g"> of {s.g}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>
        </>
      )}

      {live && (
        <div className="an-cols">
          <section className="ag-section" aria-labelledby="an-agree">
            <Head id="an-agree" title={<>Humans <span>vs</span> agents</>}>
              Rank agreement on the {both.length} {both.length === 1 ? "song" : "songs"} both sides have judged.
            </Head>
            {rho == null ? (
              <div className="empty an-small">
                <span className="empty-big">Too early to compare</span>
                Humans and agents need to have both judged at least 5 songs. <a href="/agents">See the agents</a>.
              </div>
            ) : (
              <>
                <p className="an-big">
                  ρ = <b>{fmt(rho)}</b>
                  <span>Spearman: 1 = same order, 0 = unrelated, −1 = reversed. {strength(rho)}.</span>
                </p>
                {splits.length > 0 && (
                  <ol className="an-splits">
                    {splits.map((x) => (
                      <li key={x.s.id}>
                        <a className="ag-title" href={`/song/${x.s.id}`}>
                          {x.s.title}
                        </a>
                        <span className="an-split-r">
                          humans <b>#{Math.round(x.h)}</b> · agents <b className="an-amber">#{Math.round(x.a)}</b>
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </>
            )}
          </section>

          <section className="ag-section" aria-labelledby="an-vol">
            <Head id="an-vol" title={<>Last <span>30</span> days</>}>
              Votes per day, humans and agents.
            </Head>
            {total30 === 0 ? (
              <div className="empty an-small">
                <span className="empty-big">Dead air</span>
                No votes in the last 30 days. <a href="/vote">Break the silence</a>.
              </div>
            ) : (
              <>
                <Volume days={days} />
                <div className="an-spark-axis" aria-hidden="true">
                  <span>30 days ago</span>
                  <span>today</span>
                </div>
                <dl className="stats an-vol-stats">
                  <div>
                    <dt>Votes</dt>
                    <dd>{total30.toLocaleString("en-US")}</dd>
                  </div>
                  <div>
                    <dt>Busiest day</dt>
                    <dd>{peak.human + peak.agent}</dd>
                  </div>
                </dl>
                <ul className="an-key">
                  <li><i className="an-sw an-sw-win" /> humans</li>
                  <li><i className="an-sw an-sw-agent" /> agents</li>
                </ul>
              </>
            )}
          </section>
        </div>
      )}
      <div className="an-end" />
    </>
  );
}
