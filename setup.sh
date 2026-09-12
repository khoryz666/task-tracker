#!/usr/bin/env bash
# One-time setup: creates a dedicated PRIVATE data repo, generates push
# notification keys, configures GitHub Actions secrets, and turns on GitHub
# Pages. Safe to re-run (it reuses existing config instead of duplicating
# it, and never re-seeds the data repo if it already exists).
set -euo pipefail
cd "$(dirname "$0")"

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
step() { bold "-> $1"; }
b64() { node -e 'console.log(Buffer.from(process.argv[1]).toString("base64"))' "$1"; }

bold "Task Tracker setup"
echo "This wires up automatic sync + reminder notifications for your own copy"
echo "of this repo. Run it from inside 'nix develop' (or 'direnv allow')."
echo

for cmd in gh node curl git; do
  command -v "$cmd" >/dev/null || { echo "Missing '$cmd'. Run this inside 'nix develop'."; exit 1; }
done

gh auth status >/dev/null 2>&1 || { echo "Not logged in yet - launching 'gh auth login'."; gh auth login -h github.com -w; }

REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null) || {
  echo "Couldn't detect a GitHub repo for this directory."
  echo "Push it to GitHub first (e.g. 'gh repo create --source=. --push'), then re-run."
  exit 1
}
OWNER=${REPO%%/*}
DATA_REPO="$OWNER/${REPO##*/}-data"
echo "App repo:  $REPO (public, just code - stays as is)"
echo "Data repo: $DATA_REPO (private - your tasks live here)"
echo

read -rsp "Groq API key (optional, for AI-written reminders - https://console.groq.com/keys) [Enter to skip]: " GROQ_API_KEY
echo
echo

EMAIL=$(git config user.email 2>/dev/null || true)
EMAIL=${EMAIL:-example@example.com}

step "1/6 Creating your private data repo"
DATA_REPO_IS_NEW=false
if gh repo view "$DATA_REPO" >/dev/null 2>&1; then
  echo "   $DATA_REPO already exists - reusing it, not touching its contents."
else
  gh repo create "$DATA_REPO" --private --description "task-tracker sync data (do not edit by hand)" >/dev/null
  DATA_REPO_IS_NEW=true
  echo "   Created https://github.com/$DATA_REPO"
fi

if [ "$DATA_REPO_IS_NEW" = true ]; then
  step "2/6 Seeding tasks.json and subscriptions.json"
  gh api -X PUT "repos/$DATA_REPO/contents/tasks.json" \
    -f message="init: seed tasks.json" -f content="$(b64 '{"version":1,"tasks":[]}')" >/dev/null
  gh api -X PUT "repos/$DATA_REPO/contents/subscriptions.json" \
    -f message="init: seed subscriptions.json" -f content="$(b64 '{"version":1,"subscriptions":[]}')" >/dev/null
else
  step "2/6 Skipping seed (data repo already has data)"
fi

step "3/6 Generating a VAPID keypair for push notifications"
VAPID_JSON=$(npx --yes web-push@3 generate-vapid-keys --json)
VAPID_PUBLIC_KEY=$(node -e 'console.log(JSON.parse(process.argv[1]).publicKey)' "$VAPID_JSON")
VAPID_PRIVATE_KEY=$(node -e 'console.log(JSON.parse(process.argv[1]).privateKey)' "$VAPID_JSON")

step "4/6 A fine-grained token, scoped to only the data repo (this part is manual - GitHub deliberately doesn't let any script mint tokens on your behalf)"
echo
echo "  1. Open: https://github.com/settings/personal-access-tokens/new"
echo "  2. Resource owner: $OWNER"
echo "  3. Expiration: No expiration (set-and-forget - a fine-grained token"
echo "     scoped to just this one repo is safe to leave permanent)"
echo "  4. Repository access: \"Only select repositories\" -> $DATA_REPO"
echo "  5. Permissions -> Repository permissions -> Contents: Read and write"
echo "     (Metadata: Read-only gets added automatically - that's fine, required)"
echo "  6. Generate, then paste it below."
echo
read -rsp "Fine-grained token: " DATA_REPO_PAT
echo
[ -n "$DATA_REPO_PAT" ] || { echo "A token is required."; exit 1; }

echo "   Verifying it can reach $DATA_REPO..."
curl -sf -H "Authorization: Bearer $DATA_REPO_PAT" -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/$DATA_REPO" >/dev/null \
  || { echo "Couldn't read $DATA_REPO with that token - check the repo/permissions and re-run."; exit 1; }

step "5/6 Setting GitHub Actions secrets/variables on $REPO"
gh secret set DATA_REPO_PAT --repo "$REPO" --body "$DATA_REPO_PAT"
gh variable set DATA_REPO --repo "$REPO" --body "$DATA_REPO"
gh secret set VAPID_PUBLIC_KEY --repo "$REPO" --body "$VAPID_PUBLIC_KEY"
gh secret set VAPID_PRIVATE_KEY --repo "$REPO" --body "$VAPID_PRIVATE_KEY"
gh secret set VAPID_CONTACT_EMAIL --repo "$REPO" --body "$EMAIL"
if [ -n "$GROQ_API_KEY" ]; then
  gh secret set GROQ_API_KEY --repo "$REPO" --body "$GROQ_API_KEY"
else
  echo "   (skipped GROQ_API_KEY - reminders will use a plain canned message)"
fi

step "5.5/6 Enabling GitHub Pages (deployed via Actions)"
gh api -X POST "repos/$REPO/pages" -f build_type=workflow >/dev/null 2>&1 || true

step "6/6 Embedding VAPID_PUBLIC_KEY + DATA_REPO and publishing"
node -e '
const fs = require("fs");
const path = "web/src/config.ts";
const [pubKey, dataRepo] = process.argv.slice(1);
let content = fs.readFileSync(path, "utf8");
content = content.replace(/export const VAPID_PUBLIC_KEY = ".*";/, `export const VAPID_PUBLIC_KEY = "${pubKey}";`);
content = content.replace(/export const DATA_REPO = ".*";/, `export const DATA_REPO = "${dataRepo}";`);
fs.writeFileSync(path, content);
' "$VAPID_PUBLIC_KEY" "$DATA_REPO"

git add web/src/config.ts
if ! git diff --cached --quiet; then
  git commit -m "chore: configure VAPID public key + data repo" >/dev/null
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
echo "Settings (gear icon), and paste this token (treat it like a password):"
echo
echo "  $DATA_REPO_PAT"
echo
echo "That enables sync and lets you turn on notifications there. This token"
echo "can only read/write $DATA_REPO - nothing else in your GitHub account,"
echo "not even your other gists or repos. Revoke/rotate it any time from"
echo "https://github.com/settings/personal-access-tokens."
