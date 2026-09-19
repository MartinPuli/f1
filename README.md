<p align="center"><img src="public/logo.svg" alt="JEVRACE" width="420"></p>

Ten drivers race a circuit they haven't seen. You choose their Jev models and prompts, follow the cars in 3D, and replay the result.

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

Open **Drivers**, select a car, and edit its name, number, prompt, or model. **Race rules** applies to everyone; **Reset grid** restores the starter lineup. [Jev driving defaults](docs/JEV.md) explains the request and decision rules. The shared race prompt applies to all ten drivers, but each receives only its own observations. Connecting TypeSafe checks the model catalog without starting inference. Different aliases may resolve to the same model; results retain the returned version when TypeSafe supplies it.

Click a driver to follow them, drag to move the camera, or select the circuit and aerial views. On a keyboard, **Space** or **P** plays and pauses, **Esc** closes a window or pauses the race, **1–9** and **0** and the left/right arrows select drivers, **C** changes the camera, and **F** recenters it. **M** toggles film sound. **R** opens Results, **N** opens race setup, and **?** shows the shortcut sheet. Shortcuts leave text fields alone; you can disable them in the sheet, which is also available through settings. Touch controls work in portrait and landscape; the renderer lowers resolution and shadow size on touch devices.

Autosaves need both 30 simulation seconds of new progress and 60 seconds since the previous autosave. Pausing and finishing also queue a save. The queue keeps the newest pending snapshot per race and spaces writes at least 15 seconds apart; opening a dialog without changing the race doesn't save it again. They include standings, prompts, models, and replay frames. Replays don't call TypeSafe. If storage fails, Results shows the error and lets you retry or download JSON. Closing the page can lose progress since the last completed save.

## Community replays

**Results → My races** lists your private archive. After a race finishes, **Share race** lets you publish its replay in **Community**, including names, models, and prompts. Nothing publishes automatically. Choose **Unpublish** in My races to remove a shared recording; someone who already downloaded it can retain a copy. Community results come from visitors' browsers and aren't verified race scores.

Community is available on Vercel and in local development. The older Sites adapter doesn't provide a public feed. Production builds apply the updated Postgres schema; it adds publication columns and indexes without making existing races public.

## API keys and costs

The browser keeps the key in memory until you clear it or leave the page. Requests carry it in an Authorization header to the same-origin server, which forwards it only to fixed TypeSafe HTTPS endpoints. The code doesn't write keys to browser storage, logs, recordings, or the database. The hosting operator and TypeSafe still process the credential; this isn't end-to-end encryption between the browser and TypeSafe.

Don't put secrets in driver prompts or race names, because the archive deliberately stores those fields. The interface blocks the currently connected key when it detects it there. Keep request-body logging, session replay tools, and third-party scripts away from the connection flow. [SECURITY.md](SECURITY.md) describes the boundaries and remaining risks.

Each active driver has its own Jev request. After a response, that driver sends a fresh observation on the next physics step, without waiting for other drivers or a half-second timer. There is at most one request in flight per driver, with three Choice questions per call. Frequency depends on API latency and can exceed two calls per second per driver. The grid requests one opening decision per car; further requests begin at lights out. Cars keep driving on their last targets while replies arrive. Pause and finish stop new requests; requests already sent can still complete. Service errors pause the race. TypeSafe's provider limits still apply. Use its account controls to limit spending; JEVRACE doesn't enforce a dollar budget.

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

This is a spectator experiment, not a competitive leaderboard. Visitors control the client and can submit invented race data to their own archives. Jev chooses a road lane, pace, and battery mode. A shared steering and speed controller executes those targets at 40 Hz, using only the current local road samples; it also slows down to recover when a car leaves the road. This is assisted driving, not direct model control of each wheel input. Drivers see five local road samples up to 42 meters ahead, nearby cars, and their own recent observations; they never receive the circuit seed or the full track. A race times out after 100 simulation seconds per lap.

Vercel limits each browser archive to 50 races and 50 MB of JSON. Shared Postgres counters cap session, catalog, and archive requests by browser, IP, and project; driving requests bypass these counters. One database statement checks all applicable counters; short rejection caches reduce repeat queries in warm functions. These limits don't prevent function invocation charges or protect static bandwidth. Configure the free Vercel bot rules and API firewall rule in [the deployment guide](docs/VERCEL.md) before sharing the URL.

MIT licensed. The JV racing mark is original; this project has no affiliation with Formula 1, its teams, or its drivers. Font licenses live beside the self-hosted fonts in `public/fonts/`.

## Recording a race film

Run a race, then choose **Results → Watch film**. The camera sequence uses the recorded race positions, starting lights, and a winner card. It loops without new inference calls or archive writes. Jev recordings show the recorded request activity and driver choices in the lower-left panel. The film doesn't substitute local decisions for Jev decisions.

Use a screen recorder at 1920 × 1080 to capture a loop. **Space** pauses; **Esc** returns to your race. **Results → My races → Open recording** loads a downloaded JEVRACE JSON file without uploading it. Prompts, resolved models, and results remain in the recording; credentials do not.

## Race broadcast

The timing tower shows gaps from recorded leader crossings, plus completed lap times and DNF status. The left Jev panel shows the selected driver’s returned choices, option probabilities, model, response age and latency, with the observation sent for that response and recent decisions. The activity graph compares requests sent to Jev with replies received over the last twelve seconds. Counters show requests, replies, in-flight work and failed calls; the latency is measured for the latest completed request (or batch in older recordings). No synthetic activity is generated. Classification sits on the right, below the lap counter. Its request log stores no headers, keys or raw request bodies. Older recordings without that log show no fabricated activity.

**Watch film** adds a winner reveal and synthesized engine, start-light, contact and finish sounds. Sound follows the recorded speed and incident timestamps; mute with **M**. Saved frames retain the wheel steering angle and retired cars.

Enable **Race incidents** to run the optional scenario: a curb strike that starts a spin near traffic, then a cooling leak as the leader starts lap two. These are injected conditions, not mistakes attributed to Jev. Engine temperature rises with load and cooling loss; sustained overheating causes a DNF. Hard side impacts can independently break the suspension. Spins preserve world momentum while the car rotates and slows, then the controller attempts recovery. The retired car coasts toward the runoff area and remains visible. The chase camera moves above traffic instead of hiding nearby or finished cars.

Default driver numbers follow the [2026 Formula 1 entry list](https://www.formula1.com/en/latest/article/all-the-2026-f1-driver-numbers-confirmed-in-full.5rh7o9mPntG7NerzVk9onc), checked on September 18, 2026: Verstappen 3, Norris 1, Hamilton 44, Leclerc 16, Colapinto 43, Piastri 81, Alonso 14, Sainz 55, Russell 63, Albon 23. Saved races retain the numbers used when they ran.
