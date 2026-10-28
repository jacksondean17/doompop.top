import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SongPlayer from "@/components/SongPlayer";
import ShareButton from "@/components/ShareButton";
import { ago, day, formatCount, PLATFORM_LABEL } from "@/components/format";
import { hasDb, SCENES, songHistory, songOpponents, type Opponent, type Song, type SongVote } from "@/lib/db";
import { getRank, getSong, parseId } from "./data";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

const pct = (w: number, l: number) => (w + l ? `${Math.round((w / (w + l)) * 100)}%` : "–");
const signed = (n: number, digits = 0) => `${n < 0 ? "−" : "+"}${Math.abs(n).toFixed(digits)}`;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = parseId((await params).id);
  if (!id || !hasDb) return { title: "Song — doompop.top" };
  try {
    const [song, rank] = await Promise.all([getSong(id), getRank(id, "human")]);
    if (!song) return { title: "Song not found — doompop.top" };
    const by = song.artist ? ` by ${song.artist}` : "";
    return {
      title: `${song.title} — doompop.top`,
      description: `${song.title}${by}: #${rank?.rank ?? "?"} on the Doom 100 with ${Math.round(song.rating)} Elo (${song.wins}W–${song.losses}L). Play every version and see who it beats.`,
    };
  } catch {
    return { title: "Song — doompop.top" };
  }
}

type Pt = { t: number; r: number; v?: SongVote };

// Walks back from today's rating through the logged deltas; the last point is today's rating.
function rebuild(now: number, votes: SongVote[], from: number): Pt[] {
  const pts: Pt[] = [];
  let r = now;
  for (let i = votes.length - 1; i >= 0; i--) {
    const v = votes[i];
    pts.push({ t: new Date(v.created_at).getTime(), r, v });
    r -= v.won ? v.delta : -v.delta;
  }
  pts.push({ t: from, r });
  return pts.reverse();
}

function niceStep(span: number): number {
  for (const s of [10, 25, 50, 100, 200]) if (span / s <= 6) return s;
  return 500;
}

type Series = { kind: "human" | "agent"; pts: Pt[] };

// Drawn twice, wide and narrow, so text stays legible on phones without stretching.
function EloChart({ series, t0, t1, narrow }: { series: Series[]; t0: number; t1: number; narrow?: boolean }) {
  const [W, H, L, R, T, B] = narrow ? [480, 330, 62, 14, 30, 42] : [960, 340, 84, 20, 30, 46];
  const all = series.flatMap((s) => s.pts.map((p) => p.r));
  const step = niceStep(Math.max(...all) - Math.min(...all));
  const y0 = Math.floor((Math.min(...all) - step / 3) / step) * step;
  const y1 = Math.ceil((Math.max(...all) + step / 3) / step) * step;
  const end = Math.max(t1, t0 + 864e5);
  const sx = (t: number) => L + ((t - t0) / (end - t0)) * (W - L - R);
  const sy = (r: number) => H - B - ((r - y0) / (y1 - y0)) * (H - T - B);
  const yt: number[] = [];
  for (let y = y0; y <= y1; y += step) yt.push(y);
  const xt = [0, 1 / 3, 2 / 3, 1].map((f) => t0 + f * (end - t0));
  const dots = series.reduce((n, s) => n + s.pts.length, 0) <= 160;
  const human = series.find((s) => s.kind === "human");
  const first = human?.pts[0];
  const last = human?.pts[human.pts.length - 1];
  const label = (r: number) => (sy(r) - 14 < T ? sy(r) + 30 : sy(r) - 14);
  return (
    <svg
      className={`sg-chart ${narrow ? "sg-narrow" : "sg-wide"}`}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={series
        .map((s) => `${s.kind === "human" ? "Human" : "Agent"} Elo from ${Math.round(s.pts[0].r)} to ${Math.round(s.pts[s.pts.length - 1].r)} over ${s.pts.length - 1} votes`)
        .join("; ")}
      data-start={first?.r.toFixed(3)}
      data-end={last?.r.toFixed(3)}
    >
      {yt.map((y) => (
        <g key={y}>
          <line className="an-grid" x1={L} x2={W - R} y1={sy(y)} y2={sy(y)} />
          <text className="sg-tick" x={L - 8} y={sy(y) + 4} textAnchor="end">
            {y}
          </text>
        </g>
      ))}
      {y0 < 1500 && y1 > 1500 && <line className="sg-base" x1={L} x2={W - R} y1={sy(1500)} y2={sy(1500)} />}
      {xt.map((t, i) => (
        <text key={i} className="sg-tick" x={sx(t)} y={H - B + 28} textAnchor={i === 0 ? "start" : i === 3 ? "end" : "middle"}>
          {new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}
        </text>
      ))}
      {series.map((s) => {
        const d = s.pts.map((p, i) => (i ? `H${sx(p.t).toFixed(1)}V${sy(p.r).toFixed(1)}` : `M${sx(p.t).toFixed(1)} ${sy(p.r).toFixed(1)}`)).join("") + `H${sx(end).toFixed(1)}`;
        return (
          <g key={s.kind} className={`sg-line sg-line-${s.kind}`}>
            <path d={d} />
            {dots &&
              s.pts.slice(1).map((p) => (
                <circle key={p.v!.id} cx={sx(p.t)} cy={sy(p.r)} r={3}>
                  <title>{`${p.v!.won ? "Beat" : "Lost to"} ${p.v!.opponent}, ${signed(p.v!.won ? p.v!.delta : -p.v!.delta, 1)} → ${Math.round(p.r)} (${day(p.v!.created_at)})`}</title>
                </circle>
              ))}
          </g>
        );
      })}
      {first && last && (
        <>
          <circle className="sg-start" cx={sx(first.t)} cy={sy(first.r)} r={6} />
          <text className="sg-mark" x={sx(first.t) + 12} y={label(first.r)}>
            start {Math.round(first.r)}
          </text>
          <circle className="sg-now" cx={sx(end)} cy={sy(last.r)} r={5} />
          <text className="sg-mark sg-mark-now" x={sx(end) - 12} y={label(last.r)} textAnchor="end">
            now {Math.round(last.r)}
          </text>
        </>
      )}
    </svg>
  );
}

