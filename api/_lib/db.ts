import pg from "pg";
import type { IncomingMessage, ServerResponse } from "node:http";

// Keep PostgreSQL DATE columns (OID 1082) as raw 'YYYY-MM-DD' strings
// to avoid JavaScript Date UTC shift issues.
pg.types.setTypeParser(1082, (val: string) => val);

const { Pool } = pg;

declare global {
  // eslint-disable-next-line no-var
  var __gustavoPgPool: pg.Pool | undefined;
}

export function getPool(): pg.Pool {
  if (!globalThis.__gustavoPgPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        "Variável DATABASE_URL não configurada no ambiente do servidor."
      );
    }
    globalThis.__gustavoPgPool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30000,
    });
  }
  return globalThis.__gustavoPgPool;
}

export async function getBrtDates(pool: pg.Pool): Promise<{
  today: string;
  yesterday: string;
  nowIso: string;
}> {
  const { rows } = await pool.query<{
    today: string;
    yesterday: string;
    now_iso: string;
  }>(`
    SELECT
      ((now() AT TIME ZONE 'America/Sao_Paulo')::date)::text AS today,
      (((now() AT TIME ZONE 'America/Sao_Paulo')::date) - 1)::text AS yesterday,
      to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI:SS') AS now_iso
  `);
  return {
    today: rows[0].today,
    yesterday: rows[0].yesterday,
    nowIso: rows[0].now_iso,
  };
}

export async function readJsonBody<T = Record<string, unknown>>(
  req: IncomingMessage & { body?: unknown }
): Promise<T> {
  if (req.body && typeof req.body === "object") {
    return req.body as T;
  }
  if (typeof req.body === "string" && req.body.trim()) {
    return JSON.parse(req.body) as T;
  }
  return new Promise<T>((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      if (!raw.trim()) {
        resolve({} as T);
        return;
      }
      try {
        resolve(JSON.parse(raw) as T);
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

export function sendJson(
  res: ServerResponse,
  status: number,
  payload: unknown
): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS"
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.end(JSON.stringify(payload));
}

export function getQueryParams(req: IncomingMessage): URLSearchParams {
  const url = new URL(req.url || "/", "http://localhost");
  return url.searchParams;
}
