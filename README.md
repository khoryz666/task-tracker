# Task Tracker

A local-first task tracker for coursework and dev projects. Installable as a PWA (desktop + mobile), works fully offline, no server required. Optional cross-device sync and Groq-written reminder notifications, self-hosted entirely on GitHub free tier (private repos + Actions).

Only static files, `tsc`, and two free GitHub features: private repos and GitHub Actions.

---

## 1. Before you start

- **Fork this repo to your own GitHub account.**
- **Install Nix with flakes, direnv, and nix-direnv.** `flake.nix` pins all tools (Node, TypeScript, `gh`, Python). If you don't have these set up, follow **section 1** of [khoryz666/nix-template](https://github.com/khoryz666/nix-template).

Then, from your forked clone:

```sh
cd <your-forked-repo-directory>
direnv allow
```

This auto-loads the pinned dev shell on `cd` — no `nix develop`, nothing global.

---

## 2. Setup: one command, one manual step

```sh
npm run setup
```

Wraps `setup.sh`. Requires `gh` logged in and your fork already pushed.

It asks for two things:
- **Groq API key** (optional, free at <https://console.groq.com/keys>) — writes the encouraging line in reminders; skip and reminders still work with a canned message.
- **Fine-grained GitHub token**, scoped to a new private data repo it creates (`<your-fork>-data`), set to **No expiration**. This is the **only thing that can't be automated** — the script prints the exact repo and permission (`Contents: read and write`), then pauses for you to paste the token. It verifies the token before continuing.

Everything else is automatic:
1. Creates private `<your-fork>-data` repo seeded with empty `tasks.json`/`subscriptions.json`.
2. Generates a VAPID keypair.
3. Waits for and verifies your token.
4. Sets Actions secrets/variables: `DATA_REPO_PAT`, `DATA_REPO`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_CONTACT_EMAIL`, and `GROQ_API_KEY` if given.
5. Enables GitHub Pages ("Deploy from GitHub Actions").
6. Writes `VAPID_PUBLIC_KEY` and `DATA_REPO` into `web/src/config.ts` (both safe to commit) and pushes, triggering deploy.

A minute or two later the app is live. The script prints the URL and your token.

**On each device**: open the URL, install it ("Install app" in Chrome/Edge, "Add to Home Screen" on mobile), open **Settings** (gear icon), paste the token. That's the only manual step per device — a browser page can't reach your local `gh` session, so it needs its own credential.

**On privacy**: the token can only read/write your one private data repo — nothing else in your GitHub account. Treat it like a password: anyone holding it can read and rewrite all task data. Pages sites are publicly reachable at their URL, but contain only code, no data or secrets.

Re-running `npm run setup` is safe — it detects the existing data repo and never re-seeds or wipes it, just updates secrets/config.

---

## 3. Maintaining and migrating

**Nothing to maintain.** No server runs anywhere; the `Keepalive` workflow (`.github/workflows/keepalive.yml`) makes a trivial monthly commit so GitHub doesn't auto-disable the scheduled reminder after 60 days of inactivity.

**Sync behavior:** automatic on edit (debounced a couple seconds), on tab focus, every few minutes while open, plus a manual **Sync now** button. Writes use the Contents API's optimistic concurrency (file's current `sha`) and retry on conflict by re-reading and re-merging, so two devices syncing simultaneously can't silently clobber each other. Merge is last-write-wins per task, including deletes.

**The token doesn't expire** (setup has you pick "No expiration") — genuinely set-and-forget. Only replace it if you suspect it leaked. To replace:
- generate a new fine-grained token the same way (scoped to `<fork>-data`, `Contents: read and write`, no expiration),
- update it in **Settings** on each device,
- update the Actions secret: `gh secret set DATA_REPO_PAT --repo <your-fork> --body "<new token>"`,
- revoke the old one at <https://github.com/settings/personal-access-tokens> — generating a new token doesn't invalidate the old one automatically.

**Migrating to a new device**: install from your Pages URL, open Settings, paste your existing token — it pulls synced tasks immediately. No re-running setup.

**Migrating away from GitHub, or backing up**: use **Export** (top toolbar) to download all tasks as plain JSON at any time — host-agnostic, doesn't depend on this README. The data repo is also just a normal git repo with a JSON file, so `git clone`-ing it (or downloading `tasks.json` from GitHub's UI) is an equally valid way to get your data out.

**Moving the app to a different static host**: `web/` (after `npm run build`) is plain static files — copy it anywhere. Point sync at a different data repo by re-running setup against a fresh fork, or by hand-editing `DATA_REPO` in `web/src/config.ts` and updating the Actions secrets to match.

---

## 4. Uninstalling and deleting your data

1. **Export first** if you want to keep anything (top toolbar → Export).
2. **Remove the installed app** from each device — same as uninstalling any PWA (long-press/right-click the icon → uninstall or remove, or your browser's "installed apps" management page).
3. **Clear local site data** per device if you want IndexedDB fully wiped: browser settings → site data/storage → find the Pages URL's origin → delete.
4. **Delete your data repo** on GitHub (`<your-fork>-data` → Settings → Delete this repository) — permanently removes synced task data from GitHub.
5. **Revoke the fine-grained token** at <https://github.com/settings/personal-access-tokens> (deleting the repo doesn't automatically revoke tokens scoped to it).
6. **Optional**: delete your forked app repo too, or just disable Pages (Settings → Pages) and the two workflows (Actions tab → select a workflow → "..." → Disable) if you'd rather keep the code around without anything running.

Everything above is scoped to your own copy only.

---

## 5. Repo layout, developing, and testing locally

```
web/src/types.ts        Task shape
web/src/db.ts           IndexedDB primitives
web/src/store.ts        in-memory cache + pub/sub, used by the UI
web/src/ui/*.ts         task list, dashboard, settings panel
web/src/export.ts       manual JSON backup / transfer
web/src/data-repo.ts    generic private-repo file read/write (Contents API)
web/src/sync.ts         auto cross-device sync (tasks.json)
web/src/push.ts         Web Push subscription management
web/sw-src/sw.ts        service worker (offline cache + push handling)
scripts/reminder/       the daily reminder job the Actions workflow runs
.github/workflows/      deploy.yml (Pages), reminder.yml (cron), keepalive.yml
```

**Dev loop**:

```sh
npm run build     # compiles web/src/*.ts -> web/dist, and the service worker
npm run serve     # http://localhost:8000 (service workers need http(s), not file://)
npm run dev       # both of the above, one after another
```

No file-watcher/live-reload — edit, `npm run build`, refresh the browser tab. The service worker auto-reloads the page when a new version takes over (see `register-sw.ts`), so a normal refresh during development is enough to pick up changes.

**Testing locally**: no automated test suite — manual testing covers it. Useful checks:
- Add/edit/delete/duplicate a few tasks, confirm they persist across page reload (IndexedDB).
- DevTools → Application → Service Workers: confirm registered and "activated"; toggle Network → Offline and confirm the app still loads and works.
- To test sync/notifications for real, run `npm run setup` once (against a disposable fork if you don't want to touch your real one) and exercise the flow across two browser profiles or devices.
- To test the reminder job in isolation:
  ```sh
  npm run reminder:install
  DATA_REPO_PAT=<token> DATA_REPO=<owner>/<repo>-data \
  VAPID_PUBLIC_KEY=<key> VAPID_PRIVATE_KEY=<key> \
  npm run reminder:run
  ```

**Extending it**: everything is plain TypeScript with no framework lock-in.

---

Copyright © khoryz666. Source: <https://github.com/khoryz666/task-tracker>.
Licensed under the GNU GPLv3 — see [LICENSE](LICENSE).
