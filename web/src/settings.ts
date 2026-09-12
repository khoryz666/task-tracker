const KEYS = {
  githubToken: "tt.githubToken",
} as const;

export function getGithubToken(): string | null {
  return localStorage.getItem(KEYS.githubToken);
}

export function setGithubToken(token: string): void {
  localStorage.setItem(KEYS.githubToken, token);
}

export function clearGithubToken(): void {
  localStorage.removeItem(KEYS.githubToken);
}
