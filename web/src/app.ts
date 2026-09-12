import * as store from "./store.js";
import { mountDashboardView } from "./ui/dashboard-view.js";
import { mountListView } from "./ui/list-view.js";

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
  const { list, dashboard } = mountTabs(root);
  mountListView(list);
  mountDashboardView(dashboard);
}

void main();
