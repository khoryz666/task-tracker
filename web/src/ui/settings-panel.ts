import { disableNotifications, enableNotifications, isSubscribed, pushSupported } from "../push.js";
import { clearGithubToken, getGistId, getGithubToken, setGithubToken } from "../settings.js";
import { syncNow } from "../sync.js";
import { icon } from "./icons.js";

function block(heading: string): { block: HTMLDivElement; body: HTMLDivElement } {
  const wrap = document.createElement("div");
  wrap.className = "settings-panel__block";
  const h = document.createElement("h3");
  h.className = "settings-panel__heading";
  h.textContent = heading;
  const body = document.createElement("div");
  body.className = "settings-panel__block";
  wrap.append(h, body);
  return { block: wrap, body };
}

/** Mounts a gear icon button into `anchorRoot` that opens the sync/notifications settings as a dialog. */
export function mountSettingsPanel(anchorRoot: HTMLElement): void {
  const dialog = document.createElement("dialog");
  dialog.className = "settings-dialog";

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "btn btn--icon settings-dialog__close";
  closeBtn.title = "Close";
  closeBtn.append(icon("x"));
  closeBtn.addEventListener("click", () => dialog.close());

  const body = document.createElement("div");
  body.className = "settings-panel__body";

  // ---- Sync ----
  const sync = block("Sync");

  const tokenRow = document.createElement("div");
  tokenRow.className = "settings-panel__row";
  const tokenInput = document.createElement("input");
  tokenInput.type = "password";
  tokenInput.className = "field";
  tokenInput.placeholder = "GitHub token (scope: gist)";
  tokenInput.value = getGithubToken() ?? "";
  const toggleVisibilityBtn = document.createElement("button");
  toggleVisibilityBtn.type = "button";
  toggleVisibilityBtn.className = "btn btn--icon";
  toggleVisibilityBtn.title = "Show/hide token";
  toggleVisibilityBtn.append(icon("eye"));
  toggleVisibilityBtn.addEventListener("click", () => {
    const show = tokenInput.type === "password";
    tokenInput.type = show ? "text" : "password";
    toggleVisibilityBtn.innerHTML = "";
    toggleVisibilityBtn.append(icon(show ? "eyeOff" : "eye"));
  });
  tokenRow.append(tokenInput, toggleVisibilityBtn);

  const syncActions = document.createElement("div");
  syncActions.className = "settings-panel__actions";
  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "btn btn--primary";
  saveBtn.append(icon("check"), document.createTextNode("Save & sync"));
  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "btn";
  clearBtn.textContent = "Disconnect";
  syncActions.append(saveBtn, clearBtn);

  const status = document.createElement("p");
  status.className = "settings-panel__status";
  status.textContent = getGithubToken()
    ? "Sync is enabled: tasks sync automatically via a private GitHub gist."
    : "No manual token needed if you used ./setup.sh - paste what it printed. Otherwise, create one at github.com/settings/tokens with only the 'gist' scope.";

  const gistLink = document.createElement("a");
  gistLink.className = "settings-panel__status";
  gistLink.target = "_blank";
  gistLink.rel = "noopener noreferrer";

  function refreshGistLink(): void {
    const gistId = getGistId();
    if (gistId) {
      gistLink.href = `https://gist.github.com/${gistId}`;
      gistLink.innerHTML = "";
      gistLink.append(icon("externalLink", 13), document.createTextNode(" View sync gist (its id is GIST_ID)"));
      gistLink.hidden = false;
    } else {
      gistLink.hidden = true;
    }
  }
  refreshGistLink();

  saveBtn.addEventListener("click", () => {
    const token = tokenInput.value.trim();
    if (!token) return;
    setGithubToken(token);
    status.className = "settings-panel__status";
    status.textContent = "Saved. Syncing…";
    void syncNow().then((res) => {
      status.className = `settings-panel__status settings-panel__status--${res.status === "ok" ? "ok" : res.status === "error" ? "error" : ""}`;
      status.textContent =
        res.status === "ok"
          ? `Synced (${res.taskCount} tasks).`
          : res.status === "error"
            ? `Sync failed: ${res.message}`
            : "Sync enabled.";
      refreshGistLink();
    });
  });

  clearBtn.addEventListener("click", () => {
    clearGithubToken();
    tokenInput.value = "";
    status.className = "settings-panel__status";
    status.textContent = "Sync disabled. Your local tasks are untouched.";
    refreshGistLink();
  });

  sync.body.append(tokenRow, syncActions, status, gistLink);

  // ---- Notifications ----
  const notif = block("Notifications");

  const notifBtn = document.createElement("button");
  notifBtn.type = "button";
  notifBtn.className = "btn";

  const notifStatus = document.createElement("p");
  notifStatus.className = "settings-panel__status";

  async function refreshNotifButton(): Promise<void> {
    notifBtn.innerHTML = "";
    if (!pushSupported()) {
      notifBtn.disabled = true;
      notifBtn.append(icon("bell"), document.createTextNode("Not supported in this browser"));
      return;
    }
    const subscribed = await isSubscribed();
    notifBtn.classList.toggle("btn--primary", !subscribed);
    notifBtn.append(icon("bell"), document.createTextNode(subscribed ? "Disable notifications" : "Enable notifications"));
  }

  notifBtn.addEventListener("click", async () => {
    const subscribed = await isSubscribed();
    if (subscribed) {
      await disableNotifications();
      notifStatus.textContent = "Notifications disabled on this device.";
    } else {
      const res = await enableNotifications();
      notifStatus.textContent = res.message;
    }
    await refreshNotifButton();
  });

  void refreshNotifButton();

  notif.body.append(notifBtn, notifStatus);

  body.append(sync.block, notif.block);
  dialog.append(body, closeBtn);

  // Close when clicking the backdrop (a click landing on the <dialog>
  // element itself, outside its content box, only happens on the backdrop).
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });

  const gearBtn = document.createElement("button");
  gearBtn.type = "button";
  gearBtn.className = "btn btn--icon";
  gearBtn.title = "Sync & notification settings";
  gearBtn.append(icon("gear"));
  gearBtn.addEventListener("click", () => dialog.showModal());

  anchorRoot.append(gearBtn);
  document.body.append(dialog);
}
