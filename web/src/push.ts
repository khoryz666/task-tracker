import { VAPID_PUBLIC_KEY } from "./config.js";
import { ensureGist, getGistFile, putGistFile } from "./gist.js";
import { getGistId, getGithubToken } from "./settings.js";

const SUBSCRIPTIONS_FILE = "subscriptions.json";

interface SubscriptionsFile {
  version: number;
  subscriptions: PushSubscriptionJSON[];
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(safe);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export function pushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function isSubscribed(): Promise<boolean> {
  if (!pushSupported()) return false;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return sub !== null;
}

export async function enableNotifications(): Promise<{ ok: boolean; message: string }> {
  const token = getGithubToken();
  if (!token) return { ok: false, message: "Set up sync first - your subscription is stored in the same gist." };
  if (!pushSupported()) return { ok: false, message: "Push notifications aren't supported in this browser." };
  if (VAPID_PUBLIC_KEY.startsWith("REPLACE_")) {
    return { ok: false, message: "VAPID public key not configured yet (see README)." };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, message: "Notification permission was denied." };

  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });

  const gistId = await ensureGist(token);
  const file = await getGistFile<SubscriptionsFile>(token, gistId, SUBSCRIPTIONS_FILE, {
    version: 1,
    subscriptions: [],
  });
  const json = sub.toJSON() as PushSubscriptionJSON;
  file.subscriptions = [...file.subscriptions.filter((s) => s.endpoint !== json.endpoint), json];
  await putGistFile(token, gistId, SUBSCRIPTIONS_FILE, file);

  return { ok: true, message: "Notifications enabled on this device." };
}

export async function disableNotifications(): Promise<void> {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();

  const token = getGithubToken();
  const gistId = getGistId();
  if (!token || !gistId) return;
  const file = await getGistFile<SubscriptionsFile>(token, gistId, SUBSCRIPTIONS_FILE, {
    version: 1,
    subscriptions: [],
  });
  file.subscriptions = file.subscriptions.filter((s) => s.endpoint !== endpoint);
  await putGistFile(token, gistId, SUBSCRIPTIONS_FILE, file);
}
