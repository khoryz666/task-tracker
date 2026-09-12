import * as store from "../store.js";
import { STATUS_LABEL, STATUS_ORDER, type Task, type TaskStatus } from "../types.js";

interface Filters {
  category: string; // "all" or a category name
  status: TaskStatus | "all";
  sort: "deadline" | "created" | "critical";
}

const filters: Filters = { category: "all", status: "all", sort: "deadline" };

function nextStatus(current: TaskStatus): TaskStatus {
  const i = STATUS_ORDER.indexOf(current);
  return STATUS_ORDER[(i + 1) % STATUS_ORDER.length]!;
}

function applyFilters(tasks: Task[]): Task[] {
  let out = tasks;
  if (filters.category !== "all") out = out.filter((t) => t.category === filters.category);
  if (filters.status !== "all") out = out.filter((t) => t.status === filters.status);

  out = [...out].sort((a, b) => {
    if (filters.sort === "critical") {
      if (a.critical !== b.critical) return a.critical ? -1 : 1;
    }
    if (filters.sort === "deadline" || filters.sort === "critical") {
      const ad = a.deadline ?? "9999-99-99";
      const bd = b.deadline ?? "9999-99-99";
      if (ad !== bd) return ad < bd ? -1 : 1;
    }
    return a.createdAt < b.createdAt ? 1 : -1;
  });
  return out;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function mountListView(root: HTMLElement): void {
  root.innerHTML = "";

  const addForm = el("form", "quick-add");
  const addInput = el("input", "quick-add__input");
  addInput.type = "text";
  addInput.placeholder = "Add a task and hit Enter…";
  addInput.required = true;
  const addButton = el("button", "quick-add__button", "Add");
  addButton.type = "submit";
  addForm.append(addInput, addButton);
  addForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const title = addInput.value.trim();
    if (!title) return;
    void store.createTask({ title });
    addInput.value = "";
    addInput.focus();
  });

  const filterBar = el("div", "filter-bar");
  const categorySelect = el("select", "filter-bar__select");
  const statusSelect = el("select", "filter-bar__select");
  for (const opt of [
    ["all", "All statuses"],
    ["not_started", STATUS_LABEL.not_started],
    ["in_progress", STATUS_LABEL.in_progress],
    ["done", STATUS_LABEL.done],
  ]) {
    const o = el("option");
    o.value = opt[0]!;
    o.textContent = opt[1]!;
    statusSelect.append(o);
  }
  statusSelect.addEventListener("change", () => {
    filters.status = statusSelect.value as Filters["status"];
    render();
  });
  categorySelect.addEventListener("change", () => {
    filters.category = categorySelect.value;
    render();
  });
  const sortSelect = el("select", "filter-bar__select");
  for (const opt of [
    ["deadline", "Sort: deadline"],
    ["critical", "Sort: critical first"],
    ["created", "Sort: newest"],
  ]) {
    const o = el("option");
    o.value = opt[0]!;
    o.textContent = opt[1]!;
    sortSelect.append(o);
  }
  sortSelect.addEventListener("change", () => {
    filters.sort = sortSelect.value as Filters["sort"];
    render();
  });
  filterBar.append(categorySelect, statusSelect, sortSelect);

  const listEl = el("ul", "task-list");
  const emptyState = el("p", "empty-state", "No tasks match. Add one above.");

  root.append(addForm, filterBar, listEl, emptyState);

  function renderCategoryOptions(tasks: Task[]): void {
    const categories = Array.from(new Set(tasks.map((t) => t.category))).sort();
    const current = categorySelect.value || "all";
    categorySelect.innerHTML = "";
    const allOpt = el("option");
    allOpt.value = "all";
    allOpt.textContent = "All categories";
    categorySelect.append(allOpt);
    for (const c of categories) {
      const o = el("option");
      o.value = c;
      o.textContent = c;
      categorySelect.append(o);
    }
    categorySelect.value = categories.includes(current) || current === "all" ? current : "all";
  }

  function renderRow(task: Task): HTMLLIElement {
    const li = el("li", `task-row task-row--${task.status}${task.critical ? " task-row--critical" : ""}`);

    const statusBtn = el("button", "task-row__status", STATUS_LABEL[task.status]);
    statusBtn.type = "button";
    statusBtn.title = "Click to advance status";
    statusBtn.addEventListener("click", () => void store.updateTask(task.id, { status: nextStatus(task.status) }));

    const main = el("div", "task-row__main");
    const title = el("span", "task-row__title", task.title);
    const meta = el("span", "task-row__meta");
    const bits: string[] = [task.category];
    if (task.week != null) bits.push(`wk ${task.week}`);
    if (task.weight != null) bits.push(`${Math.round(task.weight * 100)}%`);
    if (task.deadline) bits.push(`due ${task.deadline}`);
    meta.textContent = bits.join(" · ");
    main.append(title, meta);

    const critBtn = el("button", "task-row__critical", task.critical ? "★" : "☆");
    critBtn.type = "button";
    critBtn.title = "Toggle critical";
    critBtn.addEventListener("click", () => void store.updateTask(task.id, { critical: !task.critical }));

    const editBtn = el("button", "task-row__edit", "Edit");
    editBtn.type = "button";

    const delBtn = el("button", "task-row__delete", "Delete");
    delBtn.type = "button";
    delBtn.addEventListener("click", () => void store.deleteTask(task.id));

    const editPanel = renderEditPanel(task);
    editPanel.hidden = true;
    editBtn.addEventListener("click", () => {
      editPanel.hidden = !editPanel.hidden;
    });

    const rowTop = el("div", "task-row__top");
    rowTop.append(statusBtn, main, critBtn, editBtn, delBtn);
    li.append(rowTop, editPanel);
    return li;
  }

  function renderEditPanel(task: Task): HTMLDivElement {
    const panel = el("div", "task-edit");

    const categoryInput = el("input", "task-edit__field");
    categoryInput.value = task.category;
    categoryInput.placeholder = "Category";

    const weekInput = el("input", "task-edit__field");
    weekInput.type = "number";
    weekInput.placeholder = "Week";
    weekInput.value = task.week != null ? String(task.week) : "";

    const weightInput = el("input", "task-edit__field");
    weightInput.type = "number";
    weightInput.placeholder = "Weight %";
    weightInput.min = "0";
    weightInput.max = "100";
    weightInput.value = task.weight != null ? String(Math.round(task.weight * 100)) : "";

    const deadlineInput = el("input", "task-edit__field");
    deadlineInput.type = "date";
    deadlineInput.value = task.deadline ?? "";

    const tagsInput = el("input", "task-edit__field");
    tagsInput.placeholder = "tags, comma, separated";
    tagsInput.value = task.tags.join(", ");

    const notesInput = el("textarea", "task-edit__notes");
    notesInput.placeholder = "Notes (markdown)";
    notesInput.value = task.notes;

    const saveBtn = el("button", "task-edit__save", "Save");
    saveBtn.type = "button";
    saveBtn.addEventListener("click", () => {
      void store.updateTask(task.id, {
        category: categoryInput.value.trim() || "uncategorized",
        week: weekInput.value ? Number(weekInput.value) : null,
        weight: weightInput.value ? Number(weightInput.value) / 100 : null,
        deadline: deadlineInput.value || null,
        tags: tagsInput.value
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        notes: notesInput.value,
      });
    });

    panel.append(categoryInput, weekInput, weightInput, deadlineInput, tagsInput, notesInput, saveBtn);
    return panel;
  }

  function render(): void {
    const tasks = store.list();
    renderCategoryOptions(tasks);
    const visible = applyFilters(tasks);
    listEl.innerHTML = "";
    for (const task of visible) listEl.append(renderRow(task));
    emptyState.hidden = visible.length !== 0;
  }

  store.subscribe(render);
}
