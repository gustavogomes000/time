import type { IncomingMessage, ServerResponse } from "node:http";
import {
  getBrtDates,
  getPool,
  getQueryParams,
  readJsonBody,
  sendJson,
} from "./_lib/db.js";

interface TaskInput {
  id?: string;
  title?: string;
  description?: string;
  category?: "daily" | "conference";
  recurrence?: "none" | "weekly" | "biweekly" | "monthly";
  auto_recreate?: boolean;
  scheduled_date?: string;
  scheduled_time?: string | null;
  priority?: "low" | "normal" | "high";
  completed?: boolean;
  remind_whatsapp?: boolean;
  remind_at?: string | null;
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
) {
  if (req.method === "OPTIONS") {
    return sendJson(res, 200, { ok: true });
  }

  try {
    const pool = getPool();

    if (req.method === "GET") {
      await pool.query("SELECT public.gustavo_rollover_tasks();");
      const dates = await getBrtDates(pool);

      const { rows } = await pool.query(`
        SELECT *
          FROM public.gustavo_tasks
         ORDER BY
           completed ASC,
           CASE WHEN scheduled_date > original_date THEN 0 ELSE 1 END ASC,
           scheduled_time ASC NULLS LAST,
           CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END ASC,
           created_at ASC
      `);

      return sendJson(res, 200, {
        ok: true,
        today: dates.today,
        yesterday: dates.yesterday,
        nowIso: dates.nowIso,
        tasks: rows,
      });
    }

    if (req.method === "POST") {
      const body = await readJsonBody<TaskInput>(req);
      const title = (body.title || "").trim();
      if (!title) {
        return sendJson(res, 400, {
          ok: false,
          error: "Informe o título da demanda.",
        });
      }

      const dates = await getBrtDates(pool);
      const recurrence = body.recurrence || "none";
      const category =
        body.category || (recurrence !== "none" ? "conference" : "daily");
      const scheduledDate = body.scheduled_date || dates.today;
      const scheduledTime = body.scheduled_time?.trim() || null;
      const priority = body.priority || "normal";
      const autoRecreate =
        body.auto_recreate !== undefined ? Boolean(body.auto_recreate) : true;
      const remindWhatsapp = Boolean(body.remind_whatsapp && body.remind_at);
      const remindAt = remindWhatsapp && body.remind_at ? body.remind_at : null;

      const { rows } = await pool.query(
        `
        INSERT INTO public.gustavo_tasks (
          title,
          description,
          category,
          recurrence,
          auto_recreate,
          original_date,
          scheduled_date,
          scheduled_time,
          priority,
          remind_whatsapp,
          remind_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::date, $6::date, $7, $8, $9, $10)
        RETURNING *
        `,
        [
          title,
          (body.description || "").trim(),
          category,
          recurrence,
          autoRecreate,
          scheduledDate,
          scheduledTime,
          priority,
          remindWhatsapp,
          remindAt,
        ]
      );

      // Run rollover in case task was created on a past date
      await pool.query("SELECT public.gustavo_rollover_tasks();");
      const updated = await pool.query(
        "SELECT * FROM public.gustavo_tasks WHERE id = $1",
        [rows[0].id]
      );

      return sendJson(res, 201, { ok: true, task: updated.rows[0] });
    }

    if (req.method === "PATCH") {
      const body = await readJsonBody<TaskInput>(req);
      const id = body.id || getQueryParams(req).get("id");
      if (!id) {
        return sendJson(res, 400, {
          ok: false,
          error: "ID da tarefa é obrigatório.",
        });
      }

      const existingRes = await pool.query(
        "SELECT * FROM public.gustavo_tasks WHERE id = $1",
        [id]
      );
      if (existingRes.rowCount === 0) {
        return sendJson(res, 404, {
          ok: false,
          error: "Tarefa não encontrada.",
        });
      }
      const existing = existingRes.rows[0];
      const dates = await getBrtDates(pool);

      let completed = existing.completed as boolean;
      let completedAt = existing.completed_at as string | null;
      let completedDate = existing.completed_date as string | null;
      let scheduledDate = (body.scheduled_date ?? existing.scheduled_date) as string;
      let originalDate = existing.original_date as string;
      let rolloverCount = existing.rollover_count as number;
      let nextGenerated = existing.next_generated as boolean;
      let nextTask = null;

      // If user explicitly reschedules date cleanly while editing
      if (
        body.scheduled_date &&
        body.scheduled_date !== existing.scheduled_date &&
        body.completed === undefined
      ) {
        scheduledDate = body.scheduled_date;
        if (scheduledDate >= dates.today) {
          originalDate = scheduledDate;
          rolloverCount = 0;
        }
      }

      const wasCompleted = Boolean(existing.completed);
      if (typeof body.completed === "boolean") {
        completed = body.completed;
        if (completed && !wasCompleted) {
          completedAt = new Date().toISOString();
          completedDate = dates.today;
        } else if (!completed && wasCompleted) {
          completedAt = null;
          completedDate = null;
          if (originalDate < dates.today) {
            scheduledDate = dates.today;
          }
        }
      }

      const title =
        body.title !== undefined ? body.title.trim() : existing.title;
      const description =
        body.description !== undefined
          ? body.description.trim()
          : existing.description;
      const recurrence = body.recurrence ?? existing.recurrence;
      const category =
        body.category ??
        (recurrence !== "none" ? "conference" : existing.category);
      const autoRecreate =
        body.auto_recreate !== undefined
          ? Boolean(body.auto_recreate)
          : existing.auto_recreate;
      const scheduledTime =
        body.scheduled_time !== undefined
          ? body.scheduled_time?.trim() || null
          : existing.scheduled_time;
      const priority = body.priority ?? existing.priority;
      const remindWhatsapp =
        body.remind_whatsapp !== undefined
          ? Boolean(body.remind_whatsapp)
          : existing.remind_whatsapp;
      const remindAt =
        body.remind_at !== undefined ? body.remind_at : existing.remind_at;
      const remindSent =
        body.remind_at !== undefined && body.remind_at !== existing.remind_at
          ? false
          : existing.remind_sent;

      // Auto-generate next cycle when a recurring task is completed for the first time
      if (
        completed &&
        !wasCompleted &&
        recurrence !== "none" &&
        autoRecreate &&
        !nextGenerated
      ) {
        const intervalSql =
          recurrence === "weekly"
            ? "7 days"
            : recurrence === "biweekly"
            ? "14 days"
            : "1 month";

        const nextRes = await pool.query(
          `
          INSERT INTO public.gustavo_tasks (
            title,
            description,
            category,
            recurrence,
            auto_recreate,
            parent_task_id,
            original_date,
            scheduled_date,
            scheduled_time,
            priority,
            remind_whatsapp,
            remind_at
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            (GREATEST($7::date, $8::date) + $9::interval)::date,
            (GREATEST($7::date, $8::date) + $9::interval)::date,
            $10,
            $11,
            false,
            NULL
          )
          RETURNING *
          `,
          [
            title,
            description,
            category,
            recurrence,
            autoRecreate,
            id,
            originalDate,
            dates.today,
            intervalSql,
            scheduledTime,
            priority,
          ]
        );
        nextTask = nextRes.rows[0];
        nextGenerated = true;
      }

      const { rows } = await pool.query(
        `
        UPDATE public.gustavo_tasks
           SET title = $1,
               description = $2,
               category = $3,
               recurrence = $4,
               auto_recreate = $5,
               original_date = $6::date,
               scheduled_date = $7::date,
               scheduled_time = $8,
               priority = $9,
               completed = $10,
               completed_at = $11,
               completed_date = $12::date,
               rollover_count = $13,
               next_generated = $14,
               remind_whatsapp = $15,
               remind_at = $16,
               remind_sent = $17,
               updated_at = now()
         WHERE id = $18
         RETURNING *
        `,
        [
          title,
          description,
          category,
          recurrence,
          autoRecreate,
          originalDate,
          scheduledDate,
          scheduledTime,
          priority,
          completed,
          completedAt,
          completedDate,
          rolloverCount,
          nextGenerated,
          remindWhatsapp,
          remindAt,
          remindSent,
          id,
        ]
      );

      await pool.query("SELECT public.gustavo_rollover_tasks();");
      const finalRow = await pool.query(
        "SELECT * FROM public.gustavo_tasks WHERE id = $1",
        [id]
      );

      return sendJson(res, 200, {
        ok: true,
        task: finalRow.rows[0] || rows[0],
        nextTask,
      });
    }

    if (req.method === "DELETE") {
      const id = getQueryParams(req).get("id");
      if (!id) {
        return sendJson(res, 400, {
          ok: false,
          error: "ID da tarefa é obrigatório.",
        });
      }
      await pool.query("DELETE FROM public.gustavo_tasks WHERE id = $1", [id]);
      return sendJson(res, 200, { ok: true });
    }

    return sendJson(res, 405, { ok: false, error: "Método não suportado." });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return sendJson(res, 500, { ok: false, error: message });
  }
}
