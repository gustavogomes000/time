export type TaskCategory = "daily" | "conference";
export type TaskRecurrence = "none" | "weekly" | "biweekly" | "monthly";
export type TaskPriority = "low" | "normal" | "high";
export type TaskVisualStatus = "done" | "pending" | "overdue";

export type FilterMode =
  | "all"
  | "daily"
  | "conference"
  | "weekly"
  | "biweekly"
  | "monthly"
  | "overdue";

export type NavTab =
  | "overview"
  | "agenda"
  | "conferences"
  | "notes"
  | "whatsapp";

export type NoteBlockType =
  | "paragraph"
  | "heading"
  | "todo"
  | "callout"
  | "divider"
  | "image"
  | "video";

export interface NoteBlock {
  id: string;
  type: NoteBlockType;
  text?: string;
  checked?: boolean;
  url?: string;
  mediaId?: string;
  caption?: string;
  fileName?: string;
}

export interface NoteFolder {
  id: string;
  parent_id: string | null;
  name: string;
  icon: string;
  color: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface NoteItem {
  id: string;
  folder_id: string | null;
  title: string;
  icon: string;
  cover_color: string;
  pinned: boolean;
  tags: string[];
  content: string;
  blocks: NoteBlock[];
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  category: TaskCategory;
  recurrence: TaskRecurrence;
  auto_recreate: boolean;
  next_generated: boolean;
  parent_task_id: string | null;
  original_date: string; // YYYY-MM-DD
  scheduled_date: string; // YYYY-MM-DD
  scheduled_time: string | null; // HH:MM
  priority: TaskPriority;
  completed: boolean;
  completed_at: string | null;
  completed_date: string | null; // YYYY-MM-DD
  rollover_count: number;
  remind_whatsapp: boolean;
  remind_at: string | null;
  remind_sent: boolean;
  created_at: string;
  updated_at: string;
}

export interface Reminder {
  id: string;
  title: string;
  message: string;
  remind_at: string;
  phone: string | null;
  recurrence: "none" | "daily" | "weekly";
  send_whatsapp: boolean;
  in_app_dismissed: boolean;
  sent: boolean;
  sent_at: string | null;
  last_error: string | null;
  task_id: string | null;
  task_title?: string | null;
  created_at: string;
}

export interface AppSettings {
  default_phone: string;
  daily_summary_enabled: boolean;
  daily_summary_time: string;
  last_summary_sent_date: string | null;
  timezone: string;
  whatsapp_api_url: string;
  whatsapp_instance: string;
  has_api_key: boolean;
  masked_api_key: string;
}

export interface WhatsAppLog {
  id: string;
  kind: string;
  phone: string;
  message_preview: string;
  status: string;
  response_body: string | null;
  created_at: string;
}

/**
 * Computes the visual color status of a task relative to the viewed date and server today:
 * - done -> GREEN (Feita)
 * - overdue -> RED (Atrasada: passed midnight from an earlier original_date or uncompleted in the past)
 * - pending -> BLUE (Não feita no prazo)
 */
export function getTaskVisualStatus(
  task: Task,
  todayYmd: string,
  viewedDateYmd?: string
): TaskVisualStatus {
  if (task.completed) {
    // If viewing a past day (e.g. Yesterday) and the task was NOT completed on that past day,
    // check whether it was completed later or on that day
    if (
      viewedDateYmd &&
      viewedDateYmd < todayYmd &&
      task.completed_date &&
      task.completed_date > viewedDateYmd &&
      task.original_date <= viewedDateYmd
    ) {
      // Completed on a later day, still green as done (we'll show subtle note "concluída em DD/MM")
      return "done";
    }
    return "done";
  }

  // Uncompleted task:
  if (
    task.scheduled_date > task.original_date ||
    task.original_date < todayYmd ||
    (viewedDateYmd && viewedDateYmd < todayYmd)
  ) {
    return "overdue";
  }

  return "pending";
}

/**
 * Returns tasks relevant to a specific calendar date (Today, Yesterday, or any Day Agenda date).
 */
export function getTasksForDate(
  tasks: Task[],
  dateYmd: string,
  todayYmd: string
): Task[] {
  if (dateYmd === todayYmd) {
    // Today shows all tasks active today (including overdue tasks rolled over from earlier days)
    // plus tasks completed today
    return tasks.filter(
      (t) =>
        t.scheduled_date === todayYmd ||
        (t.completed && t.completed_date === todayYmd)
    );
  }

  if (dateYmd < todayYmd) {
    // Past day (like Yesterday or earlier in Google Agenda view):
    // Shows tasks originally from that day OR completed on that day!
    return tasks.filter(
      (t) =>
        t.original_date === dateYmd ||
        t.completed_date === dateYmd ||
        t.scheduled_date === dateYmd
    );
  }

  // Future day: shows tasks scheduled for that future day
  return tasks.filter((t) => t.scheduled_date === dateYmd);
}

export function matchesFilter(
  task: Task,
  filter: FilterMode,
  todayYmd: string
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "daily":
      return task.category === "daily" && task.recurrence === "none";
    case "conference":
      return task.category === "conference" || task.recurrence !== "none";
    case "weekly":
      return task.recurrence === "weekly";
    case "biweekly":
      return task.recurrence === "biweekly";
    case "monthly":
      return task.recurrence === "monthly";
    case "overdue":
      return getTaskVisualStatus(task, todayYmd) === "overdue";
    default:
      return true;
  }
}

export function recurrenceLabel(rec: TaskRecurrence): string {
  switch (rec) {
    case "weekly":
      return "Semanal";
    case "biweekly":
      return "Quinzenal";
    case "monthly":
      return "Mensal";
    default:
      return "Diária";
  }
}

export function parseYmdLocal(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0);
}

export function toYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDaysYmd(ymd: string, deltaDays: number): string {
  const dt = parseYmdLocal(ymd);
  dt.setDate(dt.getDate() + deltaDays);
  return toYmd(dt);
}

export function formatShortBr(ymd: string): string {
  if (!ymd) return "";
  const [, m, d] = ymd.split("-");
  return `${d}/${m}`;
}

export function formatFullBr(ymd: string): string {
  if (!ymd) return "";
  const dt = parseYmdLocal(ymd);
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(dt);
}

export function formatDayMonthYearBr(ymd: string): string {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}
