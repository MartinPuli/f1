# Deploy JEVRACE on Vercel

You'll need a Vercel project and a Neon Postgres database. Visitors bring their own TypeSafe API keys; you only configure the database and server secrets.

## 1. Import the repository

Fork or import [MartinPuli/f1](https://github.com/MartinPuli/f1) in Vercel, with the repository root as the project directory. Choose **Other** if Vercel asks for a framework. The checked-in `vercel.json` sets:

| Setting | Value                                  |
| ------- | -------------------------------------- |
| Node.js | 22.x, from `package.json`              |
| Install | `npm ci`                               |
| Build   | `npm run build:vercel`                 |
| Output  | `dist/client`                          |
| Backend | `api/index.js`, with `/api/*` rewrites |

The first deployment can serve the demo before you finish setup, but the API returns 503 until the database and session settings work. Don't paste a real TypeSafe key into that deployment yet.

## 2. Create the database

Add Neon through Vercel's Marketplace, or create a database in Neon and copy its connection string into Vercel as `DATABASE_URL`. Choose a region near your Vercel function. Use a separate database branch for previews so tests can't alter production recordings.

Production builds run [`db/postgres/001_archive.sql`](../db/postgres/001_archive.sql) automatically when Vercel provides `DATABASE_URL`. You can also run it in Neon's SQL editor. It creates two tables, indexes, a save function that checks storage quotas under a transaction lock, and private-by-default publication fields. Production deployment applies updates for Community replays. A failed migration stops the new deployment; the previous deployment stays active. You can run it again without deleting existing races.

Alternatively, put `DATABASE_URL` in an ignored `.env.local` file and run:

```sh
npm run db:vercel
```

Don't run the Sites/SQLite migration against Neon. They serve different hosts.

## 3. Set server variables

Add these variables to the Vercel project's **Production** environment:

| Variable         | Value                                                                                |
| ---------------- | ------------------------------------------------------------------------------------ |
| `DATABASE_URL`   | Neon connection string, including its SSL settings                                   |
| `APP_ORIGIN`     | Exact public origin, such as `https://jevrace.example.com`, without a trailing slash |
| `SESSION_SECRET` | A random secret with at least 32 bytes                                               |
| `CRON_SECRET`    | A different random secret; Vercel uses it for daily cleanup                          |

Generate each secret separately on your computer:

```sh
openssl rand -hex 32
```

Never prefix these names with `VITE_`; Vite exposes such variables to browser code. Don't add a shared TypeSafe key. Mark sensitive variables as sensitive in Vercel, and don't commit `.env.local`.

`APP_ORIGIN` deliberately rejects other hostnames. If you add a custom domain, update it and redeploy; use the canonical domain afterward. Configure previews with their own exact origin and secrets. An unconfigured preview can still display the demo, but it mustn't share the production archive.

## 4. Redeploy and check

Redeploy after setting the variables. Vercel's daily cron calls `/api/maintenance`; it removes recordings untouched for 90 days and old rate counters. Check that the job appears in the project and succeeds after deployment. You can also invoke it manually with the cron credential through a trusted HTTP client; never place the credential in a URL.

Run a one-lap demo, open Results, and confirm **Saved**. Reload, open **Saved races**, and play it back. An incognito window should have an empty archive. Enter an invalid TypeSafe key to confirm a plain rejection message, then test a real key with a short race and watch usage in TypeSafe. The repository's automated tests mock TypeSafe; they don't establish that your account or billing works.

Check these response headers in browser developer tools: `Content-Security-Policy`, `Cache-Control: no-store` on API responses, and the `__Host-jevrace` cookie with Secure, HttpOnly, and SameSite=Strict. Don't export network traces that contain Authorization headers.

## Before you share the URL

In **Project → Firewall → Rules**, enable the free **Bot Protection** managed ruleset and **AI Bots** blocking. Bot Protection challenges clients that don't behave like browsers; AI Bots blocks known AI crawlers. Neither guarantees that every automated client will be caught. Don't enable paid BotID Deep Analysis for this setup.

Add a rate-limit rule matching paths that start with `/api` except `/api/decide`, counting by IP: **120 requests per 60 seconds**, with **Deny** when exceeded. Include the bare `/api` rewrite destination. This cuts rejected API traffic before a function runs; the code's own limits run inside the function. A cron request once a day stays below this threshold. Review firewall events after testing a normal race and adjust only when legitimate shared-IP traffic needs more room. [Vercel documents the free bot rules](https://vercel.com/docs/bot-management) and [rate-limit rule availability](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting).

Set usage alerts on Vercel and Neon. During an attack, enable **Attack Challenge Mode** in Vercel's Firewall. To stop online work entirely, set the server variable `API_PAUSED=1` and redeploy; the demo and downloads remain local, while cron cleanup remains authorized separately. Remove the variable and redeploy to resume. Platform bandwidth, invocation charges, and provider limits still apply.

Driving bypasses application rate counters. TypeSafe still controls its own limits. The other routes use these fixed-window budgets:

| Scope                      | Budget                                          |
| -------------------------- | ----------------------------------------------- |
| Project API admissions     | 300/minute, 12,000/day, 250,000/calendar month  |
| IP                         | 120/minute, 3,000/day                           |
| New browser sessions       | 20/IP/hour, 300/project/day                     |
| Model catalog per browser  | 6/minute, 50/day                                |
| Archive writes per browser | 6/minute, 100/day                               |
| Archive reads per browser  | 30/minute, 400/day                              |
| Uploaded recording JSON    | 10 MB/browser/day, 50 MB/project/calendar month |

UTC defines day and month boundaries. These conservative defaults live in `server/traffic.js`; they aren't promises about a provider's free allowance. An attacker can exhaust a global budget and pause online features until it resets. Users behind one IP share its limits. Upload budgets count every accepted snapshot's JSON bytes, including overwrites, rather than just stored data. Existing signed-session status checks skip the database; invalid requests fail before admission. A rejected admission may consume other counters, but it can't create new visitor rows after global exhaustion. The API returns `Retry-After`; the client waits and doesn't automatically replay a failed paid batch.

Keep body/header logging off for these endpoints. A visitor must trust the operator of a BYOK website: the server sees the credential while forwarding it. If you add analytics, don't record input fields, prompts, request bodies, or headers.

The archive uses browser identity, with no sign-in or recovery. If you need cross-device access, add an authentication provider and map its verified server-side user ID to the archive owner. Don't replace this with a client-supplied user ID or trust the OpenAI Sites identity header on Vercel.

## Troubleshooting

**“Cloud archive setup is incomplete”:** run the current `db/postgres/001_archive.sql` against the database connected through `DATABASE_URL`. This message means the expected table or column is missing.

**503 on `/api/status`:** check whether `API_PAUSED` is enabled; otherwise check the server variables, confirm the SQL ran, and redeploy. The app hides database exception text because it can contain connection details or user data.

**403:** the request origin doesn't match `APP_ORIGIN`, or a mutation came from another site. Use your canonical URL.

**401 after returning later:** reload to create a browser session. An expired, cleared, or invalid cookie can't recover the old archive.

**409 while saving:** the browser archive reached 50 races or 50 MB. Delete an old race, then retry the save.

**429:** respect the response's `Retry-After` delay; daily and monthly budgets can take longer than a minute to reset. If TypeSafe sent the limit, inspect your TypeSafe account separately.

## References

The deployment uses Vercel's [Node.js Web Standard handler](https://vercel.com/docs/functions/runtimes/node-js), [rewrites](https://vercel.com/docs/routing/rewrites), and [cron authorization](https://vercel.com/docs/cron-jobs/manage-cron-jobs). Neon documents its [HTTP query driver](https://neon.com/docs/serverless/serverless-driver). Vercel overwrites [forwarded client IP headers](https://vercel.com/docs/headers/request-headers); only use this adapter behind that trusted edge.

## Public showcase

The published site contains the project, recorded races, prompt evolution and results. There is no admin page or public race-creation screen. The API still requires signed admin credentials before accepting inference or race creation requests.

The landing-page clip comes from the recorded Season 01 final. Watching the site does not call TypeSafe.
