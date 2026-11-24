import type {
  AppSettings,
  Reminder,
  Task,
  TaskCategory,
  TaskPriority,
  TaskRecurrence,
  WhatsAppLog,
} from "../types";

export interface TasksResponse {
  ok: boolean;
  today: string;
  yesterday: string;
  nowIso: string;
  tasks: Task[];
  error?: string;
}

export interface CreateTaskPayload {
  title: string;
  description?: string;
  category: TaskCategory;
  recurrence: TaskRecurrence;
  auto_recreate?: boolean;
  scheduled_date: string;
  scheduled_time?: string | null;
  priority?: TaskPriority;
  remind_whatsapp?: boolean;
  remind_at?: string | null;
}

export interface UpdateTaskPayload extends Partial<CreateTaskPayload> {
  id: string;
  completed?: boolean;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok || data?.ok === false) {
    throw new Error(data?.error || `Erro na comunicação (${res.status})`);
  }
  return data as T;
}

export const api = {
  fetchTasks(): Promise<TasksResponse> {
    return requestJson<TasksResponse>("/api/tasks");
  },

  createTask(payload: CreateTaskPayload): Promise<{ ok: boolean; task: Task }> {
    return requestJson<{ ok: boolean; task: Task }>("/api/tasks", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  updateTask(
    payload: UpdateTaskPayload
  ): Promise<{ ok: boolean; task: Task; nextTask?: Task | null }> {
    return requestJson<{ ok: boolean; task: Task; nextTask?: Task | null }>(
      "/api/tasks",
      {
        method: "PATCH",
        body: JSON.stringify(payload),
      }
    );
  },

  deleteTask(id: string): Promise<{ ok: boolean }> {
    return requestJson<{ ok: boolean }>(
      `/api/tasks?id=${encodeURIComponent(id)}`,
      {
        method: "DELETE",
      }
    );
  },

  fetchReminders(): Promise<{ ok: boolean; reminders: Reminder[] }> {
    return requestJson<{ ok: boolean; reminders: Reminder[] }>(
      "/api/reminders"
    );
  },

  createReminder(payload: {
    title: string;
    message?: string;
    remind_at: string;
    phone?: string | null;
    recurrence?: "none" | "daily" | "weekly";
    send_whatsapp?: boolean;
    task_id?: string | null;
  }): Promise<{ ok: boolean; reminder: Reminder }> {
    return requestJson<{ ok: boolean; reminder: Reminder }>("/api/reminders", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  updateReminder(
    payload: Partial<Reminder> & { id: string }
  ): Promise<{ ok: boolean; reminder: Reminder }> {
    return requestJson<{ ok: boolean; reminder: Reminder }>("/api/reminders", {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  deleteReminder(id: string): Promise<{ ok: boolean }> {
    return requestJson<{ ok: boolean }>(
      `/api/reminders?id=${encodeURIComponent(id)}`,
      { method: "DELETE" }
    );
  },

  fetchSettings(): Promise<{
    ok: boolean;
    settings: AppSettings;
    summaryPreview: string;
    logs: WhatsAppLog[];
  }> {
    return requestJson("/api/settings");
  },

  updateSettings(
    payload: Partial<AppSettings> & { whatsapp_api_key?: string }
  ): Promise<{ ok: boolean; settings: AppSettings }> {
    return requestJson("/api/settings", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },

  sendWhatsApp(payload: Record<string, unknown>): Promise<{
    ok: boolean;
    status: number;
    action: string;
    data: unknown;
  }> {
    return requestJson("/api/send-whatsapp", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
};
