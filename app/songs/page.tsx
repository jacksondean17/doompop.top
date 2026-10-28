import type { Metadata } from "next";
import { formatCount } from "@/components/format";
import { catalogue, hasDb, SCENES, type CatalogueSort, type Scene, type Song, type SortDir } from "@/lib/db";
import type { Platform } from "@/lib/embed";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Every song — doompop.top",
  description: "The whole doom pop catalogue: every approved song, sortable by Elo, agent Elo, views, votes and date, and searchable.",
};

const PER_PAGE = 50;
const SORTS: [CatalogueSort, string][] = [
  ["rating", "Elo"],
  ["agent", "Agent Elo"],
  ["views", "Views"],
  ["games", "Votes"],
  ["winpct", "Win %"],
  ["new", "Newest"],
  ["title", "A–Z"],
];
const SHORT: Record<Platform, string> = { x: "X", youtube: "YT", tiktok: "TikTok", suno: "Suno", soundcloud: "SC", spotify: "Spotify", link: "Link" };

type Params = { sort: CatalogueSort; dir: SortDir; q: string; scene: string; page: number };
type RawParams = Record<string, string | string[] | undefined>;

const defaultDir = (sort: CatalogueSort): SortDir => (sort === "title" ? "asc" : "desc");
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";

function parse(raw: RawParams): Params {
  const s = one(raw.sort);
  const sort = SORTS.some(([k]) => k === s) ? (s as CatalogueSort) : "rating";
  const d = one(raw.dir);
  const scene = one(raw.scene);
  const page = parseInt(one(raw.page), 10);
  return {
    sort,
    dir: d === "asc" || d === "desc" ? d : defaultDir(sort),
    q: one(raw.q).slice(0, 80),
    scene: scene in SCENES ? scene : "",
    page: page > 0 ? page : 1,
  };
}

