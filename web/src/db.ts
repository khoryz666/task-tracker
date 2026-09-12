import type { Task } from "./types.js";

const DB_NAME = "task-tracker";
const DB_VERSION = 1;
const STORE = "tasks";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    const req = run(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Every task ever stored, including tombstoned (deletedAt set) ones. */
export function getAllRaw(): Promise<Task[]> {
  return tx("readonly", (s) => s.getAll() as unknown as IDBRequest<Task[]>);
}

export function putTask(task: Task): Promise<void> {
  return tx("readwrite", (s) => s.put(task) as unknown as IDBRequest<void>);
}

export async function putTasks(tasks: Task[]): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE, "readwrite");
    const store = t.objectStore(STORE);
    for (const task of tasks) store.put(task);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export function deleteTaskHard(id: string): Promise<void> {
  return tx("readwrite", (s) => s.delete(id) as unknown as IDBRequest<void>);
}

/** Wipes the local IndexedDB database. Callers should reload the page afterward. */
export function deleteLocalDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    // A connection somewhere is still open (e.g. another tab); the delete
    // finishes once it closes, which reloading this tab won't itself do.
    req.onblocked = () => resolve();
  });
}
