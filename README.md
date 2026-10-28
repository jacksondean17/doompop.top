# doompop.top

The Doom 100: AI-made songs about AI doom, ranked by Elo through head-to-head votes.

- `/`: the chart, filterable by sort (rating, views, hot this week, newest), time window, scene, and search
- `/vote`: two songs, pick the one that slaps (Elo, K=32, start 1500)
- `/submit`: anyone can submit a link (X, YouTube, Suno, SoundCloud, Spotify, TikTok, or any URL)
- `/admin`: approve or reject submissions, fix titles, set scenes, and merge a new video of an existing song into that song (needs the admin key)

## Songs, videos and the head start

The chart ranks **songs**. A song can have several videos (remakes, fan versions); its card shows them all, most-viewed first, and votes count for the song.

Each song starts with a head start from its total views across those videos: 10k views is neutral, 1M is +120 Elo, 10M is +180 (capped at -120 and +200). Votes move the rating from there. When view counts change, the rating moves by the change in head start, so earned votes are never lost. Matchups also lean toward high-reach and less-played songs, so a first-time voter meets the big songs first. The formula is `priorFor()` in `lib/db.ts`.

The bot refreshes X view and like counts about once a day.

## Running it

Next.js on Vercel plus any Postgres. The app creates its own tables on first request, so there are no migrations to run.

| Env var | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` (or `POSTGRES_URL`) | yes | Set automatically when a Neon database is connected in Vercel → Storage |
| `ADMIN_KEY_HASH` | no | sha256 hex of the admin key; overrides the hash baked into `lib/security.ts` |
| `SIGNING_SECRET` | no | HMAC secret for vote tokens; derived from the DB URL by default |

Without a database the site still deploys and shows "chart offline".

Local:

```bash
DATABASE_URL=postgres://user:pw@localhost:5432/doompop npm run dev
```

## Vote integrity

Each matchup carries an HMAC-signed, single-use token, so a vote only counts for a pair the server actually served. Votes are also rate-limited per hashed IP (30 a minute, 1000 a day). That's enough for a group chat, not for a determined attacker.

## The bot

`/api/ingest` searches X (through [twitterapi.io](https://twitterapi.io), about $0.15 per 1k tweets) and YouTube (Data API, free) for new doom pop and drops what it finds into the `/admin` queue as `bot` submissions. Nothing reaches the chart until it's approved.

- Each source runs only when its key is set in Vercel: `TWITTERAPI_IO_KEY`, `YOUTUBE_API_KEY`
- A GitHub Action calls it hourly, with a daily Vercel cron as backup. The database throttles runs to one per 50 minutes, so the public endpoint can't be abused into spending API credit.
- Search queries live at the top of `lib/ingest.ts`
