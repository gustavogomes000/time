import type { IncomingMessage, ServerResponse } from "node:http";
import { getPool, readJsonBody, sendJson } from "./_lib/db.js";

interface SettingsInput {
  default_phone?: string;
  daily_summary_enabled?: boolean;
  daily_summary_time?: string;
  timezone?: string;
  whatsapp_api_url?: string;
  whatsapp_api_key?: string;
  whatsapp_instance?: string;
}

function maskKey(key: string | null | undefined): string {
  if (!key) return "";
  if (key.length <= 10) return "••••••••";
  return `${key.slice(0, 7)}••••••••${key.slice(-4)}`;
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
      const cfgRes = await pool.query(
        "SELECT * FROM public.gustavo_settings WHERE id = 1"
      );
      const cfg = cfgRes.rows[0];
      const effectiveKey =
        process.env.WHATSAPP_API_KEY || cfg?.whatsapp_api_key || "";

      const previewRes = await pool.query(
        "SELECT public.gustavo_build_daily_summary() AS preview"
      );
      const logsRes = await pool.query(`
        SELECT id, kind, phone, message_preview, status, response_body, created_at
          FROM public.gustavo_whatsapp_logs
         ORDER BY created_at DESC
         LIMIT 20
      `);

      return sendJson(res, 200, {
        ok: true,
        settings: {
          default_phone: cfg?.default_phone || "556293885258",
          daily_summary_enabled: cfg?.daily_summary_enabled ?? true,
          daily_summary_time: cfg?.daily_summary_time || "19:00",
          last_summary_sent_date: cfg?.last_summary_sent_date || null,
          timezone: cfg?.timezone || "America/Sao_Paulo",
          whatsapp_api_url:
            cfg?.whatsapp_api_url ||
            process.env.WHATSAPP_API_URL ||
            "http://189.24.0.59:3000",
          whatsapp_instance:
            cfg?.whatsapp_instance ||
            process.env.WHATSAPP_INSTANCE ||
            "gusta-teste",
          has_api_key: Boolean(effectiveKey),
          masked_api_key: maskKey(effectiveKey),
        },
        summaryPreview: previewRes.rows[0]?.preview || "",
        logs: logsRes.rows,
      });
    }

    if (req.method === "PUT" || req.method === "PATCH") {
      const body = await readJsonBody<SettingsInput>(req);
      const curRes = await pool.query(
        "SELECT * FROM public.gustavo_settings WHERE id = 1"
      );
      const cur = curRes.rows[0];

      const nextPhone =
        body.default_phone !== undefined
          ? body.default_phone.replace(/\D/g, "")
          : cur.default_phone;
      const nextEnabled =
        body.daily_summary_enabled !== undefined
          ? Boolean(body.daily_summary_enabled)
          : cur.daily_summary_enabled;
      const nextTime = body.daily_summary_time || cur.daily_summary_time;
      const nextTz = body.timezone || cur.timezone || "America/Sao_Paulo";
      const nextUrl = (
        body.whatsapp_api_url ||
        cur.whatsapp_api_url ||
        "http://189.24.0.59:3000"
      ).replace(/\/+$/, "");
      const nextInstance =
        body.whatsapp_instance || cur.whatsapp_instance || "gusta-teste";
      const nextKey =
        body.whatsapp_api_key && body.whatsapp_api_key.trim()
          ? body.whatsapp_api_key.trim()
          : cur.whatsapp_api_key;

      const { rows } = await pool.query(
        `
        UPDATE public.gustavo_settings
           SET default_phone = $1,
               daily_summary_enabled = $2,
               daily_summary_time = $3,
               timezone = $4,
               whatsapp_api_url = $5,
               whatsapp_api_key = $6,
               whatsapp_instance = $7,
               updated_at = now()
         WHERE id = 1
         RETURNING *
        `,
        [
          nextPhone,
          nextEnabled,
          nextTime,
          nextTz,
          nextUrl,
          nextKey,
          nextInstance,
        ]
      );

      const updated = rows[0];
      const effectiveKey =
        process.env.WHATSAPP_API_KEY || updated.whatsapp_api_key || "";

      return sendJson(res, 200, {
        ok: true,
        settings: {
          default_phone: updated.default_phone,
          daily_summary_enabled: updated.daily_summary_enabled,
          daily_summary_time: updated.daily_summary_time,
          last_summary_sent_date: updated.last_summary_sent_date,
          timezone: updated.timezone,
          whatsapp_api_url: updated.whatsapp_api_url,
          whatsapp_instance: updated.whatsapp_instance,
          has_api_key: Boolean(effectiveKey),
          masked_api_key: maskKey(effectiveKey),
        },
      });
    }

    return sendJson(res, 405, { ok: false, error: "Método não suportado." });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return sendJson(res, 500, { ok: false, error: message });
  }
}
