import { exportToFile, importFromFile } from "./export.js";
import { registerServiceWorker } from "./register-sw.js";
import * as store from "./store.js";
import { scheduleSync, syncNow } from "./sync.js";
import { mountDashboardView } from "./ui/dashboard-view.js";
import { icon } from "./ui/icons.js";
import { mountListView } from "./ui/list-view.js";
import { mountSettingsPanel } from "./ui/settings-panel.js";

const AUTO_SYNC_INTERVAL_MS = 3 * 60 * 1000;

function mountDataToolbar(root: HTMLElement): void {
  const bar = document.createElement("div");
  bar.className = "data-toolbar";

  const status = document.createElement("span");
  status.className = "data-toolbar__status";

  const syncBtn = document.createElement("button");
  syncBtn.type = "button";
  syncBtn.className = "btn btn--primary";
  syncBtn.append(icon("refresh"), document.createTextNode("Sync"));
  syncBtn.addEventListener("click", () => {
    status.textContent = "Syncing…";
    void syncNow().then((res) => {
      status.textContent =
        res.status === "ok"
          ? `Synced (${res.taskCount} tasks).`
          : res.status === "disabled"
            ? "Sync not set up - see settings (gear icon, top right)."
            : res.status === "error"
              ? `Sync failed: ${res.message}`
              : "";
    });
  });

  const importLabel = document.createElement("label");
  importLabel.className = "btn";
  importLabel.append(icon("upload"), document.createTextNode("Import"));
  const importInput = document.createElement("input");
  importInput.type = "file";
  importInput.accept = "application/json";
  importInput.hidden = true;
  importLabel.append(importInput);

  const exportBtn = document.createElement("button");
  exportBtn.type = "button";
  exportBtn.className = "btn";
  exportBtn.append(icon("download"), document.createTextNode("Export"));
  exportBtn.addEventListener("click", () => exportToFile());

  importInput.addEventListener("change", () => {
    const file = importInput.files?.[0];
    if (!file) return;
    importFromFile(file)
      .then(({ added, updated }) => {
        status.textContent = `Imported: ${added} added, ${updated} updated.`;
      })
      .catch((err: unknown) => {
        status.textContent = err instanceof Error ? err.message : "Import failed.";
      })
      .finally(() => {
        importInput.value = "";
      });
  });

  const spacer = document.createElement("div");
  spacer.className = "data-toolbar__spacer";

  bar.append(syncBtn, spacer, importLabel, exportBtn, status);
  root.append(bar);
}

function mountTabs(root: HTMLElement): { list: HTMLElement; dashboard: HTMLElement } {
  const nav = document.createElement("nav");
  nav.className = "tab-bar";
  const listBtn = document.createElement("button");
  listBtn.type = "button";
  listBtn.className = "tab-bar__button tab-bar__button--active";
  listBtn.textContent = "Tasks";
  const dashboardBtn = document.createElement("button");
  dashboardBtn.type = "button";
  dashboardBtn.className = "tab-bar__button";
  dashboardBtn.textContent = "Dashboard";
  nav.append(listBtn, dashboardBtn);

  const listPanel = document.createElement("div");
  const dashboardPanel = document.createElement("div");
  dashboardPanel.hidden = true;

  function show(panel: "list" | "dashboard"): void {
    listPanel.hidden = panel !== "list";
    dashboardPanel.hidden = panel !== "dashboard";
    listBtn.classList.toggle("tab-bar__button--active", panel === "list");
    dashboardBtn.classList.toggle("tab-bar__button--active", panel === "dashboard");
  }
  listBtn.addEventListener("click", () => show("list"));
  dashboardBtn.addEventListener("click", () => show("dashboard"));

  root.append(nav, listPanel, dashboardPanel);
  return { list: listPanel, dashboard: dashboardPanel };
}

async function main(): Promise<void> {
  registerServiceWorker();
  await store.init();

  const header = document.querySelector<HTMLElement>(".app-header");
  if (header) {
    const spacer = document.createElement("div");
    spacer.className = "app-header__spacer";
    header.append(spacer);
    mountSettingsPanel(header);
  }

  const root = document.getElementById("app");
  if (!root) throw new Error("missing #app root element");
  mountDataToolbar(root);
  const { list, dashboard } = mountTabs(root);
  mountListView(list);
  mountDashboardView(dashboard);

  // Auto-sync: after every local edit (debounced), when the tab regains
  // focus, and on a periodic interval as a fallback while the app is open.
  store.subscribeLocalEdit(() => scheduleSync());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void syncNow();
  });
  setInterval(() => void syncNow(), AUTO_SYNC_INTERVAL_MS);
}

void main();
