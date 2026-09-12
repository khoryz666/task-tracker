# Task Tracker

A local-first task tracker for coursework and dev projects. Installable as a
PWA on desktop and mobile, works fully offline, and needs no server to run.
Automatic cross-device sync and Groq-written reminder notifications are one
command away, self-hosted entirely on infrastructure you already have a
GitHub account for.

This repo contains only static files, `tsc`, 
and two things in GitHub for free: private repos and GitHub Actions.

---

## 1. Before you start

- **Fork this repo to your own GitHub account**
  
- **Nix, with flakes enabled, plus direnv and nix-direnv.** `flake.nix`
  pins every tool this project needs - Node, TypeScript, `gh`, Python -
  so nothing is installed manually. If you don't already have Nix/flakes/direnv set up, 
  follow **section 1** of [khoryz666/nix-template](https://github.com/khoryz666/nix-template) for the full walkthrough.

- Once that's in place, from inside your forked clone:

  ```sh
  cd <your-forked-repo-directory>
  direnv allow
  ```

  This loads the pinned dev shell automatically every time you `cd` into
  the directory - no `nix develop` typed by hand, nothing installed
  globally on your machine.

---

## 2. Setup: one command, one manual step

```sh
npm run setup
```

This wraps `setup.sh` and needs `gh` logged in (it'll prompt you to log in
if not) and your fork already pushed to GitHub (done in step 1).

It will ask you for two things:

- a **Groq API key** (optional, free at <https://console.groq.com/keys>) -
  writes the short encouraging line in reminders; skip it and reminders
  still work with a plainer canned message.
- a **fine-grained GitHub token**, scoped to only a new private data repo
  it creates for you (`<your-fork>-data`), set to **No expiration** - this
  is meant to be set-and-forget, not renewed periodically. This is the
  **only thing that can't be automated** - GitHub deliberately never lets a
  script mint a token on your behalf - so the script prints the exact
  repo to select and the exact permission to grant (`Contents: read and
  write`), then pauses for you to paste the generated token back in. It
  verifies the token actually works before continuing.

Everything else is automatic, in order:

1. Creates the private `<your-fork>-data` repo and seeds it with empty
   `tasks.json`/`subscriptions.json`.
2. Generates a VAPID keypair for push notifications.
3. Waits for your fine-grained token, verifies it.
4. Sets GitHub Actions secrets/variables: `DATA_REPO_PAT`, `DATA_REPO`,
   `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_CONTACT_EMAIL` (from your
   git config), and `GROQ_API_KEY` if you gave one.
5. Enables GitHub Pages ("Deploy from GitHub Actions").
6. Writes `VAPID_PUBLIC_KEY` and `DATA_REPO` into `web/src/config.ts`
   (both safe to commit - neither is a secret) and pushes that commit,
   which triggers the deploy workflow.

A minute or two later your app is live. The script prints the URL, and
prints the fine-grained token again for the last step:

**On each device** (desktop and mobile): open that URL, install it
("Install app" in Chrome/Edge, "Add to Home Screen" on mobile), open
**Settings** (gear icon), and paste the token. That's the only manual step
per device - a browser page can't reach your local `gh` session or SSH
agent, so it needs its own credential to read/write your synced tasks and
subscribe to reminders.

**On privacy**: that token can only read/write your one private data repo
- nothing else in your GitHub account, not your other repos, not this
app's code or its deploy workflow. Still, treat it like a password: anyone
holding it can read and rewrite all of your task data. GitHub Pages sites
are publicly reachable at their URL, but that's just code with no data or
secrets in it.

Re-running `npm run setup` after that is safe - it simply detects the existing data
repo and never re-seeds or wipes it, it just updates secrets/config.

---

## 3. Maintaining and migrating

**Nothing to maintain.** No server runs anywhere; the
`Keepalive` workflow (`.github/workflows/keepalive.yml`) makes a trivial
monthly commit purely so GitHub doesn't auto-disable the scheduled reminder
after 60 days of repo inactivity.

**How sync behaves:** automatic on edit (debounced a couple seconds), 
on tab focus, and every few minutes while the app is open, 
plus a manual **Sync now** button. Writes use the Contents API's optimistic concurrency (the file's current `sha`) 
and retry on a conflict by re-reading and re-merging, so two devices syncing at the
same moment can't silently clobber each other. The merge itself is last-write-wins per task, including deletes.

**The token doesn't expire** (setup has you pick "No expiration" when
creating it) - this is genuinely set-and-forget, not something to renew on
a schedule. You only need to replace it if you *want* to, e.g. you suspect
it leaked. If so: generate a new fine-grained token the same way setup
described (scoped to your `<fork>-data` repo, `Contents: read and write`,
no expiration), then:
- update it in **Settings** on each device,
- update the Actions secret: `gh secret set DATA_REPO_PAT --repo <your-fork> --body "<new token>"`, and
- revoke the old one at <https://github.com/settings/personal-access-tokens> - generating a new token doesn't invalidate the old one on its own.

