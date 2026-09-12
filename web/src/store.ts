import * as db from "./db.js";
import type { NewTaskInput, Task, TaskPatch } from "./types.js";

type Listener = (tasks: Task[]) => void;

let cache: Task[] = [];
const listeners = new Set<Listener>();
const editListeners = new Set<() => void>();

function notify(): void {
  const visible = cache.filter((t) => !t.deletedAt);
  for (const l of listeners) l(visible);
}

/** Fires only for locally-originated changes (create/update/delete/import) - not
 * for a sync merge applying remote data, which would otherwise re-trigger itself. */
function notifyEdit(): void {
  for (const l of editListeners) l();
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  listener(cache.filter((t) => !t.deletedAt));
  return () => listeners.delete(listener);
}

/** Subscribes to local edits only, e.g. to schedule an outgoing sync. */
export function subscribeLocalEdit(listener: () => void): () => void {
  editListeners.add(listener);
  return () => editListeners.delete(listener);
}

export async function init(): Promise<void> {
  cache = await db.getAllRaw();
  notify();
}

export function list(): Task[] {
  return cache.filter((t) => !t.deletedAt);
}

/** Includes tombstones - needed for sync merges. */
export function listRaw(): Task[] {
  return cache;
}

function newId(): string {
  return crypto.randomUUID();
}

export async function createTask(input: NewTaskInput): Promise<Task> {
  const now = new Date().toISOString();
  const task: Task = {
    id: newId(),
    title: input.title.trim(),
    category: input.category?.trim() || "uncategorized",
    week: input.week ?? null,
    critical: input.critical ?? false,
    weight: input.weight ?? null,
    deadline: input.deadline ?? null,
    status: input.status ?? "not_started",
    notes: input.notes ?? "",
    tags: input.tags ?? [],
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  cache = [...cache, task];
  await db.putTask(task);
  notify();
  notifyEdit();
  return task;
}

export async function updateTask(id: string, patch: TaskPatch): Promise<void> {
  const idx = cache.findIndex((t) => t.id === id);
  if (idx === -1) return;
  const updated: Task = { ...cache[idx]!, ...patch, updatedAt: new Date().toISOString() };
  cache = [...cache.slice(0, idx), updated, ...cache.slice(idx + 1)];
  await db.putTask(updated);
  notify();
  notifyEdit();
}

export async function duplicateTask(id: string): Promise<Task | undefined> {
  const original = cache.find((t) => t.id === id);
  if (!original) return undefined;
  return createTask({
    title: `${original.title} (copy)`,
    category: original.category,
    week: original.week,
    critical: original.critical,
    weight: original.weight,
    deadline: original.deadline,
    status: original.status,
    notes: original.notes,
    tags: [...original.tags],
  });
}

export async function deleteTask(id: string): Promise<void> {
  // Soft delete (tombstone) so this deletion can propagate through sync
  // instead of being silently resurrected by an older copy on another device.
  const idx = cache.findIndex((t) => t.id === id);
  if (idx === -1) return;
  const now = new Date().toISOString();
  const tombstoned: Task = { ...cache[idx]!, deletedAt: now, updatedAt: now };
  cache = [...cache.slice(0, idx), tombstoned, ...cache.slice(idx + 1)];
  await db.putTask(tombstoned);
  notify();
  notifyEdit();
}

/**
 * Replace the entire local dataset - used both after a sync merge (remote
 * data folded in) and after a file import (locally-originated). `isRemoteSync`
 * distinguishes the two so a sync's own merge-apply doesn't schedule another
 * sync of itself, which would otherwise loop forever every debounce interval.
 */
export async function replaceAll(tasks: Task[], opts: { isRemoteSync?: boolean } = {}): Promise<void> {
  cache = tasks;
  await db.putTasks(tasks);
  notify();
  if (!opts.isRemoteSync) notifyEdit();
}
