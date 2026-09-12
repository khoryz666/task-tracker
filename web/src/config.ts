// Generate a keypair with `npx web-push generate-vapid-keys` (see README).
// The public key is safe to embed here. The private key goes only into the
// GitHub Actions secret used by the reminder workflow - never put it here.
export const VAPID_PUBLIC_KEY = "BGa4cxsWRw5Ui4qi7lvZl7IIwYTCqXAR7I8x7YHE78XhEDeUKFGTUtOwHlO47siZ53pJ_nYj3Jjvt03J3l3xIpk";

// "owner/repo" of your dedicated PRIVATE data repo (created by setup.sh).
// Not sensitive - it's just an address, not a credential - so it's safe to
// commit here. Read/write access is what the token you paste in Settings
// controls, scoped to only this repo.
export const DATA_REPO = "khoryz666/task-tracker-data";
