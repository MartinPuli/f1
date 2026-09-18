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

Run [`db/postgres/001_archive.sql`](../db/postgres/001_archive.sql) in Neon's SQL editor. It creates two tables, indexes, and a save function that checks storage quotas under a transaction lock. You can run it again without deleting existing races.

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

Enable Vercel firewall rules for `/api/*` and set usage alerts on both Vercel and Neon. The app allows 1,200 requests per IP per minute, then applies per-browser limits: 600 decision batches, 12 connection checks, or 120 archive/status requests per minute. A batch can contain five paid TypeSafe calls. Users behind one shared IP also share that first limit.

Keep body/header logging off for these endpoints. A visitor must trust the operator of a BYOK website: the server sees the credential while forwarding it. If you add analytics, don't record input fields, prompts, request bodies, or headers.

The archive uses browser identity, with no sign-in or recovery. If you need cross-device access, add an authentication provider and map its verified server-side user ID to the archive owner. Don't replace this with a client-supplied user ID or trust the OpenAI Sites identity header on Vercel.

## Troubleshooting

**503 on `/api/status`:** check the server variables, confirm the SQL ran, and redeploy. The app hides database exception text because it can contain connection details or user data.

**403:** the request origin doesn't match `APP_ORIGIN`, or a mutation came from another site. Use your canonical URL.

**401 after returning later:** reload to create a browser session. An expired, cleared, or invalid cookie can't recover the old archive.

**409 while saving:** the browser archive reached 50 races or 50 MB. Delete an old race, then retry the save.

**429:** wait a minute before resuming. If TypeSafe sent the limit, inspect your TypeSafe account separately.

## References

The deployment uses Vercel's [Node.js Web Standard handler](https://vercel.com/docs/functions/runtimes/node-js), [rewrites](https://vercel.com/docs/routing/rewrites), and [cron authorization](https://vercel.com/docs/cron-jobs/manage-cron-jobs). Neon documents its [HTTP query driver](https://neon.com/docs/serverless/serverless-driver). Vercel overwrites [forwarded client IP headers](https://vercel.com/docs/headers/request-headers); only use this adapter behind that trusted edge.