**Migrating to a new device**: install the app from your Pages URL, open
Settings, paste your existing token - it'll pull your synced tasks
immediately. No re-running setup needed.

**Migrating away from GitHub entirely, or just backing up**: use **Export**
(top toolbar) to download all tasks as a plain JSON file at any time - this
is host-agnostic and doesn't depend on anything in this README staying
true. The data repo itself is also just a normal git repository with a
JSON file in it, so `git clone`-ing it (or downloading `tasks.json` from
GitHub's UI) is an equally valid way to get your data out in one piece.

**Moving the app itself to a different static host**: `web/` (after
`npm run build`) is plain static files - copy it anywhere. You'd point
sync at a different data repo by re-running setup against a fresh fork, or
by hand-editing `DATA_REPO` in `web/src/config.ts` and updating the
Actions secrets to match.

---

## 4. Uninstalling and deleting your data

1. **Export first** if you want to keep anything (top toolbar -> Export).
2. **Remove the installed app** from each device - same as uninstalling
   any PWA (long-press/right-click the icon -> uninstall or remove, or
   your browser's "installed apps" management page).
3. **Clear local site data** per device if you want IndexedDB fully wiped:
   browser settings -> site data/storage -> find the Pages URL's origin ->
   delete.
4. **Delete your data repo** on GitHub (`<your-fork>-data` -> Settings ->
   Delete this repository) - this permanently removes your synced task
   data from GitHub.
5. **Revoke the fine-grained token** at
   <https://github.com/settings/personal-access-tokens> (deleting the repo
   doesn't automatically revoke tokens scoped to it).
6. **Optional**: delete your forked app repo too, or just disable Pages
   (Settings -> Pages) and the two workflows (Actions tab -> select a
   workflow -> "..." -> Disable) if you'd rather keep the code around
   without anything running.

Everything above is scoped to your own copy only.

---

## 5. Repo layout, developing, and testing locally

```
web/src/types.ts        Task shape
web/src/db.ts            IndexedDB primitives
web/src/store.ts         in-memory cache + pub/sub, used by the UI
web/src/ui/*.ts           task list, dashboard, settings panel
web/src/export.ts        manual JSON backup / transfer
web/src/data-repo.ts      generic private-repo file read/write (Contents API)
web/src/sync.ts           auto cross-device sync (tasks.json)
web/src/push.ts           Web Push subscription management
web/sw-src/sw.ts          service worker (offline cache + push handling)
scripts/reminder/         the daily reminder job the Actions workflow runs
.github/workflows/        deploy.yml (Pages), reminder.yml (cron), keepalive.yml
```

**Dev loop**:

```sh
npm run build     # compiles web/src/*.ts -> web/dist, and the service worker
npm run serve     # http://localhost:8000 (service workers need http(s), not file://)
npm run dev       # both of the above, one after another
```

There's no file-watcher/live-reload - edit, `npm run build`, refresh the
browser tab. Since the service worker auto-reloads the page when a new
version takes over (see `register-sw.ts`), a normal refresh during
development is enough to pick up changes.

**Testing locally**: there's no automated test suite - this is a small
enough app that manual testing covers it. Useful checks:
- Add/edit/delete/duplicate a few tasks, confirm they persist across a
  page reload (IndexedDB).
- DevTools -> Application -> Service Workers: confirm it's registered and
  "activated"; toggle Network -> Offline and confirm the app still loads
  and works.
- To test sync/notifications for real, run `npm run setup` once (against a
  disposable fork if you don't want to touch your real one) and exercise
  the flow across two browser profiles or devices.
- To test the reminder job in isolation:
  ```sh
  npm run reminder:install
  DATA_REPO_PAT=<token> DATA_REPO=<owner>/<repo>-data \
  VAPID_PUBLIC_KEY=<key> VAPID_PRIVATE_KEY=<key> \
  npm run reminder:run
  ```

**Extending it**: everything is plain TypeScript with no framework lock-in.
