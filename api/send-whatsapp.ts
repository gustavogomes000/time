import type { IncomingMessage, ServerResponse } from "node:http";
import { getPool, readJsonBody, sendJson } from "./_lib/db.js";

type ActionType =
  | "text"
  | "image"
  | "document"
  | "audio"
  | "unified"
  | "check"
  | "daily_summary";

interface WhatsAppPayload {
  action?: ActionType;
  kind?: string;
  instance?: string;
  number?: string;
  numbers?: string[];
  text?: string;
  url?: string;
  caption?: string;
  fileName?: string;
  audio?: string;
  channel_id?: string;
  to?: string;
  type?: "text" | "image" | "document" | "video" | "audio";
  content?: string;
  date?: string;
}

function cleanPhone(raw: string): string {
  return raw.replace(/\D/g, "");
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
) {
  if (req.method === "OPTIONS") {
    return sendJson(res, 200, { ok: true });
  }

  if (req.method !== "POST") {
    return sendJson(res, 405, {
      ok: false,
      error: "Método não permitido. Use POST.",
    });
  }

  try {
    const pool = getPool();
    const cfgRes = await pool.query(
      "SELECT * FROM public.gustavo_settings WHERE id = 1"
    );
    const cfg = cfgRes.rows[0];

    const baseUrl = (
      process.env.WHATSAPP_API_URL ||
      cfg?.whatsapp_api_url ||
      "http://189.24.0.59:3000"
    ).replace(/\/+$/, "");

    const apiKey =
      process.env.WHATSAPP_API_KEY || cfg?.whatsapp_api_key || "";

    const instance =
      process.env.WHATSAPP_INSTANCE ||
      cfg?.whatsapp_instance ||
      "gusta-teste";

    if (!apiKey) {
      return sendJson(res, 500, {
        ok: false,
        error: "WHATSAPP_API_KEY não configurada.",
      });
    }

    const body = await readJsonBody<WhatsAppPayload>(req);
    const action: ActionType = body.action || "text";
    const targetNumber = cleanPhone(
      body.number || body.to || cfg?.default_phone || ""
    );
    const chosenInstance = body.instance || instance;

    let endpoint = "/v1/messages/text";
    let upstreamPayload: Record<string, unknown> = {};
    let logPreview = "";
    let logKind = body.kind || action;

    switch (action) {
      case "daily_summary": {
        if (!targetNumber) {
          return sendJson(res, 400, {
            ok: false,
            error: "Configure um número de WhatsApp destino primeiro.",
          });
        }
        const sumRes = await pool.query(
          "SELECT public.gustavo_build_daily_summary($1::date) AS summary",
          [body.date || null]
        );
        const summaryText = sumRes.rows[0]?.summary || "";
        endpoint = "/v1/messages/text";
        upstreamPayload = {
          instance: chosenInstance,
          number: targetNumber,
          text: summaryText,
        };
        logPreview = summaryText.slice(0, 240);
        logKind = "daily_summary";
        break;
      }

      case "text": {
        if (!targetNumber || !body.text?.trim()) {
          return sendJson(res, 400, {
            ok: false,
            error: "Informe número e texto da mensagem.",
          });
        }
        endpoint = "/v1/messages/text";
        upstreamPayload = {
          instance: chosenInstance,
          number: targetNumber,
          text: body.text.trim(),
        };
        logPreview = body.text.trim().slice(0, 240);
        break;
      }

      case "image": {
        if (!targetNumber || !body.url) {
          return sendJson(res, 400, {
            ok: false,
            error: "Informe número e URL da imagem.",
          });
        }
        endpoint = "/v1/messages/image";
        upstreamPayload = {
          instance: chosenInstance,
          number: targetNumber,
          url: body.url,
          caption: body.caption || "",
        };
        logPreview = `[Imagem] ${body.caption || body.url}`.slice(0, 240);
        break;
      }

      case "document": {
        if (!targetNumber || !body.url) {
          return sendJson(res, 400, {
            ok: false,
            error: "Informe número e URL do documento.",
          });
        }
        endpoint = "/v1/messages/document";
        upstreamPayload = {
          instance: chosenInstance,
          number: targetNumber,
          url: body.url,
          fileName: body.fileName || "documento.pdf",
          caption: body.caption || "",
        };
        logPreview = `[Documento] ${body.fileName || body.url}`.slice(0, 240);
        break;
      }

      case "audio": {
        const audioUrl = body.audio || body.url;
        if (!targetNumber || !audioUrl) {
          return sendJson(res, 400, {
            ok: false,
            error: "Informe número e URL do áudio.",
          });
        }
        endpoint = "/v1/messages/audio";
        upstreamPayload = {
          instance: chosenInstance,
          number: targetNumber,
          audio: audioUrl,
        };
        logPreview = `[Áudio] ${audioUrl}`.slice(0, 240);
        break;
      }

      case "unified": {
        if (!targetNumber || !body.type) {
          return sendJson(res, 400, {
            ok: false,
            error: "Informe destinatário e tipo para envio unificado.",
          });
        }
        endpoint = "/functions/v1/public-send-message";
        upstreamPayload = {
          channel_id: body.channel_id || chosenInstance,
          to: targetNumber,
          type: body.type,
          content: body.content ?? body.text ?? "",
          url: body.url ?? "",
          caption: body.caption ?? "",
        };
        logPreview = `[Unificado:${body.type}] ${
          body.content || body.caption || body.url || ""
        }`.slice(0, 240);
        break;
      }

      case "check": {
        const list =
          body.numbers?.map(cleanPhone).filter(Boolean) ||
          (targetNumber ? [targetNumber] : []);
        if (!list.length) {
          return sendJson(res, 400, {
            ok: false,
            error: "Informe ao menos um número para verificar.",
          });
        }
        endpoint = "/v1/contacts/check";
        upstreamPayload = {
          instance: chosenInstance,
          numbers: list,
        };
        logPreview = `[Verificação] ${list.join(", ")}`;
        break;
      }

      default:
        return sendJson(res, 400, {
          ok: false,
          error: `Ação inválida: ${action}`,
        });
    }

    const upstreamRes = await fetch(`${baseUrl}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify(upstreamPayload),
    });

    const rawText = await upstreamRes.text();
    let parsed: unknown = rawText;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      // preserve text
    }

    if (action !== "check") {
      await pool.query(
        `
        INSERT INTO public.gustavo_whatsapp_logs (kind, phone, message_preview, status, response_body)
        VALUES ($1, $2, $3, $4, $5)
        `,
        [
          logKind,
          targetNumber,
          logPreview,
          upstreamRes.ok ? "sent" : "error",
          rawText.slice(0, 500),
        ]
      );
    }

    return sendJson(res, upstreamRes.ok ? 200 : upstreamRes.status, {
      ok: upstreamRes.ok,
      status: upstreamRes.status,
      action,
      data: parsed,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return sendJson(res, 500, { ok: false, error: message });
  }
}
