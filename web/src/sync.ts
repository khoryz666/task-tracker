import { updateRepoFile } from "./data-repo.js";
import { getGithubToken } from "./settings.js";
import * as store from "./store.js";
import type { Task } from "./types.js";

const TASKS_PATH = "tasks.json";

interface TasksFile {
  version: number;
  tasks: Task[];
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
    const merged = await updateRepoFile<TasksFile>(token, TASKS_PATH, { version: 1, tasks: [] }, (remote) => ({
      version: 1,
      tasks: merge(store.listRaw(), remote.tasks),
    }));
    await store.replaceAll(merged.tasks, { isRemoteSync: true });
    return { status: "ok", taskCount: merged.tasks.length };
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
