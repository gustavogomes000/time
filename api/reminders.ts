import type { IncomingMessage, ServerResponse } from "node:http";
import {
  getPool,
  getQueryParams,
  readJsonBody,
  sendJson,
} from "./_lib/db.js";

interface ReminderInput {
  id?: string;
  title?: string;
  message?: string;
  remind_at?: string;
  phone?: string | null;
  recurrence?: "none" | "daily" | "weekly";
  send_whatsapp?: boolean;
  in_app_dismissed?: boolean;
  sent?: boolean;
  task_id?: string | null;
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
      const { rows } = await pool.query(`
        SELECT r.*, t.title AS task_title
          FROM public.gustavo_reminders r
          LEFT JOIN public.gustavo_tasks t ON t.id = r.task_id
         ORDER BY r.sent ASC, r.remind_at ASC, r.created_at DESC
         LIMIT 100
      `);
      return sendJson(res, 200, { ok: true, reminders: rows });
    }

    if (req.method === "POST") {
      const body = await readJsonBody<ReminderInput>(req);
      const title = (body.title || "").trim();
      const message = (body.message || title).trim();
      if (!title || !body.remind_at) {
        return sendJson(res, 400, {
          ok: false,
          error: "Informe título e data/hora do aviso.",
        });
      }

      const { rows } = await pool.query(
        `
        INSERT INTO public.gustavo_reminders (
          title,
          message,
          remind_at,
          phone,
          recurrence,
          send_whatsapp,
          task_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
        `,
        [
          title,
          message,
          body.remind_at,
          body.phone?.trim() || null,
          body.recurrence || "none",
          body.send_whatsapp !== undefined ? Boolean(body.send_whatsapp) : true,
          body.task_id || null,
        ]
      );

      // Run cron tick right away if remind_at <= now()
      await pool.query("SELECT public.gustavo_cron_tick();");
      const updated = await pool.query(
        "SELECT * FROM public.gustavo_reminders WHERE id = $1",
        [rows[0].id]
      );

      return sendJson(res, 201, {
        ok: true,
        reminder: updated.rows[0] || rows[0],
      });
    }

    if (req.method === "PATCH") {
      const body = await readJsonBody<ReminderInput>(req);
      const id = body.id || getQueryParams(req).get("id");
      if (!id) {
        return sendJson(res, 400, {
          ok: false,
          error: "ID do lembrete é obrigatório.",
        });
      }

      const curRes = await pool.query(
        "SELECT * FROM public.gustavo_reminders WHERE id = $1",
        [id]
      );
      if (curRes.rowCount === 0) {
        return sendJson(res, 404, {
          ok: false,
          error: "Aviso não encontrado.",
        });
      }
      const cur = curRes.rows[0];

      const { rows } = await pool.query(
        `
        UPDATE public.gustavo_reminders
           SET title = $1,
               message = $2,
               remind_at = $3,
               phone = $4,
               recurrence = $5,
               send_whatsapp = $6,
               in_app_dismissed = $7,
               sent = $8
         WHERE id = $9
         RETURNING *
        `,
        [
          body.title !== undefined ? body.title.trim() : cur.title,
          body.message !== undefined ? body.message.trim() : cur.message,
          body.remind_at ?? cur.remind_at,
          body.phone !== undefined ? body.phone?.trim() || null : cur.phone,
          body.recurrence ?? cur.recurrence,
          body.send_whatsapp !== undefined
            ? Boolean(body.send_whatsapp)
            : cur.send_whatsapp,
          body.in_app_dismissed !== undefined
            ? Boolean(body.in_app_dismissed)
            : cur.in_app_dismissed,
          body.sent !== undefined ? Boolean(body.sent) : cur.sent,
          id,
        ]
      );

      return sendJson(res, 200, { ok: true, reminder: rows[0] });
    }

    if (req.method === "DELETE") {
      const id = getQueryParams(req).get("id");
      if (!id) {
        return sendJson(res, 400, {
          ok: false,
          error: "ID do lembrete é obrigatório.",
        });
      }
      await pool.query("DELETE FROM public.gustavo_reminders WHERE id = $1", [
        id,
      ]);
      return sendJson(res, 200, { ok: true });
    }

    return sendJson(res, 405, { ok: false, error: "Método não suportado." });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return sendJson(res, 500, { ok: false, error: message });
  }
}
