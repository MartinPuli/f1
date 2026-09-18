# APEX / UNKNOWN

A Three.js racing experiment: five agents explore a procedurally generated circuit with a 42 m observation horizon. Spanish UI, free / overhead / chase cameras, an immersive full-screen circuit, a separate results tab, three-lap timing and JSON export.

## Run locally

```sh
npm install
npm run dev
```

Open the URL printed by Vite. The default demo is fully local and does not call any AI service. For real Jev decisions, copy `.env.example` to `.env`, set `TYPESAFE_API_KEY`, restart the server, then choose **Configurar Jev → Jev**. Alternatively enter a key in that dialog; it stays in page memory and is sent only to this app's same-origin server proxy. Never commit a key or put it in a `VITE_*` variable.

## Experiment model

- Five drivers have identical vehicle dynamics and independent recent-observation memory, with distinct declared driving styles. Demo profiles use a local pure-pursuit policy and different risk factors. They are not Jev results or machine learning training.
- Each observation contains speed, heading error, lateral road offset, five relative centerline samples up to 42 m, nearby cars within 42 m, current lap and eight past observations. It contains no map, full curve, track seed or hidden future geometry.
- The environment necessarily knows the track to render it and calculate physics; policies receive only `observe()` output. Demo steering uses these local observations; the proxy transmits only the supplied per-driver state to Jev in separate requests.
- Jev chooses one of 11 combined pedal / steering actions every 0.25 simulated seconds using `jev-latest` and TypeSafe's Choice primitive. All five decisions use the same simulated instant; simulation time pauses until the complete batch arrives. Every batch may make five billable API calls. Errors pause the race without silently switching to demo.
- Fixed 0.025 s integration, bicycle steering, lateral acceleration cap, grass drag, simplified circle collisions. Arcade physics, not a professional F1 simulator. Lap times are simulation time and API latency is excluded. Three laps or a 240 s simulation limit.
- The first lap includes a standing start; later faster laps alone are not evidence of learning. Compare multiple seeds and rotate grid positions for a controlled benchmark.

## Validate and build

```sh
npm test
npm run build
```

Build outputs the browser app to `dist/client` and a Cloudflare-compatible worker to `dist/server/index.js`. The worker expects the static assets binding `ASSETS` and optional secret `TYPESAFE_API_KEY`. Hosting metadata is `.openai/hosting.json`. Keep server-key deployments owner-private; this demo endpoint has no public-user billing controls. For a public deployment, add authentication and per-user rate limits before exposing a shared server key.

Tests cover deterministic circuits, partial observations, independent memory, complete three-lap demo races on multiple seeds, pause/reset, steering and off-track behavior, request validation and failed-Jev handling. Live TypeSafe performance requires a real account/key and is not covered by local tests.
