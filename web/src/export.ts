import * as store from "./store.js";
import type { Task } from "./types.js";

const EXPORT_VERSION = 1;

interface ExportFile {
  version: number;
  exportedAt: string;
  tasks: Task[];
}

export function exportToFile(): void {
  const payload: ExportFile = {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    tasks: store.list(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `task-tracker-export-${payload.exportedAt.slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Upsert merge by id, keeping whichever copy has the newer updatedAt.
 * Never deletes local tasks that are simply absent from the imported file -
 * import is additive/reconciling, not a full replace.
 */
export async function importFromFile(file: File): Promise<{ added: number; updated: number }> {
  const text = await file.text();
  const parsed = JSON.parse(text) as Partial<ExportFile>;
  if (!Array.isArray(parsed.tasks)) throw new Error("Not a valid task-tracker export file.");

  const merged = new Map(store.listRaw().map((t) => [t.id, t]));
  let added = 0;
  let updated = 0;
  for (const incoming of parsed.tasks) {
    const current = merged.get(incoming.id);
    if (!current) {
      merged.set(incoming.id, incoming);
      added++;
    } else if (incoming.updatedAt > current.updatedAt) {
      merged.set(incoming.id, incoming);
      updated++;
    }
  }
  await store.replaceAll(Array.from(merged.values()));
  return { added, updated };
}
