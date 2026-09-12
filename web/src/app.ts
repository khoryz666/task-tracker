import { exportToFile, importFromFile } from "./export.js";
import * as store from "./store.js";
import { mountDashboardView } from "./ui/dashboard-view.js";
import { mountListView } from "./ui/list-view.js";

function mountDataToolbar(root: HTMLElement): void {
  const bar = document.createElement("div");
  bar.className = "data-toolbar";

  const exportBtn = document.createElement("button");
  exportBtn.type = "button";
  exportBtn.className = "data-toolbar__button";
  exportBtn.textContent = "Export";
  exportBtn.addEventListener("click", () => exportToFile());

  const importLabel = document.createElement("label");
  importLabel.className = "data-toolbar__button";
  importLabel.textContent = "Import";
  const importInput = document.createElement("input");
  importInput.type = "file";
  importInput.accept = "application/json";
  importInput.hidden = true;
  importLabel.append(importInput);

  const status = document.createElement("span");
  status.className = "data-toolbar__status";

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

  bar.append(exportBtn, importLabel, status);
  root.append(bar);
}

function mountTabs(root: HTMLElement): { list: HTMLElement; dashboard: HTMLElement } {
  const nav = document.createElement("nav");
  nav.className = "tab-bar";
  const listBtn = document.createElement("button");
  listBtn.textContent = "Tasks";
  listBtn.className = "tab-bar__button tab-bar__button--active";
  const dashboardBtn = document.createElement("button");
  dashboardBtn.textContent = "Dashboard";
  dashboardBtn.className = "tab-bar__button";
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
  await store.init();
  const root = document.getElementById("app");
  if (!root) throw new Error("missing #app root element");
  mountDataToolbar(root);
  const { list, dashboard } = mountTabs(root);
  mountListView(list);
  mountDashboardView(dashboard);
}

void main();
