# Code map

JEVRACE has one browser scene. The interface opens dialogs over it for race setup, API connection, and results. It doesn't need a frontend framework; Three.js renders the world and ordinary DOM controls handle input.

## A decision batch

`Race.tick()` advances a fixed 25 ms physics step. Every half-second of simulation time, Jev mode requests decisions for the active cars. Only the first response holds the grid. Later requests run alongside physics, with at most one batch in flight; the controller follows the last validated target until its replacement arrives. There is no artificial gap between batches; the client still honors provider cooldown responses. Driving bypasses application rate counters. Demo decisions remain local and run every quarter-second. `observe()` gives each driver local road samples, nearby cars, and its own memory. It doesn't include a seed, full track, or another driver's prompt.

`server/api.js` validates the batch, matches each driver ID to its configured model and prompt, then calls TypeSafe. It accepts only known action names. The response includes the resolved model when available. A generation counter stops an old network response from changing a reset race, while service errors pause the run instead of silently using demo driving.

## Hosts

| Host         | Entry                               | Identity                | Archive                       |
| ------------ | ----------------------------------- | ----------------------- | ----------------------------- |
| Local Vite   | `vite.config.js`                    | One local owner         | Ignored `.races/` files       |
| Vercel       | `api/index.js` → `server/vercel.js` | Signed browser cookie   | Neon Postgres                 |
| OpenAI Sites | `server/worker.js`                  | Trusted platform header | D1 metadata and R2 recordings |

The shared API receives storage and owner adapters. Vercel never accepts the Sites header as proof of identity. Don't move either adapter behind a different proxy without replacing that trust boundary.

`server/security.js` supplies shared response headers. `vercel.json` also applies them to static files and prevents framing. The Sites host retains its existing embedding behavior.

## Recordings

`recordRace()` copies an explicit set of fields instead of serializing the live Race object, which contains the API key. `cleanRecord()` applies a second allowlist before persistence. It stores grid configuration with the recording, so a replay doesn't depend on current editor values.

A start-delay field retains the light sequence duration for films. Reaction delays and pending decisions live in `Race`; only physical motion and current telemetry enter replay frames.

New frames contain a timestamp and ten arrays in stable driver order: x, z, heading, speed, steering, progress, lap, finished flag, distance, battery, tire condition, damage, and numeric codes for power, lane, and pace. Ten-car races capture at 5 Hz to keep longer recordings within the 3.5 MB upload bound. Earlier five-car recordings with nine-value arrays still play; they keep their original grid and prompts. `applyReplay()` uses binary search for the surrounding frames and interpolates position and heading. Generator version 2 identifies the seeded circuit implementation; retain old generators before changing its geometry.

The UI serializes saves through `src/save-queue.js`, replaces pending snapshots with newer ones, and skips unchanged snapshots. A session starts only when the user needs an API feature; a returning signed cookie needs no database query to bootstrap. This prevents a slower, older save from overwriting a finish. Postgres additionally locks saves per owner while checking quotas. Metadata excludes frames, which keeps the saved-race list small.

## Maintaining the project

Run `npm run format` after editing. Use comments for assumptions, privacy boundaries, and ordering constraints rather than repeating a line of code. `npm test` includes the Postgres SQL through PGlite and mocked TypeSafe responses; no test needs a paid API key.

`npm run build:vercel` writes browser assets to `dist/client`; Vercel packages `api/index.js` separately. `npm run build` also builds the Sites Worker and copies its SQLite migrations. `npm run db:generate` remains the Sites schema workflow. Neon uses the SQL file under `db/postgres/`, applied separately from application builds.

Production settings fail closed: a missing database, short session secret, or mismatched public origin doesn't open a shared archive. The local demo still renders, and the interface reports persistence failures without discarding the downloadable recording.
