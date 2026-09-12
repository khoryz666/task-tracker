export type TaskStatus = "not_started" | "in_progress" | "done";

export interface Task {
  id: string;
  title: string;
  category: string;
  week: number | null;
  critical: boolean;
  weight: number | null; // 0-1, e.g. grade weighting
  deadline: string | null; // ISO date, yyyy-mm-dd
  status: TaskStatus;
  notes: string; // markdown
  tags: string[];
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
  deletedAt: string | null; // tombstone, set instead of hard-deleting so sync can propagate deletes
}

export type NewTaskInput = {
  title: string;
  category?: string;
  week?: number | null;
  critical?: boolean;
  weight?: number | null;
  deadline?: string | null;
  status?: TaskStatus;
  notes?: string;
  tags?: string[];
};

export type TaskPatch = Partial<
  Pick<Task, "title" | "category" | "week" | "critical" | "weight" | "deadline" | "status" | "notes" | "tags">
>;

export const STATUS_ORDER: TaskStatus[] = ["not_started", "in_progress", "done"];

export const STATUS_LABEL: Record<TaskStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  done: "Done",
};
