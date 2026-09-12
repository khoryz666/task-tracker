import * as db from "./db.js";
import type { NewTaskInput, Task, TaskPatch } from "./types.js";

type Listener = (tasks: Task[]) => void;

let cache: Task[] = [];
const listeners = new Set<Listener>();

function notify(): void {
  const visible = cache.filter((t) => !t.deletedAt);
  for (const l of listeners) l(visible);
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  listener(cache.filter((t) => !t.deletedAt));
  return () => listeners.delete(listener);
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
  return task;
}

export async function updateTask(id: string, patch: TaskPatch): Promise<void> {
  const idx = cache.findIndex((t) => t.id === id);
  if (idx === -1) return;
  const updated: Task = { ...cache[idx]!, ...patch, updatedAt: new Date().toISOString() };
  cache = [...cache.slice(0, idx), updated, ...cache.slice(idx + 1)];
  await db.putTask(updated);
  notify();
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
}

/** Replace the entire local dataset (used after a sync merge). */
export async function replaceAll(tasks: Task[]): Promise<void> {
  cache = tasks;
  await db.putTasks(tasks);
  notify();
}