function href(p: Params, change: Partial<Params>): string {
  const n = { ...p, page: 1, ...change };
  const qs = new URLSearchParams();
  if (n.sort !== "rating") qs.set("sort", n.sort);
  if (n.dir !== defaultDir(n.sort)) qs.set("dir", n.dir);
  if (n.q) qs.set("q", n.q);
  if (n.scene) qs.set("scene", n.scene);
  if (n.page > 1) qs.set("page", String(n.page));
  const s = qs.toString();
  return s ? `/songs?${s}` : "/songs";
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

function Th({ p, sort, children, className }: { p: Params; sort: CatalogueSort; children: React.ReactNode; className?: string }) {
  const on = p.sort === sort;
  const dir = on ? (p.dir === "asc" ? "desc" : "asc") : defaultDir(sort);
  return (
    <th scope="col" className={className} aria-sort={on ? (p.dir === "asc" ? "ascending" : "descending") : undefined}>
      <a href={href(p, { sort, dir })} className={on ? "on" : undefined}>
        {children}
        <span className="cat-ind" aria-hidden="true">
          {on ? (p.dir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </a>
    </th>
  );
}

function pages(cur: number, last: number): (number | null)[] {
  const keep = [...new Set([1, cur - 1, cur, cur + 1, last])].filter((n) => n >= 1 && n <= last).sort((a, b) => a - b);
  const out: (number | null)[] = [];
  keep.forEach((n, i) => {
    const prev = keep[i - 1];
    if (prev && n - prev === 2) out.push(prev + 1);
    else if (prev && n - prev > 2) out.push(null);
    out.push(n);
  });
  return out;
}

const date = (s: Song) =>
  new Date(s.released_at ?? s.submitted_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default async function Songs({ searchParams }: { searchParams: Promise<RawParams> }) {
  const p = parse(await searchParams);
  let songs: Song[] = [];
  let total = 0;
  let error = false;
  if (hasDb) {
    try {
      const r = await catalogue({ sort: p.sort, dir: p.dir, q: p.q || undefined, scene: (p.scene || undefined) as Scene | undefined, page: p.page, perPage: PER_PAGE });
      [songs, total, p.page] = [r.songs, r.total, r.page];
    } catch (e) {
      console.error(e);
      error = true;
    }
  }
  const live = hasDb && !error;
  const filtered = Boolean(p.q || p.scene);
  const last = Math.max(1, Math.ceil(total / PER_PAGE));
  const from = (p.page - 1) * PER_PAGE;
  const scenes: [string, string][] = [["", "All"], ...Object.entries(SCENES)];
  const col = (k: CatalogueSort, base: string) => (p.sort === k ? `${base} on` : base);

  return (
    <>
      <section className="hero hero-songs">
        <p className="kicker">The whole back catalogue</p>
        <h1>
          Every <em>song</em>
        </h1>
        <p>
          The chart stops at 100. This doesn&apos;t. Every approved song, sortable by anything, with every version we&apos;ve
          found.
        </p>
      </section>

      {!hasDb && (
        <div className="notice">
          <span className="notice-big">Catalogue offline</span>
          No database is connected yet, so there are no songs to list.
        </div>
      )}
      {error && (
        <div className="notice">
          <span className="notice-big">Signal lost</span>
          The database didn&apos;t answer. <a href={href(p, { page: p.page })}>Try again</a> in a minute.
        </div>
      )}

      {live && (
        <section className="filters">
          <Chips label="Scene" items={scenes} active={p.scene} to={(scene) => href(p, { scene })} />
          <div className="cat-sort">
            <Chips label="Sort" items={SORTS} active={p.sort} to={(sort) => href(p, { sort: sort as CatalogueSort, dir: defaultDir(sort as CatalogueSort) })} />
            <a className="chip cat-dir" href={href(p, { dir: p.dir === "asc" ? "desc" : "asc" })} aria-label={`Reverse the order (now ${p.dir === "asc" ? "ascending" : "descending"})`}>
              {p.dir === "asc" ? "▲ Asc" : "▼ Desc"}
            </a>
          </div>
          <form className="search" action="/songs" method="get" role="search">
            {p.sort !== "rating" && <input type="hidden" name="sort" value={p.sort} />}
            {p.dir !== defaultDir(p.sort) && <input type="hidden" name="dir" value={p.dir} />}
            {p.scene && <input type="hidden" name="scene" value={p.scene} />}
            <input type="search" name="q" defaultValue={p.q} placeholder="Title, artist or handle" aria-label="Search songs" />
            <button className="btn ghost" type="submit">
              Find
            </button>
            {filtered && (
              <a className="reset" href={href(p, { q: "", scene: "" })}>
                Reset
              </a>
            )}
          </form>
          {total > 0 && (
            <p className="cat-count" aria-live="polite">
              Showing <b>{from + 1}–{from + songs.length}</b> of <b>{total.toLocaleString("en-US")}</b> {total === 1 ? "song" : "songs"}
              {p.q && <> matching &ldquo;{p.q}&rdquo;</>}
              {p.scene && <> in {SCENES[p.scene as Scene]}</>}
            </p>
          )}
        </section>
      )}

      {live && total === 0 &&
        (filtered ? (
          <div className="empty">
            <span className="empty-big">No signal</span>
            {p.q ? <>Nothing matches &ldquo;{p.q}&rdquo;{p.scene ? ` in ${SCENES[p.scene as Scene]}` : ""}.</> : "No songs in that scene yet."}{" "}
            <a href={href(p, { q: "", scene: "" })}>Show every song</a> or <a href="/submit">submit one</a>.
          </div>
        ) : (
          <div className="empty">
            <span className="empty-big">Dead air</span>
            No songs yet. <a href="/submit">Submit the first track</a>.
          </div>
        ))}

      {songs.length > 0 && (
        <table className="cat">
          <caption className="sr-only">
            Songs sorted by {SORTS.find(([k]) => k === p.sort)?.[1]}, {p.dir === "asc" ? "ascending" : "descending"}
          </caption>
          <thead>
            <tr>
              <th scope="col" className="c-rank">
                #
              </th>
              <Th p={p} sort="title" className="c-song">
                Song
              </Th>
              <th scope="col" className="c-on">
                On
              </th>
              <Th p={p} sort="rating">Elo</Th>
              <Th p={p} sort="agent">Agents</Th>
              <Th p={p} sort="games">W–L</Th>
              <Th p={p} sort="winpct">Win</Th>
              <Th p={p} sort="views">Views</Th>
              <Th p={p} sort="new">First out</Th>
              <th scope="col" className="c-ver">
                <abbr title="Versions">Ver.</abbr>
              </th>
            </tr>
          </thead>
          <tbody>
            {songs.map((s, i) => {
              const games = s.wins + s.losses;
              const agentGames = s.agent_wins + s.agent_losses;
              const platforms = [...new Set(s.videos.map((v) => SHORT[v.platform] ?? v.platform))];
              return (
                <tr key={s.id} className={s.scene ? `scene-${s.scene}` : undefined}>
                  <td className="c-rank">{from + i + 1}</td>
                  <th scope="row" className="c-song">
                    <a className="c-title" href={`/song/${s.id}`}>
                      {s.title}
                    </a>
                    {s.scene && s.scene !== "other" && <span className={`badge scene-${s.scene}`}>{SCENES[s.scene]}</span>}
                    {s.artist && <span className="c-artist">{s.artist}</span>}
                  </th>
                  <td className="c-on">{platforms.join(" · ") || "—"}</td>
                  <td className={col("rating", "c-elo")} data-l="Elo">
                    {Math.round(s.rating)}
                  </td>
                  <td className={col("agent", "c-agent")} data-l="AI" title={agentGames ? `${s.agent_wins}W–${s.agent_losses}L from agents` : "No agent votes yet"}>
                    {agentGames ? Math.round(s.agent_rating) : "—"}
                  </td>
                  <td className={col("games", "c-wl")}>
                    {s.wins}W–{s.losses}L
                  </td>
                  <td className={col("winpct", "c-pct")} data-l="Win">
                    {games ? `${Math.round((s.wins / games) * 100)}%` : "—"}
                  </td>
                  <td className={col("views", "c-views")} data-l="Views">
                    {s.views > 0 ? formatCount(s.views) : "—"}
                  </td>
                  <td className={col("new", "c-date")}>{date(s)}</td>
                  <td className="c-ver" data-l="Ver">
                    {s.videos.length}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {live && last > 1 && (
        <nav className="pager" aria-label="Pages">
          {p.page > 1 ? (
            <a className="chip" href={href(p, { page: p.page - 1 })} rel="prev">
              ← Prev
            </a>
          ) : (
            <span className="chip off">← Prev</span>
          )}
          {pages(p.page, last).map((n, i) =>
            n === null ? (
              <span key={`gap${i}`} className="pager-gap">
                …
              </span>
            ) : (
              <a
                key={n}
                href={href(p, { page: n })}
                className={`chip${n === p.page ? " on" : ""}`}
                aria-current={n === p.page ? "page" : undefined}
                aria-label={`Page ${n}`}
              >
                {n}
              </a>
            ),
          )}
          {p.page < last ? (
            <a className="chip" href={href(p, { page: p.page + 1 })} rel="next">
              Next →
            </a>
          ) : (
            <span className="chip off">Next →</span>
          )}
        </nav>
      )}
      <div className="an-end" />
    </>
  );
}
