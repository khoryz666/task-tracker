#!/usr/bin/env bash
# One-time setup: creates the sync gist, generates push notification keys,
# configures GitHub Actions secrets, and turns on GitHub Pages. Safe to
# re-run (it reuses/updates existing config instead of duplicating it).
set -euo pipefail
cd "$(dirname "$0")"

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
step() { bold "-> $1"; }

bold "Task Tracker setup"
echo "This wires up automatic sync + reminder notifications for your own copy"
echo "of this repo. Run it from inside 'nix develop' (or 'direnv allow')."
echo

for cmd in gh node curl git; do
  command -v "$cmd" >/dev/null || { echo "Missing '$cmd'. Run this inside 'nix develop'."; exit 1; }
done

gh auth status >/dev/null 2>&1 || { echo "Run 'gh auth login' first, then re-run this script."; exit 1; }

REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null) || {
  echo "Couldn't detect a GitHub repo for this directory."
  echo "Push it to GitHub first (e.g. 'gh repo create --source=. --push'), then re-run."
  exit 1
}
echo "Repo: $REPO"
echo

read -rsp "GitHub personal access token (classic, scope: gist only - create one at https://github.com/settings/tokens): " GIST_PAT
echo
[ -n "$GIST_PAT" ] || { echo "A token is required."; exit 1; }

read -rsp "Groq API key (optional, for AI-written reminders - https://console.groq.com/keys) [Enter to skip]: " GROQ_API_KEY
echo
echo

EMAIL=$(git config user.email 2>/dev/null || true)
EMAIL=${EMAIL:-example@example.com}

step "1/5 Generating a VAPID keypair for push notifications"
VAPID_JSON=$(npx --yes web-push@3 generate-vapid-keys --json)
VAPID_PUBLIC_KEY=$(node -e 'console.log(JSON.parse(process.argv[1]).publicKey)' "$VAPID_JSON")
VAPID_PRIVATE_KEY=$(node -e 'console.log(JSON.parse(process.argv[1]).privateKey)' "$VAPID_JSON")

step "2/5 Creating your private sync gist"
GIST_RESPONSE=$(curl -sf -X POST https://api.github.com/gists \
  -H "Authorization: Bearer $GIST_PAT" \
  -H "Accept: application/vnd.github+json" \
  -d '{"description":"task-tracker sync data (do not edit by hand)","public":false,"files":{"tasks.json":{"content":"{\"version\":1,\"tasks\":[]}"}}}') \
  || { echo "Gist creation failed - check that the token has the 'gist' scope."; exit 1; }
GIST_ID=$(node -e 'console.log(JSON.parse(process.argv[1]).id)' "$GIST_RESPONSE")
echo "   https://gist.github.com/$GIST_ID"

step "3/5 Setting GitHub Actions secrets on $REPO"
gh secret set GIST_PAT --repo "$REPO" --body "$GIST_PAT"
gh secret set GIST_ID --repo "$REPO" --body "$GIST_ID"
gh secret set VAPID_PUBLIC_KEY --repo "$REPO" --body "$VAPID_PUBLIC_KEY"
gh secret set VAPID_PRIVATE_KEY --repo "$REPO" --body "$VAPID_PRIVATE_KEY"
gh secret set VAPID_CONTACT_EMAIL --repo "$REPO" --body "$EMAIL"
if [ -n "$GROQ_API_KEY" ]; then
  gh secret set GROQ_API_KEY --repo "$REPO" --body "$GROQ_API_KEY"
else
  echo "   (skipped GROQ_API_KEY - reminders will use a plain canned message)"
fi

step "4/5 Enabling GitHub Pages (deployed via Actions)"
gh api -X POST "repos/$REPO/pages" -f build_type=workflow >/dev/null 2>&1 || true

step "5/5 Embedding the VAPID public key and publishing"
node -e '
const fs = require("fs");
const path = "web/src/config.ts";
const key = process.argv[1];
const content = fs.readFileSync(path, "utf8")
  .replace(/export const VAPID_PUBLIC_KEY = ".*";/, `export const VAPID_PUBLIC_KEY = "${key}";`);
fs.writeFileSync(path, content);
' "$VAPID_PUBLIC_KEY"

git add web/src/config.ts
if ! git diff --cached --quiet; then
  git commit -m "chore: configure VAPID public key" >/dev/null
  git push
  echo "   Pushed - the Deploy workflow will publish it shortly."
else
  echo "   (already configured)"
fi

PAGES_URL=$(gh api "repos/$REPO/pages" -q .html_url 2>/dev/null || echo "")

echo
bold "Done."
if [ -n "$PAGES_URL" ]; then
  echo "Your app will be live at: $PAGES_URL"
else
  echo "Check Settings -> Pages on GitHub for your app's URL once the Deploy workflow finishes."
fi
echo
echo "On each device (desktop and mobile): open that URL, install it, open"
echo "Sync settings, and paste the same GitHub token you entered above."
echo "That enables sync and lets you turn on notifications there."
