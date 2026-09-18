<p align="center"><img src="public/logo.svg" alt="JEVRACE" width="420"></p>

Five drivers race a circuit they haven't seen. You choose their Jev models and prompts, follow the cars in 3D, and replay the result.

JEVRACE runs in English on desktop and phones. Demo mode needs no account or API key; it uses local driving policies. Jev mode calls [TypeSafe](https://docs.typesafe.ai/introduction) with the visitor's own credential. Demo results don't measure model performance.

## Run locally

Use Node.js 22 and npm.

```sh
npm ci
npm run dev
```

Open `http://localhost:5173`. Local recordings live in `.races/`, which Git ignores. The development server binds to your machine's loopback address and shares one local archive; don't expose it as a public server.

## Deploy on Vercel

Follow [the Vercel guide](docs/VERCEL.md). The repository includes a Vercel function, a Postgres schema, security headers, and a daily cleanup job. Import the repo, connect Neon, and configure the server variables. Production builds prepare the database schema automatically. No visitor API key belongs in Vercel's environment settings.

Vercel stores each browser's results in Postgres and uses a signed, HttpOnly cookie to select its archive. There are no user accounts. Clearing that cookie, changing browsers, or reaching its 90-day expiry loses access to the archive; download recordings you want to keep. The daily job deletes recordings after 90 days without an update.

The existing OpenAI Sites deployment uses a separate adapter with platform identity, D1, and R2. Its recordings don't automatically move to Vercel.

## Set up a race

**Circuit** controls the name, seed, lap count, and Demo/Jev mode. A seed reproduces a circuit under the same generator version. The 32-bit seed range contains 4,294,967,296 values; the project generates tracks on demand and doesn't claim to have tested every value.

Open **Grid** to edit driver names and car numbers. **Jev settings** contains the model and prompts; **Reset grid** restores the starter lineup. [Jev driving defaults](docs/JEV.md) explains the request and decision rules. The shared race prompt applies to all five drivers, but each receives only its own observations. Connecting TypeSafe checks the model catalog without starting inference. Different aliases may resolve to the same model; results retain the returned version when TypeSafe supplies it.

Click a driver to follow them, drag to move the camera, or select the circuit and aerial views. On a keyboard, **Space** or **P** plays and pauses, **Esc** closes a window or pauses the race, **1–5** and the left/right arrows select drivers, **C** changes the camera, and **F** recenters it. **R** opens Results, **N** opens race setup, and **?** shows the shortcut sheet. Shortcuts leave text fields alone; you can disable them in the sheet, which is also available through settings. Touch controls work in portrait and landscape; the renderer lowers resolution and shadow size on touch devices.

Autosaves need both 30 simulation seconds of new progress and 60 seconds since the previous autosave. Pausing and finishing also queue a save. The queue keeps the newest pending snapshot per race and spaces writes at least 15 seconds apart; opening a dialog without changing the race doesn't save it again. They include standings, prompts, models, and replay frames. Replays don't call TypeSafe. If storage fails, Results shows the error and lets you retry or download JSON. Closing the page can lose progress since the last completed save.

## Community replays

**Results → My races** lists your private archive. After a race finishes, **Share race** lets you publish its replay in **Community**, including names, models, and prompts. Nothing publishes automatically. Choose **Unpublish** in My races to remove a shared recording; someone who already downloaded it can retain a copy. Community results come from visitors' browsers and aren't verified race scores.

Community is available on Vercel and in local development. The older Sites adapter doesn't provide a public feed. Production builds apply the updated Postgres schema; it adds publication columns and indexes without making existing races public.

## API keys and costs

The browser keeps the key in memory until you clear it or leave the page. Requests carry it in an Authorization header to the same-origin server, which forwards it only to fixed TypeSafe HTTPS endpoints. The code doesn't write keys to browser storage, logs, recordings, or the database. The hosting operator and TypeSafe still process the credential; this isn't end-to-end encryption between the browser and TypeSafe.

Don't put secrets in driver prompts or race names, because the archive deliberately stores those fields. The interface blocks the currently connected key when it detects it there. Keep request-body logging, session replay tools, and third-party scripts away from the connection flow. [SECURITY.md](SECURITY.md) describes the boundaries and remaining risks.

Jev makes up to **10 upstream calls per simulation second**: five drivers, two decisions each second. The browser starts at most one batch every two real seconds, including at 4× playback. The race freezes while a batch runs, and service errors pause it. A batch already sent may still complete after you pause or clear the key. Use TypeSafe's account controls to limit spending; JEVRACE doesn't enforce a dollar budget.

## Work on the code

```sh
npm test
npm run check
npm audit --omit=dev
```

`npm run check` checks formatting, runs the tests, and builds the Vercel frontend. Tests cover driving behavior, replay fidelity, credential handling, archive isolation, signed sessions, Postgres quotas, and rate limits. Postgres tests run with PGlite; they don't need an external database or make paid Jev calls. CI runs the same checks.

| File                         | Responsibility                                                        |
| ---------------------------- | --------------------------------------------------------------------- |
| `src/main.js`                | Dialogs, session connection, save queue, and replay controls          |
| `src/simulation.js`          | Circuit generation, physics, local observations, and driver decisions |
| `src/scene.js`               | Three.js cars, circuit, lights, and cameras                           |
| `server/api.js`              | Validation and the TypeSafe proxy                                     |
| `server/vercel.js`           | Host checks, signed sessions, quotas, and Vercel request handling     |
| `server/postgres-archive.js` | Parameterized archive queries and shared rate counters                |

See [architecture notes](docs/ARCHITECTURE.md) for the request path, recording format, and the Sites adapter. Comments explain ordering and trust boundaries; Prettier keeps source files readable.

## Limits

This is a spectator experiment, not a competitive leaderboard. Visitors control the client and can submit invented race data to their own archives. Drivers see five local road samples up to 42 meters ahead, nearby cars, and their own recent observations; they never receive the circuit seed or the full track. A race times out after 100 simulation seconds per lap.

Vercel limits each browser archive to 50 races and 50 MB of JSON. Shared Postgres counters cap requests by browser, IP, and project, including daily and monthly budgets. One database statement checks all applicable counters; short rejection caches reduce repeat queries in warm functions. These limits don't prevent function invocation charges or protect static bandwidth. Configure the free Vercel bot rules and API firewall rule in [the deployment guide](docs/VERCEL.md) before sharing the URL.

MIT licensed. The JV racing mark is original; this project has no affiliation with Formula 1, its teams, or its drivers. Font licenses live beside the self-hosted fonts in `public/fonts/`.
