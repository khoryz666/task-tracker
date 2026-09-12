import { DATA_REPO } from "./config.js";

const API = "https://api.github.com";

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
  };
}

// btoa/atob only handle byte strings (0-255 per char), so UTF-8 content
// (emoji, non-Latin titles, ...) needs an explicit encode/decode step.
function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToUtf8(b64: string): string {
  const binary = atob(b64.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export class ConflictError extends Error {}

interface RepoFile<T> {
  data: T;
  sha: string | null; // null = file doesn't exist yet
}

async function getRepoFile<T>(token: string, path: string, fallback: T): Promise<RepoFile<T>> {
  const res = await fetch(`${API}/repos/${DATA_REPO}/contents/${path}`, { headers: authHeaders(token) });
  if (res.status === 404) return { data: fallback, sha: null };
  if (!res.ok) throw new Error(`Could not read ${path} from the data repo (HTTP ${res.status})`);
  const json = (await res.json()) as { content: string; sha: string };
  return { data: JSON.parse(base64ToUtf8(json.content)) as T, sha: json.sha };
}

async function putRepoFile(token: string, path: string, data: unknown, sha: string | null): Promise<void> {
  const res = await fetch(`${API}/repos/${DATA_REPO}/contents/${path}`, {
    method: "PUT",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `sync: update ${path}`,
      content: utf8ToBase64(JSON.stringify(data, null, 2)),
      ...(sha ? { sha } : {}),
    }),
  });
  if (res.status === 409) throw new ConflictError();
  if (!res.ok) throw new Error(`Could not write ${path} to the data repo (HTTP ${res.status})`);
}

/**
 * Reads a file, applies `mutate`, and writes it back - retrying on a 409
 * (another device wrote in between) by re-reading and re-mutating. `mutate`
 * must be safe to call more than once against a fresher read.
 */
export async function updateRepoFile<T>(
  token: string,
  path: string,
  fallback: T,
  mutate: (current: T) => T,
): Promise<T> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { data, sha } = await getRepoFile<T>(token, path, fallback);
    const next = mutate(data);
    try {
      await putRepoFile(token, path, next, sha);
      return next;
    } catch (err) {
      if (err instanceof ConflictError && attempt < maxAttempts) continue;
      throw err;
    }
  }
  throw new Error(`Too many conflicts updating ${path}`);
}
