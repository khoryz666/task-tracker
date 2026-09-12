import * as store from "../store.js";
import { STATUS_LABEL, STATUS_ORDER, type Task, type TaskStatus } from "../types.js";

const STATUS_COLOR: Record<TaskStatus, string> = {
  not_started: "#9a9a9a",
  in_progress: "#2f6fed",
  done: "#2f8f5b",
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function daysUntil(deadline: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(deadline + "T00:00:00");
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

function renderUpcoming(tasks: Task[]): HTMLElement {
  const section = el("section", "dashboard__section");
  const heading = document.createElement("h2");
  heading.textContent = "Upcoming";
  section.append(heading);

  const upcoming = tasks
    .filter((t) => t.status !== "done" && t.deadline)
    .sort((a, b) => (a.deadline! < b.deadline! ? -1 : 1))
    .slice(0, 8);

  if (upcoming.length === 0) {
    const p = document.createElement("p");
    p.className = "dashboard__empty";
    p.textContent = "Nothing with a deadline yet.";
    section.append(p);
    return section;
  }

  const list = el("ul", "upcoming-list");
  for (const task of upcoming) {
    const days = daysUntil(task.deadline!);
    const li = el("li", "upcoming-list__item");
    if (days < 0) li.classList.add("upcoming-list__item--overdue");
    else if (days <= 2) li.classList.add("upcoming-list__item--soon");

    const title = el("span", "upcoming-list__title");
    title.textContent = (task.critical ? "★ " : "") + task.title;

    const when = el("span", "upcoming-list__when");
    when.textContent =
      days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? "due today" : `in ${days}d (${task.deadline})`;

    li.append(title, when);
    list.append(li);
  }
  section.append(list);
  return section;
}

function renderStatusChart(tasks: Task[]): HTMLElement {
  const section = el("section", "dashboard__section");
  const heading = document.createElement("h2");
  heading.textContent = "Status breakdown";
  section.append(heading);

  const counts: Record<TaskStatus, number> = { not_started: 0, in_progress: 0, done: 0 };
  for (const t of tasks) counts[t.status]++;
  const total = tasks.length;

  if (total === 0) {
    const p = document.createElement("p");
    p.className = "dashboard__empty";
    p.textContent = "No tasks yet.";
    section.append(p);
    return section;
  }

  const bar = el("div", "status-bar");
  for (const status of STATUS_ORDER) {
    const count = counts[status];
    if (count === 0) continue;
    const segment = el("div", "status-bar__segment");
    segment.style.width = `${(count / total) * 100}%`;
    segment.style.background = STATUS_COLOR[status];
    segment.title = `${STATUS_LABEL[status]}: ${count}`;
    bar.append(segment);
  }
  section.append(bar);

  const legend = el("div", "status-legend");
  for (const status of STATUS_ORDER) {
    const item = el("span", "status-legend__item");
    const swatch = el("span", "status-legend__swatch");
    swatch.style.background = STATUS_COLOR[status];
    item.append(swatch, document.createTextNode(`${STATUS_LABEL[status]} (${counts[status]})`));
    legend.append(item);
  }
  section.append(legend);
  return section;
}

export function mountDashboardView(root: HTMLElement): void {
  function render(): void {
    const tasks = store.list();
    root.innerHTML = "";
    root.append(renderUpcoming(tasks), renderStatusChart(tasks));
  }
  store.subscribe(render);
}
