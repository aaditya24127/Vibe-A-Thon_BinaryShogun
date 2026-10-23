# WeConnect project capsule

Single source of truth. Read it at the start of every session. Edit it, do not recreate it. It records what exists, not what was planned.

Last updated: 2026-10-23.

## 1. Project overview

Problem: perishable food, short-life medical supplies and essential kits must reach night shelters and relief camps before they spoil. Waste comes from coordination gaps: supply that does not match demand or transport capacity, volunteers who claim and go silent, conditions that change in transit, and supplies that are incompatible with a destination.

Goal: a real-time coordination, dispatch and safety platform. It makes feasible dispatch decisions, detects operational failures, recovers from changing circumstances and explains every decision. It never invents a successful delivery. If nothing is feasible it reports the unresolved quantity and the blocking reason.

Product name: WeConnect.

Judge tests. Database and engine runs are real (in-memory Postgres, see section 15). Nothing was run on a deployed site because no Supabase project or Vercel project exists yet.

| # | Test | Status |
|---|------|--------|
| 1 | Expiring donation | PASS in database tests. Not run on a deployed site. |
| 2 | Batch splitting | PASS in database and engine tests. Not run on a deployed site. |
| 3 | Ghost reservation | PASS in database tests, engine decision logic agrees with SQL. Not run on a deployed site. |
| 4 | Shelter demand fulfilled in transit | PASS in database and local-mode tests. Not run on a deployed site. |
| 5 | Shelter closure | PASS in database and local-mode tests. Not run on a deployed site. |
| 6 | Supply incompatibility | PASS in database, engine and local-mode tests. Not run on a deployed site. |
| 7 | Rider delay | PASS in database and local-mode tests. Not run on a deployed site. |
| 8 | Offline operation | PARTIAL. App shell and mirror verified in a production build with the server stopped. Outbox replay against a live Supabase not run. See section 15. |
| 9 | Honest reporting | PASS. Static check plus runtime refusal tests. |

## 2. Decisions log

Fixed decisions from the brief (2026-10-23), all kept: TypeScript with Next.js App Router; Vercel from GitHub; Supabase free tier as the only backend (Postgres, RLS, RPC, Realtime); no paid services; no auth, role chosen on the landing page; Tailwind plus shadcn-style components copied into the repo; lucide-react; Leaflet with react-leaflet and OpenStreetMap tiles online, SVG schematic offline; idb-keyval for the mirror and outbox; Zustand with persist; zod on every form and incoming record; date-fns; nanoid; @serwist/next (not next-pwa); Vitest; no external AI, all logic deterministic; only two environment variables.

Decisions made during the build (2026-10-23):
- Replaced the existing Vite marketing landing page. It broke the brief (marketing sections, invented statistics, gradients, Vite instead of Next.js). The legacy tool directory in the repo root is ignored by git and not part of the project.
- Next.js 16.4.2 with webpack (`next dev --webpack`, `next build --webpack`) because @serwist/next needs webpack. React 19.3.1. Tailwind 4.3.3. TypeScript 5.9.3 (7.x was not used for tool compatibility).
- shadcn/ui components were written by hand in `src/components/ui.tsx` (class-variance-authority, clsx, tailwind-merge) and restyled, without the Radix dependency.
- Batch splitting means one batch has many allocations and leases. Each allocation carries the lifecycle state. Batch status is a roll-up of its allocations (`_rollup`). Reason: a split batch cannot have a single honest state.
- A batch is claimable while `remaining_qty > 0`, it is not expired and not terminal. `remaining_qty` is the unallocated pool. Invariant, tested: pool + live or delivered allocations + unresolved rows = original quantity.
- Rider capacity is the sum across active leases, not per lease. Maximum 2 active leases.
- Feasibility deadline is expiry minus safety buffer, checked against the actual arrival time for the specific shelter. `safe_by_at` uses the nearest open shelter that accepts the category and is the latest time pickup may start. It is recalculated on release.
- Unverified compatibility failure allows the assignment but forces feasibility `at_risk` with the text "Rule pending verification".
- Reroute never keeps cargo on a closed shelter. The unplaceable remainder becomes an `unresolved` row. If the cargo is already with the rider the row has `cargo_with_rider = true` and cannot be returned to the pool.
- Heartbeats are sent by device riders. Simulated riders heartbeat through `simulate_tick`. A rider that sends a real heartbeat becomes `mode = device` and the simulation stops heartbeating for it. Chaos Lab "unresponsive" sets `sim_silent`.
- Simulated movement never changes lifecycle state. Only the rider screen or a dispatcher can confirm pickup, transit and delivery.
- `advance_time` also refreshes heartbeats of responsive simulated riders, otherwise every rider would look silent after a clock jump.
- Events use server time (`now()`). The simulated clock affects deadlines and sweeps through `sim_now()`.
- Local Chaos Lab actions are also queued in the outbox, so the server repeats them when the connection returns. Local results are labelled "Local, not yet synced".
- While offline, rider connectivity is held as of the last sync (`freezeHeartbeats`) so the whole fleet does not look disconnected and the local engine can still plan.

