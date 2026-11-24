// Supabase Edge Function: send-whatsapp
// API de Disparo — Gustavo Gomes
//
// Configure os Secrets no Supabase:
//   supabase secrets set WHATSAPP_API_URL="http://189.24.0.59:3000"
//   supabase secrets set WHATSAPP_API_KEY="<SUA_CHAVE>"
//   supabase secrets set WHATSAPP_INSTANCE="gusta-teste"
//
// Deploy:
//   supabase functions deploy send-whatsapp --no-verify-jwt

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type WhatsAppAction =
  | "text"
  | "image"
  | "document"
  | "audio"
  | "unified"
  | "check";

interface SendWhatsAppPayload {
  action?: WhatsAppAction;
  instance?: string;
  number?: string;
  numbers?: string[];
  text?: string;
  url?: string;
  caption?: string;
  fileName?: string;
  audio?: string;
  // Formato unificado (umClique)
  channel_id?: string;
  to?: string;
  type?: "text" | "image" | "document" | "video" | "audio";
  content?: string;
}

function sanitizePhone(raw: string): string {
  return raw.replace(/\D/g, "");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ ok: false, error: "Método não permitido. Use POST." }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  try {
    const baseUrl = (
      Deno.env.get("WHATSAPP_API_URL") || "http://189.24.0.59:3000"
    ).replace(/\/+$/, "");
    const apiKey = Deno.env.get("WHATSAPP_API_KEY");
    const defaultInstance = Deno.env.get("WHATSAPP_INSTANCE") || "gusta-teste";

    if (!apiKey) {
      return new Response(
        JSON.stringify({
          ok: false,
          error:
            "Secret WHATSAPP_API_KEY não configurado na Edge Function do Supabase.",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const body = (await req.json()) as SendWhatsAppPayload;
    const action: WhatsAppAction = body.action || "text";
    const instance = body.instance || defaultInstance;

    let endpoint = "";
    let upstreamBody: Record<string, unknown> = {};

    switch (action) {
      case "text": {
        if (!body.number || !body.text) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: "Campos 'number' e 'text' são obrigatórios.",
            }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
        endpoint = "/v1/messages/text";
        upstreamBody = {
          instance,
          number: sanitizePhone(body.number),
          text: body.text,
        };
        break;
      }

      case "image": {
        if (!body.number || !body.url) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: "Campos 'number' e 'url' são obrigatórios para imagem.",
            }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
        endpoint = "/v1/messages/image";
        upstreamBody = {
          instance,
          number: sanitizePhone(body.number),
          url: body.url,
          caption: body.caption || "",
        };
        break;
      }

      case "document": {
        if (!body.number || !body.url) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: "Campos 'number' e 'url' são obrigatórios para documento.",
            }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
        endpoint = "/v1/messages/document";
        upstreamBody = {
          instance,
          number: sanitizePhone(body.number),
          url: body.url,
          fileName: body.fileName || "documento.pdf",
          caption: body.caption || "",
        };
        break;
      }

      case "audio": {
        if (!body.number || !(body.audio || body.url)) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: "Campos 'number' e 'audio' são obrigatórios para áudio.",
            }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
        endpoint = "/v1/messages/audio";
        upstreamBody = {
          instance,
          number: sanitizePhone(body.number),
          audio: body.audio || body.url,
        };
        break;
      }

      case "unified": {
        const target = body.to || body.number;
        if (!target || !body.type) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: "Campos 'to' e 'type' são obrigatórios no modo unificado.",
            }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
        endpoint = "/functions/v1/public-send-message";
        upstreamBody = {
          channel_id: body.channel_id || instance,
          to: sanitizePhone(target),
          type: body.type,
          content: body.content ?? body.text ?? "",
          url: body.url ?? "",
          caption: body.caption ?? "",
        };
        break;
      }

      case "check": {
        const list =
          body.numbers?.map(sanitizePhone) ||
          (body.number ? [sanitizePhone(body.number)] : []);
        if (!list.length) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: "Informe 'numbers' (array) ou 'number' para verificar.",
            }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
        endpoint = "/v1/contacts/check";
        upstreamBody = {
          instance,
          numbers: list,
        };
        break;
      }

      default:
        return new Response(
          JSON.stringify({ ok: false, error: `Ação inválida: ${action}` }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
    }

    const upstreamRes = await fetch(`${baseUrl}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify(upstreamBody),
    });

    const rawText = await upstreamRes.text();
    let parsed: unknown = rawText;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      // keep text if non-json
    }

    return new Response(
      JSON.stringify({
        ok: upstreamRes.ok,
        status: upstreamRes.status,
        action,
        data: parsed,
      }),
      {
        status: upstreamRes.ok ? 200 : upstreamRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ ok: false, error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
