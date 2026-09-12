import { VAPID_PUBLIC_KEY } from "./config.js";
import { updateRepoFile } from "./data-repo.js";
import { getGithubToken } from "./settings.js";

const SUBSCRIPTIONS_PATH = "subscriptions.json";

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
  if (!token) return { ok: false, message: "Set up sync first - your subscription is stored in the same data repo." };
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
  const json = sub.toJSON() as PushSubscriptionJSON;

  await updateRepoFile<SubscriptionsFile>(token, SUBSCRIPTIONS_PATH, { version: 1, subscriptions: [] }, (file) => ({
    version: 1,
    subscriptions: [...file.subscriptions.filter((s) => s.endpoint !== json.endpoint), json],
  }));

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
  if (!token) return;
  await updateRepoFile<SubscriptionsFile>(token, SUBSCRIPTIONS_PATH, { version: 1, subscriptions: [] }, (file) => ({
    version: 1,
    subscriptions: file.subscriptions.filter((s) => s.endpoint !== endpoint),
  }));
}
