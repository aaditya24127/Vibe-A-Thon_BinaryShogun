# WeConnect

WeConnect coordinates perishable surplus (cooked food, short-life medical supplies, essential kits) and the riders who move it to night shelters and relief camps. It treats time, transport capacity, compatibility and rider reliability as live variables. It makes dispatch decisions the database can verify, detects riders who go silent, reroutes when a shelter closes or fills, and reports unresolved quantity with a reason instead of inventing a delivery.

## Routes

- `/` choose a role.
- `/donor` post a batch and see its status.
- `/rider` ranked reachable batches, claim, confirm pickup, mark in transit, confirm delivery with the quantity received, heartbeat, incident reports, map.
- `/shelter` set unmet demand, open or closed, resources and accepted categories, each with a reason. See incoming deliveries.
- `/operations` metrics, alerts, live map, RescueIQ recommendations, risk table, impact ledger, recent events, Chaos Lab.
- `/timeline` event log with filters.

## How decisions are made

The browser suggests and the database decides. The allocation engine in `src/lib/engine` previews plans. Every change goes through a Postgres function that re-checks capacity, custody, status, reservations and compatibility in one transaction. There are no external AI services; all rules are deterministic.

## Offline use

The first visit must be online. After that the app shell and the last synced data are available offline, the local engine runs, and the Chaos Lab runs against the local copy and labels results "Local, not yet synced". Rider and shelter actions are saved on the device first and replayed in order when the connection returns; the database ignores repeats and reports rejections.

Does not work offline: updates from other devices, server sweeps, custody decisions, street map tiles, fresh traffic data. Heartbeats are not queued while offline.

## Environment variables

Copy `.env.example` to `.env.local` and fill in both values from the Supabase project settings.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Database setup

1. Create a free Supabase project.
2. In the SQL editor run, in order: `supabase/migrations/0001_schema.sql`, `0002_rls.sql`, `0003_functions.sql`, `0004_schedule.sql`, `0005_seed.sql`.
3. In Database, Replication, confirm the tables `leases`, `allocations`, `batches`, `shelters`, `riders`, `events`, `unresolved` and `incidents` are in the `supabase_realtime` publication.
4. Optionally enable the `pg_cron` extension. If it is not available, every open client runs the sweep every 30 seconds.

To regenerate the seed file after editing `src/lib/seed.ts`: `npm run gen:seed`. The in-app "Reset simulation" calls the database function that restores this seed.

## Run locally

```bash
npm install
npm run dev
```

Production build, which is required to check the service worker:

```bash
npm run build
npm run start
```

## Tests

```bash
npm test
```

The database tests run the real migrations in an in-memory Postgres and cover the judge scenarios. The engine tests cover allocation, rerouting, sweep decisions and local mode.

## Deploy to Vercel

1. Push the repository to GitHub.
2. Import it in Vercel. The framework is Next.js. The build command is `npm run build`.
3. Add the two environment variables.
4. Deploy, then open the site once online so the service worker and local copy are created.

Vercel Hobby is for non-commercial use. A Supabase free project pauses after a period of inactivity.
