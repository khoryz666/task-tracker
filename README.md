# Task Tracker

A local-first task tracker for coursework and dev projects. Installable as a
PWA on desktop and mobile, works fully offline, and needs no server to run.
Automatic cross-device sync (via a private GitHub gist) and Groq-written
reminder notifications (via Web Push) are one script away.

No accounts, no database, no framework. Just static files, `tsc`, and two
things GitHub already gives you for free: gists and Actions.

## Try it locally

```sh
direnv allow        # or: nix develop
./build.sh           # compiles web/src/*.ts -> web/dist, and the service worker
./serve.sh            # http://localhost:8000 (service workers need http(s), not file://)
```

## Get it running on your devices (one command)

This deploys your own copy to GitHub Pages and wires up sync + notifications.
Requires `gh` (provided by the dev shell) and this repo pushed to your own
GitHub account. You do **not** need to manually create a GitHub token, even
if your machine only has SSH keys set up for git - `setup.sh` uses your `gh`
CLI session for that (see "SSH vs. tokens" below).

```sh
./setup.sh
```

If `gh` isn't logged in yet, it opens your browser to sign you in (and, if
needed, to grant the `gist` scope). The only thing it will actually prompt
you to type is:

- a **Groq API key** (optional - free at <https://console.groq.com/keys>) -
  used to write the short encouraging line in reminders; skip it and
  reminders still work with a plainer canned message

Everything else is automatic: it generates a push-notification keypair,
creates your private sync gist, sets all the GitHub Actions secrets, turns
on GitHub Pages, and pushes. A minute or two later your app is live. At the
end it prints a token to paste into the app - see the next step.

Then, on **each device** (desktop and mobile): open the URL, install it
("Install app" in Chrome/Edge, "Add to Home Screen" on mobile), open **Sync
settings**, and paste that token. That's the only manual step per device -
it's what lets that device read/write your synced tasks and subscribe to
reminders, and it can't be automated away for a backend-less app without
weakening what "totally local" means (a browser page can't reach your local
SSH agent or `gh` session - it needs its own credential).

Re-running `./setup.sh` later is safe - it reuses your existing gist and
just updates secrets/config.

### SSH vs. tokens

SSH keys (`ssh-add`) authenticate `git push`/`git clone` over the SSH
protocol - `setup.sh`'s own `git push` step already rides on that if your
remote is `git@github.com:...`. But the sync gist and Actions secrets are
plain HTTPS calls to GitHub's REST API, which is a different protocol that
needs a bearer token, not an SSH key. Rather than making you mint a classic
Personal Access Token by hand, `setup.sh` reuses your `gh` CLI's own OAuth
token (`gh auth token`), requesting the `gist` scope on it if it doesn't
have it yet. The one tradeoff: that token also carries `gh`'s other default
scopes (`repo`, `workflow`, etc.), which is broader than a gist-only classic
token would be. If you'd rather hand it a narrower token yourself, export
`GIST_PAT` before running the script and it'll use that instead.

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
web/src/types.ts     Task shape
web/src/db.ts         IndexedDB primitives
web/src/store.ts      in-memory cache + pub/sub, used by the UI
web/src/ui/*.ts        task list, dashboard, settings panel
web/src/export.ts     manual JSON backup / transfer
web/src/gist.ts        generic private-gist file read/write
web/src/sync.ts        auto cross-device sync (tasks.json)
web/src/push.ts        Web Push subscription management
```

## What `setup.sh` actually does

For transparency, in order:

1. Makes sure `gh` is logged in and its token has the `gist` scope
   (`gh auth login` / `gh auth refresh` - both interactive browser prompts,
   never a typed token).
2. Generates a VAPID keypair (`npx web-push generate-vapid-keys`) for signing
   push notifications.
3. Creates a private gist (`tasks.json`) via the GitHub API using that token.
4. Sets repo secrets via `gh secret set`: `GIST_PAT` (the `gh` token),
   `GIST_ID`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_CONTACT_EMAIL`
   (from your git config), and `GROQ_API_KEY` if you gave one.
5. Enables GitHub Pages with "Deploy from GitHub Actions" as the source.
6. Writes the VAPID public key into `web/src/config.ts` (safe to commit -
   it's public by design) and pushes that one commit, which triggers the
   deploy workflow.

Nothing is sent anywhere except to GitHub's own APIs, using your `gh`
session's token. That token is only ever printed once (for you to paste into
the browser), stored in each browser's local storage after that, and stored
in your repo's encrypted Actions secrets - never committed to the repo.

## Sync and notifications, once set up

- **Sync**: automatic on edit (debounced), on tab focus, and every few
  minutes while the app is open, plus a manual **Sync now** button. Merge is
  last-write-wins per task, including deletes.
- **Notifications**: a daily GitHub Actions workflow
  (`.github/workflows/reminder.yml`) reads your synced tasks, picks the most
  urgent one due within 3 days (critical first), asks Groq for a short
  encouraging line, and pushes it to every device you enabled notifications
  on. Adjust the cron schedule in that file for a different time.
- A separate `keepalive.yml` workflow makes a trivial monthly commit so
  GitHub never auto-disables the scheduled reminder after 60 days of
  inactivity - no manual attention needed, ever.
- **Export/Import** (JSON file) still work independently of all the above,
  for manual backups or one-off transfers.

## A note on privacy

GitHub Pages sites are publicly reachable at their URL (anyone with the link
can open the app shell), and the token this uses grants access to *all* your
gists (plus `gh`'s other default scopes - see "SSH vs. tokens" above), not
just this app's data - treat it like a password. Task data itself only ever
leaves your device via your own private gist, readable only with that token.

## Extending it

Everything is plain TypeScript with no framework lock-in - add a field to
`Task` in `types.ts`, handle it in `store.ts`, and surface it in the UI.
Existing local data keeps working since IndexedDB records are just objects;
new optional fields don't require a migration.
