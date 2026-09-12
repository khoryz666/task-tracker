const KEYS = {
  githubToken: "tt.githubToken",
  gistId: "tt.gistId",
} as const;

export function getGithubToken(): string | null {
  return localStorage.getItem(KEYS.githubToken);
}

export function setGithubToken(token: string): void {
  localStorage.setItem(KEYS.githubToken, token);
}

export function clearGithubToken(): void {
  localStorage.removeItem(KEYS.githubToken);
  localStorage.removeItem(KEYS.gistId);
}

export function getGistId(): string | null {
  return localStorage.getItem(KEYS.gistId);
}

export function setGistId(id: string): void {
  localStorage.setItem(KEYS.gistId, id);
}