## 3. Tech stack

Installed versions (from `npm ls`): next 16.4.2, react 19.3.1, react-dom 19.3.1, tailwindcss 4.3.3, @tailwindcss/postcss 4.3.3, postcss 8.5.31, lucide-react 1.61.0, zustand 5.0.16, idb-keyval 6.3.0, date-fns 4.4.0, zod 4.6.7, nanoid 6.0.2, leaflet 1.9.4, react-leaflet 5.0.0, @supabase/supabase-js 2.118.0, @serwist/next 9.5.13, serwist 9.5.13, class-variance-authority 0.7.1, clsx 2.1.1, tailwind-merge 3.7.0. Dev: typescript 5.9.3, vitest 5.0.5, tsx 4.23.15, @electric-sql/pglite 0.5.11 (runs the real SQL in tests), @types/*.

Supabase setup (no secrets): create a free project; in the SQL editor run `supabase/migrations/0001` to `0005` in order; Database, Replication: confirm `leases, allocations, batches, shelters, riders, events, unresolved, incidents` are in the `supabase_realtime` publication (0002 adds them when the publication exists); optionally enable the pg_cron extension (0004 tries it and falls back silently); copy the project URL and anon key.

Vercel setup: push to GitHub, import the repository, framework Next.js, build command `npm run build`, add the two environment variables, deploy.

## 4. Environment variables

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. `.env.example` holds both with empty values. `.env*` is ignored.

## 5. Data model

As in `supabase/migrations/0001_schema.sql`. Tables: `settings`, `donors`, `shelters`, `riders`, `batches`, `allocations`, `leases`, `compatibility_rules`, `events`, `incidents`, `unresolved`, `action_log`.

Added to the brief's columns (reason in brackets):
- batches.remaining_qty (unallocated pool).
- leases.eta_at, leases.delay_min (ETA and traffic delay).
- riders.mode, riders.sim_silent (device versus simulated, chaos control).
- events.event_type, quantity, meta (impact ledger and recoveries calculated from events).
- incidents.note, created_at; unresolved.cargo_with_rider, status.
- action_log.rpc, result (idempotent replay returns the first result).

Settings keys: speed_kmph 25, pickup_allowance_min 10, safety_buffer_min 15, heartbeat_interval_s 30, missed_heartbeat_threshold 2, ack_grace_s 30, max_active_leases 2, at_risk_threshold_min 45, clock_offset_min 0, sim_time_scale 30, last_sweep_epoch (written by the sweep).

## 6. State machine

States: AVAILABLE, RESERVED, PICKUP_CONFIRMED, IN_TRANSIT, DELIVERED, EXPIRED, CANCELLED, RELEASED, REROUTING, CUSTODY_UNCERTAIN, UNRESOLVED.

| From | To | RPC |
|------|----|-----|
| (pool) | RESERVED | claim_lease, apply_plan, sweep recovery, reroute pieces |
| RESERVED | PICKUP_CONFIRMED | confirm_pickup |
| PICKUP_CONFIRMED | IN_TRANSIT | mark_in_transit |
| IN_TRANSIT | DELIVERED | confirm_delivery (only writer of DELIVERED) |
| RESERVED | RELEASED | sweep_leases (overdue, no pickup), set_rider_capacity |
| RESERVED, PICKUP_CONFIRMED, IN_TRANSIT | REROUTING then RELEASED or UNRESOLVED | reroute_lease, set_shelter_status, set_shelter_demand, set_shelter_resources, report_traffic_delay |
| PICKUP_CONFIRMED, IN_TRANSIT | CUSTODY_UNCERTAIN | sweep_leases (overdue after pickup) |
| CUSTODY_UNCERTAIN | IN_TRANSIT or CANCELLED | resolve_custody (dispatcher) |
| any active | EXPIRED | sweep_leases, advance_time |

Every transition checks the current state, rejects an invalid one, and writes the change plus an event row in one transaction (`_set_alloc`). Batch state follows through `_rollup`.

## 7. Algorithm rules

- Transit: haversine km / speed_kmph * 60. Arrival = now + [rider-to-donor leg + pickup allowance] + donor-to-shelter leg + delay. Pickup must reach the donor before `pickup_window_end`.
- Deadline: arrival <= expires_at - safety_buffer_min. Slack below at_risk_threshold_min is `at_risk`, below zero is `infeasible`.
- safe_by_at = expires_at - (pickup allowance + nearest eligible shelter transit) - safety buffer.
- Allocation: offerable batches (pool > 0, not expired) ordered by remaining safe minutes, least first. Chunks no larger than rider free capacity. Nearest feasible compatible shelter first; FairShare breaks ties between shelters within 0.25 km by largest remaining unmet demand. Every chunk is checked for rider capacity, lease limit, shelter demand, compatibility and arrival. Leftover becomes unresolved with one of: shelter closed, no eligible shelter, missing resource, no unmet demand, no rider capacity, too far for the safe window. `verifyPlan` re-checks the plan independently.
- Sweep: overdue means `ack_deadline < sim_now()`; ack window = threshold x interval + grace = 90 s. Overdue and RESERVED: release, restore reservation, recalculate safe_by_at, release_count + 1, reassign to the next eligible rider (fresh heartbeat, free capacity and lease slot, nearest feasible shelter), emit `recovery`. Overdue after pickup: custody uncertain, no reassignment. Batches past expiry become EXPIRED and their live allocations EXPIRED. Idempotent.
- Reroute (`_reroute`): move N units off an allocation, split across open compatible shelters with remaining demand, nearest first along a chain from the rider position, feasibility recalculated for every piece, remainder unresolved with a reason. A partial move keeps the rest in place.
- Compatibility: `compatibility_rules` with source_note and verified. Verified failure blocks. Unverified failure flags. Closed shelter or unaccepted category is ineligible.
- Delivery: quantity received must be entered, no more than leased, batch not expired, shelter still compatible. A shortfall becomes an unresolved row. Shelter demand drops by the quantity received.

## 8. RPC and Realtime list

All take `p_action_id` first, are `security definer` with a fixed `search_path`, and return `{success, new_state, reason, ...}`. Repeats return the first result with `duplicate: true`.

create_batch (batches, events), claim_lease (allocations, leases, batches, riders, events), apply_plan (as claim plus unresolved), heartbeat (riders, leases), confirm_pickup, mark_in_transit, confirm_delivery (allocations, leases, batches, shelters, unresolved, events), resolve_custody, sweep_leases (all lifecycle tables, settings), reroute_lease, set_shelter_status, set_shelter_demand, set_shelter_resources, set_rider_capacity, advance_time (settings, riders, leases, sweep), report_traffic_delay, add_incident, process_incident, set_rider_silent, simulate_tick (riders, leases; never lifecycle state), reopen_unresolved, reset_simulation (calls `_seed_data`), server_time (read only).

Internal helpers start with an underscore and are not granted to anon.

Realtime: the client subscribes to postgres_changes on leases, allocations, batches, shelters, riders, events, unresolved, incidents and refreshes (debounced). A 15 s poll backs it up. Every connected client calls sweep_leases every 30 s and simulate_tick every 5 s; action ids are bucketed so concurrent clients collapse into one run.

## 9. Routes

| Route | Purpose | Primary action | Main components |
|-------|---------|----------------|-----------------|
| / | Choose role | Four entries | page.tsx |
| /donor | Post a batch, list own batches | Post batch | Field, Table, PendingActions |
| /rider | Ranked reachable batches, claim, lease actions, heartbeat, incidents, map tab | Claim | LeaseActions, MapView, Heartbeat |
| /shelter | Demand, open or closed, resources, incoming allocations | Save demand | Card forms, Table |
| /operations | Metrics, alerts, map, RescueIQ, risk table, ledger, events, Chaos Lab | Apply all recommendations | MapView, RescueIQ, ChaosLab, RiderPanel |
| /timeline | Event log with filters | Filter | Table |

Dashboard metric derivations (`src/lib/derive.ts`, computed from snapshot tables): active donations = batches not DELIVERED, EXPIRED or CANCELLED; awaiting = sum of remaining_qty of those batches plus live allocation quantity; rider counts from heartbeat age and active leases; risk = live allocations not feasible, custody uncertain, or within the at-risk window of expiry; delivered = allocations with status DELIVERED; recoveries = events `recovery`; reroutes = events `reroute_success`; unresolved = open unresolved rows; last sweep = settings.last_sweep_epoch.

## 10. UI tokens

Palette (five families only). Ratios from `node scripts/contrast.mjs`.

| Token | Hex | Use |
|-------|-----|-----|
| cream | #F3E3C3 | page background |
| latte | #FFF8E7 | cards, panels, inputs |
| mocha-200 | #D9C3A5 | chip fills, table header (decorative only, 1.35:1 on cream) |
| mocha-600 | #7A6244 | borders |
| mocha-700 | #6B5238 | muted text |
| burgundy | #4A0F1F | text, primary buttons |
| cherry | #8E1B2E | urgent states, focus rings |

Pairs: burgundy on cream 12.03; burgundy on latte 14.38; latte on burgundy 14.38; mocha-700 on cream 5.74; mocha-700 on latte 6.86; cherry on latte 8.45; cherry on cream 7.07; latte on cherry 8.45; mocha-600 border on latte 5.42; mocha-600 border on cream 4.53; cherry focus ring on latte 8.45; burgundy on mocha-200 8.92. All text and UI border pairs pass AA.

Radius 6 px controls, 10 px cards. Spacing on a 4 px scale. One system font stack. Sizes 13, 15, 20 px. Weights 400 and 600. Motion: one 150 ms fade, disabled under reduced motion. No shadows, gradients, blur or emojis.

Map tiles are OpenStreetMap, pulled toward cream and brown with a CSS filter. This is an approximation, not an exact palette match.

Forbidden words and sections: demo, sample, prototype, mock, simulated data, AI-powered, xyz, the former working name, marketing sections. A source search on 2026-10-23 found none in `src`, `supabase`, `scripts` or tracked `public` files (the generated `public/sw.js` is ignored by git).

## 11. Offline behaviour

Works after one online visit: app shell via Serwist precache; mirror in IndexedDB (`wc:mirror`, with a synced time per table); seed baseline saved on first load (`wc:seed`); outbox (`wc:outbox`); local overlay (`wc:local`). The app renders from the mirror first, then refreshes.

Outbox record: `action_id` (nanoid), `type`, `payload`, `created_at`, `attempts`, `status` (local, sent, confirmed, rejected), `label`, `reason`, `result`. Labels: "Saved on this device, will sync", "Sent to server", "Confirmed by server", "Rejected: reason". Replay is in creation order, stops at a network error, and the database ignores repeats through `action_log`. Rejections are shown with the server's reason and never dropped.

Heartbeats are not queued. Offline they are recorded as "last heartbeat not sent". Incident states: saved_locally, pending (sent), received, processed.

Offline map: SVG built from stored coordinates, labelled "Schematic map. Street map unavailable offline." with a text legend; rider click opens the same panel.

Does not work offline: updates from other devices, server sweeps, custody decisions, map tiles, fresh traffic data.

## 12. Seed data summary

Generated by `npm run gen:seed` from `src/lib/seed.ts` into `0005_seed.sql`, which defines `_seed_data()` and runs it. 6 donors (Greenleaf Kitchen, Harbour Street Diner, North Campus Hostel Mess, Lakeside Pharmacy, Station Road Canteen, Civic Care Pharmacy), 5 shelters (Riverside Night Shelter, Eastgate Relief Camp, Old Market Shelter, Southfield Relief Camp, Hillcrest Women's Shelter), 6 riders, 8 batches FD-1035 to FD-1042 with expiry from 80 minutes to 24 hours, 4 compatibility rules (2 verified: ration kit and infant formula need water and cooking fuel; 2 unverified: medical needs cold storage, cooked food needs water). Names are fictional.

## 13. Commit log

d4c56ad chore: initialize WeConnect with design tokens
61d022a feat: add supabase schema
2e703e4 feat: add row level security policies
7f19b09 feat: add transition rpc functions
00d559d feat: schedule lease sweep
2fd0d26 feat: add seed data and database judge tests
8ee73e2 feat: add pure allocation engine with tests
e6f38f7 feat: add shared layout, role screens, engine wiring, map and chaos lab
4c56f1e fix: hold rider connectivity as of last sync when offline; add local chaos and contract tests
Later commits: see `git log`.

## 14. Progress checklist

Completed and tested (automated): schema, RLS (policy text only), all RPCs, seed and reset, idempotency, engine modules, local chaos mode, client/RPC contract.

Completed and tested (manual in browser, production build, no Supabase): landing, top bar states, operations rendering, RescueIQ calculation, local Chaos Lab run and result structure, service worker registration, offline open from cache with the server stopped, 375 and 1280 px layouts for rider and operations.

Written, not tested against a live Supabase: Supabase client and fetch, realtime subscriptions, outbox replay, donor, shelter and rider actions end to end, apply recommendation, live map rider movement, heartbeat loop, pg_cron schedule, RLS enforcement with the anon role.

Partial: README, polish (768 px not checked, keyboard path not exercised), incident dispatcher view (dispatchers can see incidents in the rider panel but there is no screen button for `process_incident`).

Remaining: Phase 4 step 25 (create Supabase project, run migrations, enable Realtime, deploy to Vercel, end-to-end check), step 27 (judge tests on the deployed site, offline checklist with a live outbox), item O (event replay, cut).

## 15. Verification log

2026-10-23, `npx vitest run`:
- tests/db/judge.test.ts (26 database tests on the real migrations in PGlite): tests 1 to 7 and 9 scenarios, rpc plumbing, idempotency, reset, simulate_tick leaves state unchanged. All passed.
- tests/db/agreement.test.ts: engine `decideSweep` and the SQL sweep agree on release, custody-uncertain and expiry fixtures. Passed.
- tests/db/contract.test.ts: every client action calls an existing function with the parameter names and types the client sends. Passed.
- tests/engine/engine.test.ts: geo, time, compatibility, allocation (success, partial, infeasible, capacity, demand, incompatibility, unverified flag, ordering, FairShare, offline riders, 180-meal example), reroute (full, partial, none open), sweep decisions, labels. Passed.
- tests/engine/localChaos.test.ts: local mode keeps the same invariants. Passed.

Build: `npm run build` (webpack, Serwist bundles `/sw.js`) succeeded.

Honest reporting (test 9): the only writer of DELIVERED is `confirm_delivery` (checked by test: exactly one `_set_alloc(..., 'DELIVERED')`, none elsewhere). Screens show delivered only from rows with status DELIVERED. Offline outbox records never alter the snapshot.

Offline results (separate): production build with the preview server stopped: `/operations` and `/rider` opened from the service worker cache and rendered from the IndexedDB mirror. Local Chaos Lab ran "advance clock 120 min" and produced all six result sections labelled "Local, not yet synced". Not run: outbox replay with a live Supabase, schematic map interaction, rejection correction.

## 16. Known limitations

- Sweep delay: without pg_cron the sweep runs only while a client is open (every 30 s). A release can lag by up to the ack window (90 s) plus 30 s.
- Supabase free tier pauses a project after a week of inactivity. Free tier limits apply to Realtime connections.
- Vercel Hobby is for non-commercial use.
- Offline map is schematic. Street tiles need a connection. Tile colours are only approximately palette-matched.
- Offline heartbeats are not queued, so an offline device cannot keep a lease alive.
- Rider position on a physical phone is not sent unless a heartbeat carries coordinates; the rider screen sends heartbeats without GPS. Real GPS is not implemented.
- Cargo already with a rider is not unloaded when capacity is reduced; the lease is flagged at risk instead.
- `unresolved` cargo with a rider does not count against that rider's committed capacity.
- Only the first online visit can populate the mirror.

## 17. Cut items and reason

- Item O, event replay: optional and last in the brief; not started.
- Real GPS via the Geolocation API: optional and secondary; not started.
- Radix-based shadcn components: replaced with hand-written equivalents to avoid extra dependencies.

## 18. Next task

Create the Supabase project, run migrations 0001 to 0005, set the two environment variables locally and on Vercel, then run the browser flows (claim on one browser appearing on another, shelter closure rerouting, offline outbox replay) and record the deployed judge tests 1 to 9 and the offline checklist.
