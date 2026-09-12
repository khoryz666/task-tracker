# Task Tracker

A local-first task tracker for coursework and dev projects. Installable as a
PWA on desktop and mobile, works fully offline, and needs no server to run.
Optional automatic cross-device sync (via a private GitHub gist) and
Groq-written reminder notifications (via Web Push) are opt-in, self-hosted
add-ons - everything works without them.

No accounts, no database, no framework. Just static files, `tsc`, and
(if you want them) two things GitHub already gives you for free: gists and
Actions.

## Quick start

```sh
direnv allow        # or: nix develop
./build.sh           # compiles web/src/*.ts -> web/dist, and the service worker
./serve.sh            # http://localhost:8000 (service workers need http(s), not file://)
```

Open the URL, install it ("Install app" in Chrome/Edge, "Add to Home Screen"
on mobile), and start adding tasks. That's the whole app - everything below
is optional.

## How it's built

- **No backend.** All data lives in the browser's IndexedDB. `web/src/*.ts`
  compiles straight to native ES modules with `tsc` - no bundler, no
  framework, no `node_modules` for the app itself.
- **No build server.** `flake.nix` pins Node + TypeScript via Nix so the
  toolchain never drifts; `direnv` loads it automatically in this directory.
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

## Deploying somewhere your phone can reach

Since it's static files, any static host works - GitHub Pages, Netlify, or
just copying `web/` (after `./build.sh`) onto a USB stick. For GitHub Pages:

1. Push `web/` (built) to a `gh-pages` branch, or point Pages at `web/` on
   `main` via repo Settings -> Pages.
2. Visit the published URL on your phone and "Add to Home Screen".

No server-side config, no environment variables needed for the app itself.

## Enabling automatic cross-device sync

Sync uses a private GitHub gist as the shared point between your devices -
no new account, no server.

1. Create a token at <https://github.com/settings/tokens> (classic token,
   scope: **gist** only - nothing else).
2. Open the app -> **Sync settings** -> paste the token -> **Save & sync**.
   The app creates a private gist on first sync and remembers its id.
3. Repeat on your other device with the *same* token. From then on, tasks
   sync automatically on edit, on tab focus, and every few minutes while the
   app is open, plus a manual **Sync now** button.

Export/Import (JSON file) still work independently, for backups or one-off
transfers.

## Enabling reminder notifications

A closed browser tab can't wake itself up, so real "remind me even if I
haven't opened the app" notifications need something external to trigger
them. This project uses a scheduled **GitHub Actions** workflow instead of a
server: it runs on GitHub's infrastructure, reads your synced gist, and
sends a real Web Push notification.

**One-time setup:**

1. **Generate a VAPID keypair** (used to sign push messages):
   ```sh
   npx web-push generate-vapid-keys
   ```
2. Put the **public** key in `web/src/config.ts` (`VAPID_PUBLIC_KEY`) and
   rebuild/redeploy. The public key is safe to commit.
3. In the app, do at least one sync (above) so a gist exists. **Sync
   settings** then shows a "View sync gist" link - its id (the part of the
   URL after `gist.github.com/`) is your `GIST_ID`.
4. In the app, click **Enable notifications** (in Sync settings) on each
   device you want reminders on.
5. Get a free API key from <https://console.groq.com/keys> (used to write
   the short encouraging message; the reminder still works without it, with
   a plainer canned message).
6. In your repo, go to **Settings -> Secrets and variables -> Actions** and
   add these repository secrets:

   | Secret | Value |
   |---|---|
   | `GIST_PAT` | the same token from step 1 of sync setup (scope: gist) |
   | `GIST_ID` | the gist id from step 3 above |
   | `VAPID_PUBLIC_KEY` | from step 1 |
   | `VAPID_PRIVATE_KEY` | from step 1 - keep this one secret, never commit it |
   | `VAPID_CONTACT_EMAIL` | any contact email (required by the Web Push spec) |
   | `GROQ_API_KEY` | from step 5 (optional but recommended) |

The `Task reminder` workflow (`.github/workflows/reminder.yml`) then runs
daily, picks your most urgent task due within 3 days (critical tasks first),
and pushes a short nudge to every device you enabled notifications on. Adjust
the cron schedule in that file if you want a different time.

A separate `Keepalive` workflow makes a trivial monthly commit so GitHub
never auto-disables the scheduled reminder after 60 days of inactivity - no
manual attention needed.

## Extending it

Everything is plain TypeScript with no framework lock-in - add a field to
`Task` in `types.ts`, handle it in `store.ts`, and surface it in the UI.
Existing local data keeps working since IndexedDB records are just objects;
new optional fields don't require a migration.
