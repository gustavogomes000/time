import type {
  AppSettings,
  NoteBlock,
  NoteFolder,
  NoteItem,
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

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result || "");
      const commaIdx = result.indexOf(",");
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function optimizeLargeImageIfNeeded(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.size <= 3_000_000) {
    return file;
  }
  return new Promise((resolve) => {
    const img = new Image();
    const objUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objUrl);
      const maxDim = 2200;
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => resolve(blob || file),
        "image/jpeg",
        0.88
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objUrl);
      resolve(file);
    };
    img.src = objUrl;
  });
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

  // ======================== NOTION FOLDERS, CARDS & MEDIA ========================

  fetchNotesWorkspace(): Promise<{
    ok: boolean;
    folders: NoteFolder[];
    notes: NoteItem[];
  }> {
    return requestJson("/api/notes");
  },

  createFolder(payload: {
    name: string;
    parent_id?: string | null;
    icon?: string;
    color?: string;
  }): Promise<{ ok: boolean; folder: NoteFolder }> {
    return requestJson("/api/notes", {
      method: "POST",
      body: JSON.stringify({ entity: "folder", ...payload }),
    });
  },

  updateFolder(payload: {
    id: string;
    name?: string;
    parent_id?: string | null;
    icon?: string;
    color?: string;
  }): Promise<{ ok: boolean; folder: NoteFolder }> {
    return requestJson("/api/notes", {
      method: "PATCH",
      body: JSON.stringify({ entity: "folder", ...payload }),
    });
  },

  deleteFolder(id: string): Promise<{ ok: boolean }> {
    return requestJson(
      `/api/notes?entity=folder&id=${encodeURIComponent(id)}`,
      { method: "DELETE" }
    );
  },

  createNote(payload: {
    folder_id?: string | null;
    title?: string;
    icon?: string;
    cover_color?: string;
    pinned?: boolean;
    tags?: string[];
    content?: string;
    blocks?: NoteBlock[];
  }): Promise<{ ok: boolean; note: NoteItem }> {
    return requestJson("/api/notes", {
      method: "POST",
      body: JSON.stringify({ entity: "note", ...payload }),
    });
  },

  updateNote(
    payload: Partial<NoteItem> & { id: string }
  ): Promise<{ ok: boolean; note: NoteItem }> {
    return requestJson("/api/notes", {
      method: "PATCH",
      body: JSON.stringify({ entity: "note", ...payload }),
    });
  },

  deleteNote(id: string): Promise<{ ok: boolean }> {
    return requestJson(`/api/notes?entity=note&id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },

  async uploadMedia(
    file: File,
    noteId: string | null,
    onProgress?: (pct: number) => void
  ): Promise<{ mediaId: string; url: string; kind: "image" | "video" }> {
    const isVideo = file.type.startsWith("video/");
    const kind: "image" | "video" = isVideo ? "video" : "image";
    const preparedBlob = isVideo
      ? file
      : await optimizeLargeImageIfNeeded(file);

    const mimeType =
      preparedBlob.type ||
      file.type ||
      (isVideo ? "video/mp4" : "image/jpeg");

    const CHUNK_SIZE = 1_800_000; // 1.8 MB per request (< Vercel 4.5 MB limit)
    const totalSize = preparedBlob.size;
    const chunkCount = Math.max(1, Math.ceil(totalSize / CHUNK_SIZE));

    onProgress?.(5);

    const initRes = await requestJson<{ ok: boolean; media_id: string }>(
      "/api/media",
      {
        method: "POST",
        body: JSON.stringify({
          step: "init",
          note_id: noteId,
          file_name: file.name,
          mime_type: mimeType,
          kind,
          total_size: totalSize,
          chunk_size: CHUNK_SIZE,
          chunk_count: chunkCount,
        }),
      }
    );

    const mediaId = initRes.media_id;

    for (let idx = 0; idx < chunkCount; idx++) {
      const start = idx * CHUNK_SIZE;
      const end = Math.min(totalSize, start + CHUNK_SIZE);
      const slice = preparedBlob.slice(start, end);
      const base64 = await blobToBase64(slice);

      await requestJson("/api/media", {
        method: "POST",
        body: JSON.stringify({
          step: "chunk",
          media_id: mediaId,
          chunk_index: idx,
          base64,
        }),
      });

      const pct = Math.round(((idx + 1) / chunkCount) * 90) + 5;
      onProgress?.(Math.min(96, pct));
    }

    const doneRes = await requestJson<{
      ok: boolean;
      media_id: string;
      url: string;
    }>("/api/media", {
      method: "POST",
      body: JSON.stringify({
        step: "complete",
        media_id: mediaId,
      }),
    });

    onProgress?.(100);
    return {
      mediaId: doneRes.media_id,
      url: doneRes.url,
      kind,
    };
  },

  deleteMedia(mediaId: string): Promise<{ ok: boolean }> {
    return requestJson(`/api/media?id=${encodeURIComponent(mediaId)}`, {
      method: "DELETE",
    });
  },
};
