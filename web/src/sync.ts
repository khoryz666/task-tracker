import { getGistId, getGithubToken, setGistId } from "./settings.js";
import * as store from "./store.js";
import type { Task } from "./types.js";

const GIST_FILENAME = "tasks.json";
const GIST_DESCRIPTION = "task-tracker sync data (do not edit by hand)";
const API = "https://api.github.com";

interface SyncFile {
  version: number;
  tasks: Task[];
}

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
  };
}

async function createGist(token: string): Promise<string> {
  const body: SyncFile = { version: 1, tasks: [] };
  const res = await fetch(`${API}/gists`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      description: GIST_DESCRIPTION,
      public: false,
      files: { [GIST_FILENAME]: { content: JSON.stringify(body, null, 2) } },
    }),
  });
  if (!res.ok) throw new Error(`Could not create sync gist (HTTP ${res.status})`);
  const json = (await res.json()) as { id: string };
  setGistId(json.id);
  return json.id;
}

async function fetchGist(token: string, gistId: string): Promise<SyncFile> {
  const res = await fetch(`${API}/gists/${gistId}`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(`Could not fetch sync gist (HTTP ${res.status})`);
  const json = (await res.json()) as { files: Record<string, { content?: string } | undefined> };
  const content = json.files[GIST_FILENAME]?.content;
  if (!content) return { version: 1, tasks: [] };
  return JSON.parse(content) as SyncFile;
}

async function pushGist(token: string, gistId: string, tasks: Task[]): Promise<void> {
  const body: SyncFile = { version: 1, tasks };
  const res = await fetch(`${API}/gists/${gistId}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify({ files: { [GIST_FILENAME]: { content: JSON.stringify(body, null, 2) } } }),
  });
  if (!res.ok) throw new Error(`Could not push sync gist (HTTP ${res.status})`);
}

/** Last-write-wins per task id, including tombstones so deletes propagate. */
function merge(local: Task[], remote: Task[]): Task[] {
  const byId = new Map(local.map((t) => [t.id, t]));
  for (const r of remote) {
    const l = byId.get(r.id);
    if (!l || r.updatedAt > l.updatedAt) byId.set(r.id, r);
  }
  return Array.from(byId.values());
}

export type SyncResult =
  | { status: "disabled" }
  | { status: "skipped" }
  | { status: "ok"; taskCount: number }
  | { status: "error"; message: string };

let syncing = false;

export async function syncNow(): Promise<SyncResult> {
  const token = getGithubToken();
  if (!token) return { status: "disabled" };
  if (syncing) return { status: "skipped" };
  syncing = true;
  try {
    const gistId = getGistId() ?? (await createGist(token));
    const remote = await fetchGist(token, gistId);
    const merged = merge(store.listRaw(), remote.tasks);

    await store.replaceAll(merged);
    await pushGist(token, gistId, merged);

    return { status: "ok", taskCount: merged.length };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : String(err) };
  } finally {
    syncing = false;
  }
}

let debounceTimer: ReturnType<typeof setTimeout> | undefined;

/** Coalesces rapid successive edits into a single sync a couple seconds later. */
export function scheduleSync(delayMs = 2000): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => void syncNow(), delayMs);
}
