import { clearGithubToken, getGithubToken, setGithubToken } from "../settings.js";
import { syncNow } from "../sync.js";

export function mountSettingsPanel(root: HTMLElement): void {
  const details = document.createElement("details");
  details.className = "settings-panel";

  const summary = document.createElement("summary");
  summary.textContent = "Sync settings";
  details.append(summary);

  const body = document.createElement("div");
  body.className = "settings-panel__body";

  const tokenInput = document.createElement("input");
  tokenInput.type = "password";
  tokenInput.className = "settings-panel__field";
  tokenInput.placeholder = "GitHub token (scope: gist)";
  tokenInput.value = getGithubToken() ?? "";

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.textContent = "Save & sync";

  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.textContent = "Disconnect";

  const status = document.createElement("p");
  status.className = "settings-panel__status";
  status.textContent = getGithubToken()
    ? "Sync is enabled: tasks sync automatically via a private GitHub gist."
    : "Create a token at github.com/settings/tokens with only the 'gist' scope, then paste it here to enable automatic cross-device sync.";

  saveBtn.addEventListener("click", () => {
    const token = tokenInput.value.trim();
    if (!token) return;
    setGithubToken(token);
    status.textContent = "Saved. Syncing…";
    void syncNow().then((res) => {
      status.textContent =
        res.status === "ok"
          ? `Synced (${res.taskCount} tasks).`
          : res.status === "error"
            ? `Sync failed: ${res.message}`
            : "Sync enabled.";
    });
  });

  clearBtn.addEventListener("click", () => {
    clearGithubToken();
    tokenInput.value = "";
    status.textContent = "Sync disabled. Your local tasks are untouched.";
  });

  body.append(tokenInput, saveBtn, clearBtn, status);
  details.append(body);
  root.append(details);
}