function Versions({ song }: { song: Song }) {
  return (
    <ul className="sg-versions">
      {song.videos.map((v) => (
        <li key={v.id}>
          <span className="sg-v-who">
            <b>{PLATFORM_LABEL[v.platform] ?? v.platform}</b>
            {v.artist && <span>{v.artist}</span>}
          </span>
          <span className="sg-v-nums">
            {v.views != null && <span>{formatCount(v.views)} views</span>}
            {v.likes != null && <span>{formatCount(v.likes)} likes</span>}
            {v.posted_at && <span>{day(v.posted_at)}</span>}
          </span>
          <a className="sg-v-out" href={v.url} target="_blank" rel="noreferrer">
            Original ↗
          </a>
        </li>
      ))}
    </ul>
  );
}

function SongLink({ id, title, live }: { id: number; title: string; live: boolean }) {
  return live ? <a href={`/song/${id}`}>{title}</a> : <>{title}</>;
}

function Record({ w, l }: { w: number; l: number }) {
  if (!w && !l) return <span className="sg-rec none">–</span>;
  return (
    <span className={`sg-rec${w > l ? " up" : w < l ? " down" : ""}`}>
      {w}–{l}
    </span>
  );
}

function Opponents({ list, agents }: { list: Opponent[]; agents: boolean }) {
  return (
    <div className="sg-opp-wrap">
      <table className="sg-opp">
        <thead>
          <tr>
            <th scope="col">Opponent</th>
            <th scope="col">Humans</th>
            {agents && <th scope="col">Agents</th>}
            <th scope="col">Met</th>
          </tr>
        </thead>
        <tbody>
          {list.map((o) => (
            <tr key={o.id}>
              <th scope="row">
                <span className="ag-title">
                  <SongLink id={o.id} title={o.title} live={o.live} />
                </span>
                {o.artist && <span className="ag-artist">{o.artist}</span>}
              </th>
              <td>
                <Record w={o.hw} l={o.hl} />
              </td>
              {agents && (
                <td>
                  <Record w={o.aw} l={o.al} />
                </td>
              )}
              <td className="sg-met">{o.hw + o.hl + o.aw + o.al}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Recent({ votes }: { votes: SongVote[] }) {
  return (
    <ol className="sg-recent">
      {votes.map((v) => (
        <li key={v.id} className={v.won ? "won" : "lost"}>
          <p className="sg-r-line">
            <span className="sg-r-verb">{v.won ? "Beat" : "Lost to"}</span>{" "}
            <span className="ag-title">
              <SongLink id={v.opponent_id} title={v.opponent} live={v.opponent_live} />
            </span>
          </p>
          <span className={`sg-r-delta${v.won ? "" : " neg"}`}>{signed(v.won ? v.delta : -v.delta, 1)}</span>
          <p className="sg-r-meta">
            {v.kind === "agent" ? (
              <>
                <span className="sg-ai">[AI]</span> {v.agent ?? "an agent"} ·{" "}
              </>
            ) : (
              "human vote · "
            )}
            <time dateTime={new Date(v.created_at).toISOString()}>{ago(v.created_at)}</time>
          </p>
          {v.reason && <blockquote className="ag-reason">&ldquo;{v.reason}&rdquo;</blockquote>}
        </li>
      ))}
    </ol>
  );
}

export default async function SongPage({ params }: Props) {
  const id = parseId((await params).id);
  if (!id) notFound();
  if (!hasDb)
    return (
      <div className="notice">
        <span className="notice-big">Chart offline</span>
        No database is connected, so there is no song to show yet.
      </div>
    );

  let data;
  try {
    const song = await getSong(id);
    if (song) {
      const [human, agent, hRank, aRank, opponents] = await Promise.all([
        songHistory(id, "human"),
        songHistory(id, "agent"),
        getRank(id, "human"),
        getRank(id, "agent"),
        songOpponents(id),
      ]);
      data = { song, human, agent, hRank, aRank, opponents };
    }
  } catch (e) {
    console.error(e);
    return (
      <div className="notice">
        <span className="notice-big">Signal lost</span>
        This song didn&apos;t load from the database. <a href={`/song/${id}`}>Try again</a> in a minute.
      </div>
    );
  }
  if (!data) notFound();

  const { song, human, agent, hRank, aRank, opponents } = data;
  const hasAgent = song.agent_wins + song.agent_losses > 0;
  const games = song.wins + song.losses;
  const earned = song.rating - song.prior - 1500;
  const now = Date.now();
  const firstVote = [human[0], agent[0]].filter(Boolean).map((v) => new Date(v.created_at).getTime());
  const from = Math.min(new Date(song.submitted_at).getTime(), ...firstVote);
  const series: Series[] = [{ kind: "human", pts: rebuild(song.rating, human, from) }];
  if (agent.length) series.push({ kind: "agent", pts: rebuild(song.agent_rating, agent, from) });
  const drift = series[0].pts[0].r - (1500 + song.prior);
  const recent = [...human, ...agent]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime() || b.id - a.id)
    .slice(0, 10);
  const shareText = `${song.title}${song.artist ? ` by ${song.artist}` : ""}: #${hRank?.rank ?? "?"} on the Doom 100`;

  return (
    <>
      <section className={`hero sg-hero${song.scene ? ` scene-${song.scene}` : ""}`}>
        <p className="kicker">On the Doom 100</p>
        <h1>{song.title}</h1>
        <p className="sg-by">
          {song.artist && <span className="sg-artist">{song.artist}</span>}
          {song.scene && <span className={`badge scene-${song.scene}`}>{SCENES[song.scene]}</span>}
        </p>
        <div className="sg-ranks">
          {hRank && (
            <a className="sg-rank" href="/">
              <b>#{hRank.rank}</b> on the chart
            </a>
          )}
          {hasAgent && aRank && (
            <a className="sg-rank sg-rank-agent" href="/?by=agent">
              <b>#{aRank.rank}</b> with agents
            </a>
          )}
        </div>
        <div className="hero-cta">
          <a className="btn big" href="/vote">
            Vote on it ▶
          </a>
          <ShareButton title={`${song.title} — doompop.top`} text={shareText} />
        </div>
      </section>

      <div className="sg-main">
        <section className="sg-play" aria-label="Play">
          {song.videos.length ? (
            <SongPlayer videos={song.videos} />
          ) : (
            <div className="empty an-small">No playable version yet.</div>
          )}
          <h2 className="sg-sub">
            {song.videos.length} {song.videos.length === 1 ? "version" : "versions"}
          </h2>
          <Versions song={song} />
        </section>

        <aside className="sg-stats" aria-label="Current stats">
          <dl>
            <div className="sg-stat sg-hot">
              <dt>Human Elo</dt>
              <dd>{Math.round(song.rating)}</dd>
              <span>
                head start {signed(song.prior)} · earned {signed(earned)}
              </span>
            </div>
            <div className="sg-stat">
              <dt>Record</dt>
              <dd>
                {song.wins}W–{song.losses}L
              </dd>
              <span>{games ? `${pct(song.wins, song.losses)} win rate` : "no votes yet"}</span>
            </div>
            <div className="sg-stat sg-agent">
              <dt>
                <span className="sg-ai">[AI]</span> Agent Elo
              </dt>
              <dd>{hasAgent ? Math.round(song.agent_rating) : "–"}</dd>
              <span>{hasAgent ? `${song.agent_wins}W–${song.agent_losses}L · ${pct(song.agent_wins, song.agent_losses)}` : "no agent votes yet"}</span>
            </div>
            <div className="sg-stat">
              <dt>Reach</dt>
              <dd>{formatCount(song.views)}</dd>
              <span>views · {formatCount(song.likes)} likes</span>
            </div>
            <div className="sg-stat">
              <dt>Released</dt>
              <dd className="sg-date">{song.released_at ? day(song.released_at) : "unknown"}</dd>
            </div>
            <div className="sg-stat">
              <dt>Last 7 days</dt>
              <dd>{song.recent_votes ?? 0}</dd>
              <span>{song.recent_votes === 1 ? "vote" : "votes"}</span>
            </div>
          </dl>
        </aside>
      </div>

      <section className="ag-section" aria-labelledby="sg-elo">
        <div className="ag-head">
          <h2 id="sg-elo">
            Elo <span>over</span> time
          </h2>
          <p>Its rating after every vote{agent.length ? ", from humans and from agents" : ""}.</p>
        </div>
        {human.length + agent.length === 0 ? (
          <div className="empty an-small">
            <span className="empty-big">Untested</span>
            Nobody has voted on it yet, so it sits on its head start of {Math.round(song.rating)}.{" "}
            <a href="/vote">Go vote</a>.
          </div>
        ) : (
          <figure className="sg-fig">
            <EloChart series={series} t0={from} t1={now} />
            <EloChart series={series} t0={from} t1={now} narrow />
            <figcaption>
              <ul className="an-key">
                <li>
                  <i className="an-sw an-sw-win" /> humans ({human.length} {human.length === 1 ? "vote" : "votes"})
                </li>
                {agent.length > 0 && (
                  <li>
                    <i className="an-sw an-sw-agent" /> agents ({agent.length})
                  </li>
                )}
                <li>
                  <i className="sg-sw-start" /> starting point
                </li>
              </ul>
              <p className="sg-note">
                Approximate: rebuilt backwards from today&apos;s rating using each vote&apos;s logged change. Shifts in the
                head start when view counts refresh aren&apos;t logged
                {Math.abs(drift) >= 0.5
                  ? `, and add up to ${signed(-drift)} here, so the line starts at ${Math.round(series[0].pts[0].r)} rather than at its head start of ${Math.round(1500 + song.prior)}.`
                  : ", so the line can be off by however much its views have moved."}
              </p>
            </figcaption>
          </figure>
        )}
      </section>

      <div className="an-cols">
        <section className="ag-section" aria-labelledby="sg-h2h">
          <div className="ag-head">
            <h2 id="sg-h2h">
              Head <span>to</span> head
            </h2>
            <p>Everyone it has met, most games first.</p>
          </div>
          {opponents.length ? (
            <Opponents list={opponents} agents={hasAgent} />
          ) : (
            <div className="empty an-small">
              <span className="empty-big">No rivals yet</span>
              It hasn&apos;t met anyone.
            </div>
          )}
        </section>

        <section className="ag-section" aria-labelledby="sg-recent">
          <div className="ag-head">
            <h2 id="sg-recent">
              Recent <span>votes</span>
            </h2>
            <p>The last {recent.length || ""} times it was judged.</p>
          </div>
          {recent.length ? (
            <Recent votes={recent} />
          ) : (
            <div className="empty an-small">
              <span className="empty-big">Silence</span>
              No votes yet. <a href="/vote">Cast the first</a>.
            </div>
          )}
        </section>
      </div>
      <div className="an-end" />
    </>
  );
}
