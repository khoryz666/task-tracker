# Task Tracker

A local-first task tracker for coursework and dev projects. Installable as a
PWA on desktop and mobile, works fully offline, and needs no server to run.
Automatic cross-device sync and Groq-written reminder notifications are one
script away.

No accounts, no database, no framework. Just static files, `tsc`, and two
things GitHub already gives you for free: private repos and Actions.

## Try it locally

```sh
direnv allow        # or: nix develop
./build.sh           # compiles web/src/*.ts -> web/dist, and the service worker
./serve.sh            # http://localhost:8000 (service workers need http(s), not file://)
```

## Get it running on your devices (one command)

This deploys your own copy to GitHub Pages and wires up sync + notifications.
Requires `gh` (provided by the dev shell, logged in) and this repo pushed to
your own GitHub account.

```sh
./setup.sh
```

It creates a **second, private repo** (`<this-repo>-data`) that holds your
tasks - kept separate from this app's code on purpose, so a token scoped to
it can't touch anything else, not even this repo. It will prompt you for:

- a **Groq API key** (optional - free at <https://console.groq.com/keys>) -
  used to write the short encouraging line in reminders; skip it and
  reminders still work with a plainer canned message
- a **fine-grained GitHub token**, scoped to only the new data repo - this is
  the one thing that can't be automated (GitHub deliberately never lets a
  script mint a token on your behalf), so the script prints the exact repo
  to select and the exact permission to grant, then pauses for you to paste
  it back in

Everything else is automatic: creating the data repo, generating a
push-notification keypair, setting all the GitHub Actions secrets, turning
on GitHub Pages, and pushing. A minute or two later your app is live. At the
end it prints the token again for the next step.

Then, on **each device** (desktop and mobile): open the URL, install it
("Install app" in Chrome/Edge, "Add to Home Screen" on mobile), open
**Settings** (gear icon), and paste that token. That's the only manual step
per device - it's what lets that device read/write your synced tasks and
subscribe to reminders, and it can't be automated away for a backend-less
app (a browser page needs its own credential; it can't reach your local `gh`
session or SSH agent).

Re-running `./setup.sh` later is safe - it reuses the existing data repo
(never re-seeding or wiping it) and just updates secrets/config.

## Why a second private repo, not a gist

Gists were the first design here, and they have a hard ceiling: GitHub has
no way to scope a token to *one* gist - a gist-scoped token always grants
access to *all* your gists. A fine-grained personal access token, on the
other hand, **can** be scoped to exactly one repository with exactly one
permission (`Contents: read/write`) - so that's what this uses instead. The
data repo is deliberately a separate repo from this app's code, so even a
fully compromised token can't touch the app's source or its deploy workflow
(which has `pages: write` - a much scarier thing to expose than a JSON
file). A leaked sync token here can only ever read/write your task data,
nothing else in your GitHub account.

## How it's built

- **No backend.** All data lives in the browser's IndexedDB. `web/src/*.ts`
  compiles straight to native ES modules with `tsc` - no bundler, no
  framework, no `node_modules` for the app itself.
- **No build server locally.** `flake.nix` pins Node + TypeScript + `gh` via
  Nix so the toolchain never drifts; `direnv` loads it automatically here.
- **No deploy step either.** `.github/workflows/deploy.yml` builds and
  publishes to GitHub Pages on every push to `main`.
- **Offline by default.** `web/sw-src/sw.ts` precaches the app shell; after
  the first load, the app works with no network at all.

Data model, storage, and UI layers:

```
web/src/types.ts        Task shape
web/src/db.ts            IndexedDB primitives
web/src/store.ts         in-memory cache + pub/sub, used by the UI
web/src/ui/*.ts           task list, dashboard, settings panel
web/src/export.ts        manual JSON backup / transfer
web/src/data-repo.ts      generic private-repo file read/write (Contents API)
web/src/sync.ts           auto cross-device sync (tasks.json)
web/src/push.ts           Web Push subscription management
```

## What `setup.sh` actually does

For transparency, in order:

1. Creates a private `<repo>-data` repo via `gh repo create` (skips this and
   the next step if it already exists, so re-running never wipes data).
2. Seeds `tasks.json` and `subscriptions.json` in it.
3. Generates a VAPID keypair (`npx web-push generate-vapid-keys`) for signing
   push notifications.
4. Prints exact instructions for creating a fine-grained token scoped to
   only the data repo, and verifies the pasted-back token can actually read
   it before continuing.
5. Sets repo secrets/variables via `gh secret set` / `gh variable set`:
   `DATA_REPO_PAT`, `DATA_REPO`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
   `VAPID_CONTACT_EMAIL` (from your git config), and `GROQ_API_KEY` if given.
6. Enables GitHub Pages with "Deploy from GitHub Actions" as the source.
7. Writes `VAPID_PUBLIC_KEY` and `DATA_REPO` into `web/src/config.ts` (both
   safe to commit - neither is a secret) and pushes that one commit, which
   triggers the deploy workflow.

The fine-grained token is only ever printed to your terminal (for you to
paste into each browser), stored in each browser's local storage after
that, and stored in your repo's encrypted Actions secrets - never committed
to the repo.

## Sync and notifications, once set up

- **Sync**: automatic on edit (debounced), on tab focus, and every few
  minutes while the app is open, plus a manual **Sync now** button. Writes
  use the Contents API's optimistic concurrency (the file's current `sha`),
  retrying on a conflict by re-reading and re-merging - so two devices
  syncing at once can't silently clobber each other's write. Merge itself is
  last-write-wins per task, including deletes.
- **Notifications**: a daily GitHub Actions workflow
  (`.github/workflows/reminder.yml`) reads your synced tasks from the data
  repo, picks the most urgent one due within 3 days (critical first), asks
  Groq for a short encouraging line, and pushes it to every device you
  enabled notifications on. Adjust the cron schedule in that file for a
  different time.
- A separate `keepalive.yml` workflow makes a trivial monthly commit **to
  this app repo** (not the data repo) so GitHub never auto-disables the
  scheduled reminder after 60 days of inactivity - no manual attention
  needed, ever.
- **Export/Import** (JSON file) still work independently of all the above,
  for manual backups or one-off transfers.

## A note on privacy

GitHub Pages sites are publicly reachable at their URL (anyone with the link
can open the app shell - it's just code, no data or secrets in it). The
fine-grained token used for sync can only read/write your private data repo
- nothing else in your GitHub account - but treat it like a password
regardless, since it can still read/rewrite all of your task data. Task data
itself only ever leaves your device via that repo, readable only with that
token.

## Extending it

Everything is plain TypeScript with no framework lock-in - add a field to
`Task` in `types.ts`, handle it in `store.ts`, and surface it in the UI.
Existing local data keeps working since IndexedDB records are just objects;
new optional fields don't require a migration.
