# doompop.top

The Doom 100: AI-made songs about AI doom, ranked by Elo through head-to-head votes.

- `/`: the chart
- `/vote`: two songs, pick the one that slaps (Elo, K=32, start 1500)
- `/submit`: anyone can submit a link (X, YouTube, Suno, SoundCloud, Spotify, TikTok, or any URL)
- `/admin`: approve or reject submissions and fix titles (needs the admin key)

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
