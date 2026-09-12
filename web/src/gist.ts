import { getGistId, setGistId } from "./settings.js";

const GIST_DESCRIPTION = "task-tracker sync data (do not edit by hand)";
const API = "https://api.github.com";

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
  };
}

/** Creates the shared sync gist on first use; reuses it afterwards. */
export async function ensureGist(token: string): Promise<string> {
  const existing = getGistId();
  if (existing) return existing;

  const res = await fetch(`${API}/gists`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      description: GIST_DESCRIPTION,
      public: false,
      files: { "tasks.json": { content: JSON.stringify({ version: 1, tasks: [] }, null, 2) } },
    }),
  });
  if (!res.ok) throw new Error(`Could not create sync gist (HTTP ${res.status})`);
  const json = (await res.json()) as { id: string };
  setGistId(json.id);
  return json.id;
}

export async function getGistFile<T>(token: string, gistId: string, filename: string, fallback: T): Promise<T> {
  const res = await fetch(`${API}/gists/${gistId}`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(`Could not fetch sync gist (HTTP ${res.status})`);
  const json = (await res.json()) as { files: Record<string, { content?: string } | undefined> };
  const content = json.files[filename]?.content;
  if (!content) return fallback;
  return JSON.parse(content) as T;
}

export async function putGistFile(token: string, gistId: string, filename: string, data: unknown): Promise<void> {
  const res = await fetch(`${API}/gists/${gistId}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify({ files: { [filename]: { content: JSON.stringify(data, null, 2) } } }),
  });
  if (!res.ok) throw new Error(`Could not update sync gist (HTTP ${res.status})`);
}
