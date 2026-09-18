# JEV Prix 🏁

**Unknown tracks. Unexpected champions.** Five independent drivers discover a procedural circuit as they race. A full-screen Three.js spectator experiment with Formula-inspired cars, warm colors, orbitable chase cameras, saved races, and interactive replays.

Meet **Max JEVstappen, Lewis JEVmilton, Charles LeJEVclerc, Lando JEVrris, and Franco ColJEVpinto**. This is an original fan experiment, not affiliated with Formula 1, its teams, or the drivers.

## Run your own races

Requires Node.js 22 or newer.

```sh
npm ci
npm run dev
```

Open `http://localhost:5173`. Give your race a name, pick 1–5 laps, generate a circuit or enter a seed, and start. Free demo mode runs without any account or key. For real Jev decisions, select **Race with Jev** and enter your own [TypeSafe API key](https://docs.typesafe.ai/introduction). Each visitor supplies their own key; there is no shared server key or silent demo fallback.

Jev is a paid upstream service. The simulation requests decisions every 0.25 simulation seconds for up to five active cars (up to 20 upstream requests per simulation second). Time freezes while a batch is in flight. Errors pause the race. Pausing stops future batches; an already submitted batch can finish. The key stays in JavaScript memory until cleared or the page closes. It travels through the same-origin server to TypeSafe and is excluded from recordings, exports, logs, and persistence.

Local race recordings are stored on disk in the ignored `.races/` directory, so they survive reloads and server restarts. The development server binds to loopback by default and uses one local archive; it is not a multi-user production server. Do not expose the development server to the internet.

## What you can do

- Name and rename races; choose 1–5 laps and demo or Jev mode.
- Generate circuits from a **32-bit seed space (4,294,967,296 seed values)**. These are generated on demand, not a catalog of billions of separately tested tracks. Reusing a seed reproduces the circuit under the same generator version.
- Follow any driver, drag to orbit them, or switch to an orbiting circuit view or an aerial view. Keys **1–5** select drivers; **C** changes the view; double-click the circuit or click the chase camera button to recenter.
- Save progress automatically every 15 simulation seconds, on pause and at the finish. The Results modal shows standings and the latest 50 archived races.
- Replay saved telemetry with a scrubber, speed controls, and any camera. Replays make no Jev requests. Download a JSON recording from Results. These are interactive recordings, not video files.
- Rename recordings and delete them with a two-click confirmation.

## How the experiment works

`src/simulation.js` implements a fixed-step bicycle model, limited lateral grip, collisions, off-track penalties, and lap timing. Each independent driver receives five nearby road samples (up to 42 m), nearby cars, speed, heading error, and its own recent observations. The whole circuit and its seed are never sent to Jev. Demo drivers use local steering policies; their results are not measurements of Jev performance. Each race has a simulation timeout of 100 seconds per configured lap, with unfinished cars ranked by distance.

The procedural generator uses seeded radial harmonics with bounded amplitudes to create smooth closed circuits. Generator version 2 is embedded in recordings; keep older generator implementations when introducing future incompatible track changes.

## Hosted persistence and deployment

The included Cloudflare-compatible Worker serves the app and `/api/*`. On **OpenAI Sites**, `.openai/hosting.json` declares `DB` (D1) for race metadata and `BUCKET` (R2) for recordings. Sites provisions the bindings and applies generated `drizzle/` migrations. Race endpoints require the platform's trusted `oai-authenticated-user-id` header; every read, write, and delete is scoped to that identity. Never run this Worker behind a proxy that accepts that header directly from the public internet. Porting to another host requires trusted server-side authentication and provisioning D1/R2 or replacing the archive adapter.

When deploying your own fork, replace the original `project_id` in `.openai/hosting.json` with your own Sites project registration. Do not deploy to the original project's ID. No API secrets are needed in the hosting manifest.

```sh
npm test
npm run build
# After a schema change:
npm run db:generate
```

Build output: `dist/client/` assets, `dist/server/index.js` Worker, `dist/.openai/hosting.json`, and `dist/drizzle/` migrations. Local mode uses `server/local-archive.js`; hosted mode uses prepared D1 statements and R2 in `server/archive.js`.

Recordings are user-scoped and unlisted. They are spectator experiment data, not an authoritative competitive leaderboard. Autosave failures are shown in Results; download the recording to keep a copy if storage is unavailable. A crash or closing the tab can lose progress since the last successful save.

## License

MIT. Self-hosted Barlow, Barlow Condensed, Fredoka and Nunito fonts retain their SIL Open Font License files in `public/fonts/`.
