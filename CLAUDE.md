# doompop.top

See README.md for what the site is and how it works, and AGENTS.md for Next.js version notes.

## How changes land: always through a pull request

Several people and Claude sessions work on this repo at once, and every push to `main` deploys to production.

- Never push to `main`. Work on a branch, push it, and open a pull request against `main`.
- A human merges pull requests. Don't merge your own unless the person you're working for tells you to.
- Start each branch from the latest `main` (`git fetch origin main`). If `main` moves while your PR is open, merge `main` into your branch; don't rebase or force-push a branch someone else may have pulled.
- Keep a PR to one change. Say in its description what it does, how you tested it, and anything a reviewer should check by hand.
- Vercel builds a preview deployment for every PR branch and links it on the PR. Check your change there before asking for review.
- Before pushing: `npx tsc --noEmit` and `npx next build` must pass.

## Things that bite

- The database schema migrates itself on first request (`ensureSchema` in `lib/db.ts`). New `ALTER TABLE` lines must come after the `CREATE TABLE` they alter, and must work on both a fresh database and production.
- `public/llms.txt`, `app/agents/page.tsx` and the agent API routes describe the same API; change them together.
- The site sends no referrer (X's video CDN rejects ours); YouTube iframes opt back in. Don't remove either.
