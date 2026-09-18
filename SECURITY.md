# Security notes

JEVRACE accepts a visitor's TypeSafe API key so that the visitor pays for their own race. The browser and hosting server both see that key while processing requests. Don't describe this as zero-trust or end-to-end encrypted.

## Credential handling

The browser keeps the key in JavaScript memory, clears password inputs after connecting, and doesn't write it to localStorage, sessionStorage, cookies, exports, or recordings. The server accepts it only in an Authorization header and forwards it to fixed HTTPS TypeSafe endpoints. Redirects fail rather than send it to another destination. Model discovery and decisions return `no-store`; errors never echo upstream exception text.

The production content policy allows scripts and connections from the same origin. Fonts ship with the app, and no analytics or session recorder runs in the page. Inline styles remain allowed because driver colors and Three.js layout use them. These controls limit exposure; an XSS bug, compromised dependency, malicious browser extension, or modified deployment could still read the key.

Clear disconnects future calls. It can't revoke a key at TypeSafe or cancel billing for a batch already accepted there. Revoke a suspected leak in TypeSafe's dashboard.

## Archive ownership on Vercel

An HMAC-signed, Secure, HttpOnly, SameSite=Strict cookie carries a random archive ID and a 90-day expiry. The `__Host-` prefix prevents domain-scoped cookie overrides. The backend verifies the signature before using that ID, ignores externally supplied Sites identity headers, and includes the owner in every archive query.

POST and DELETE require the configured same-origin Origin header. Cross-site fetches and unexpected hosts fail before any upstream request. All SQL uses separate parameters. Recording validation bounds incoming JSON at 3.5 MB and strips unexpected properties; a database function serializes saves for each owner before checking the 50-race and 50 MB quotas.

Rate counters live in Postgres. The IP counter uses an HMAC instead of retaining the raw address, and only trusts Vercel's edge-supplied forwarded header. Cookie rotation can't bypass that IP counter, although distributed clients can use multiple addresses. Project-wide limits also apply across addresses. These are admission budgets, not identity verification; an attacker can exhaust them and temporarily deny online features to everyone. The local demo remains available. Configure the platform firewall to reject traffic before it reaches functions.

## Work and traffic budgets

`server/traffic.js` defines the Vercel limits; [the deployment guide](docs/VERCEL.md) lists their values. A single Postgres statement increments bounded counters, including byte costs for uploads. Rejected requests can consume other counters in the same statement; the limiter deliberately doesn't refund work already attempted. Global limits gate creation of per-visitor counters to bound growth from rotating IPs. Failed admissions never reach TypeSafe or archive queries.

A warm function allows one concurrent decision per browser and eight overall. A shared 12-batch/10-second counter also applies across function instances. The local concurrency guard isn't a distributed lock. Timeouts bound each upstream batch to 12 seconds; a failed driver aborts the remaining requests, though TypeSafe may already have accepted and billed them. Bodies have a five-second read deadline, with 30 KB for Vercel decisions, 3.5 MB for recordings, and 256 KB for upstream JSON.

A warm function accepts at most four concurrent recording uploads, with one per browser; it reserves the slot before reading the body and releases it after handling the request. Known quota rejections skip body parsing. Negative quota caches last at most 60 seconds. Database errors trigger a ten-second pause within the affected warm function. Neither guard replaces the platform firewall: a cold function still runs, and distributed rejected requests can still query Postgres. Setting `API_PAUSED=1` and redeploying disables online features while leaving authenticated cleanup available.

These controls apply to the Vercel adapter. Local Vite is for development; the separate Sites adapter doesn't use the Postgres traffic budgets. Don't present a Sites deployment as having Vercel's firewall settings.

## Public replays

Recordings stay private until their owner publishes a finished race. The publish operation verifies the signed owner and requires a same-origin POST. Public queries return only published rows, replace the private race ID with a separate random public ID, and never return an owner ID or API credential. Publication includes the saved prompts; the confirmation dialog states this before submission. Unpublishing removes public access, but can't revoke copies someone already downloaded. The public listing returns at most 30 metadata records; replay frames load only when selected.

## What storage contains

Names, prompts, selected and resolved models, timing, and replay telemetry. Don't put credentials or private data in prompts. The application can catch the connected key in common input flows, but it can't recognize every secret someone types into arbitrary text.

The daily maintenance job deletes recordings after 90 days without an update and expired short-window counters. It retains the active calendar-month counters until the month ends. Database backups can retain earlier data according to the provider's retention policy. Losing the browser cookie loses access; the app has no account recovery.

## Operating the service

Keep `DATABASE_URL`, `SESSION_SECRET`, and `CRON_SECRET` server-only. Rotating `SESSION_SECRET` invalidates existing browser archive access. Use a separate database and secrets for previews, limit who can deploy, and review changes to API routes before merging them.

Don't enable request body or Authorization logging. Platform operators may still have access to runtime requests, and provider controls sit outside this codebase. The app deliberately suppresses raw database and upstream exception details in logs as well as responses.

CI runs tests, a build, and the production dependency audit. PGlite checks the actual Postgres statements in tests; a live Neon/Vercel deployment still needs the checks in [the deployment guide](docs/VERCEL.md). No code review or test suite can promise that a service has no vulnerabilities.

## Reporting a problem

For a suspected credential leak, revoke the affected key first. Contact the deployment operator privately and include the affected route, time, and steps to reproduce. Don't post credentials, cookies, network traces, or other visitors' data in a public issue.
