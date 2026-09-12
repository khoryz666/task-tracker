// Generate a keypair with `npx web-push generate-vapid-keys` (see README).
// The public key is safe to embed here. The private key goes only into the
// GitHub Actions secret used by the reminder workflow - never put it here.
export const VAPID_PUBLIC_KEY = "REPLACE_WITH_YOUR_VAPID_PUBLIC_KEY";

// "owner/repo" of your dedicated PRIVATE data repo (created by setup.sh).
// Not sensitive - it's just an address, not a credential - so it's safe to
// commit here. Read/write access is what the token you paste in Settings
// controls, scoped to only this repo.
export const DATA_REPO = "REPLACE_WITH_YOUR_DATA_REPO";
