import type { IncomingMessage, ServerResponse } from "node:http";
import {
  getPool,
  getQueryParams,
  readJsonBody,
  sendJson,
} from "./_lib/db.js";

const MAX_RESPONSE_SLICE = 3_400_000; // 3.4 MB (safely below Vercel 4.5 MB limit)

interface MediaUploadPayload {
  step: "init" | "chunk" | "complete";
  note_id?: string | null;
  media_id?: string;
  file_name?: string;
  mime_type?: string;
  kind?: "image" | "video";
  total_size?: number;
  chunk_size?: number;
  chunk_count?: number;
  chunk_index?: number;
  base64?: string;
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

    // Stream photo or video with HTTP Range support
    if (req.method === "GET") {
      const id = getQueryParams(req).get("id");
      if (!id) {
        return sendJson(res, 400, { ok: false, error: "ID de mídia ausente." });
      }

      const metaRes = await pool.query(
        "SELECT * FROM public.gustavo_media WHERE id = $1 AND completed = true",
        [id]
      );
      if (metaRes.rowCount === 0) {
        res.statusCode = 404;
        res.end("Not found");
        return;
      }

      const meta = metaRes.rows[0];
      const totalSize = Number(meta.total_size);
      const chunkSize = Number(meta.chunk_size) || 1_800_000;
      const mimeType = (meta.mime_type as string) || "application/octet-stream";
      const rangeHeader = req.headers.range;

      if (!rangeHeader && totalSize <= 3_800_000) {
        const chunksRes = await pool.query<{ data: Buffer }>(
          `
          SELECT data
            FROM public.gustavo_media_chunks
           WHERE media_id = $1
           ORDER BY chunk_index ASC
          `,
          [id]
        );
        const fullBuf = Buffer.concat(chunksRes.rows.map((r) => r.data));
        res.statusCode = 200;
        res.setHeader("Content-Type", mimeType);
        res.setHeader("Content-Length", String(fullBuf.length));
        res.setHeader("Accept-Ranges", "bytes");
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        res.end(fullBuf);
        return;
      }

      // Parse Range: bytes=start-end (or fallback to first slice for >3.8MB)
      let start = 0;
      let requestedEnd = totalSize - 1;
      if (rangeHeader) {
        const match = /bytes=(\d+)-(\d*)/.exec(rangeHeader);
        if (match) {
          start = parseInt(match[1], 10);
          if (match[2]) {
            requestedEnd = parseInt(match[2], 10);
          }
        }
      }

      if (start >= totalSize || start < 0) {
        res.statusCode = 416;
        res.setHeader("Content-Range", `bytes */${totalSize}`);
        res.end();
        return;
      }

      const end = Math.min(
        requestedEnd,
        start + MAX_RESPONSE_SLICE - 1,
        totalSize - 1
      );

      const firstChunk = Math.floor(start / chunkSize);
      const lastChunk = Math.floor(end / chunkSize);

      const chunksRes = await pool.query<{ chunk_index: number; data: Buffer }>(
        `
        SELECT chunk_index, data
          FROM public.gustavo_media_chunks
         WHERE media_id = $1
           AND chunk_index BETWEEN $2 AND $3
         ORDER BY chunk_index ASC
        `,
        [id, firstChunk, lastChunk]
      );

      const combined = Buffer.concat(chunksRes.rows.map((r) => r.data));
      const sliceStart = start - firstChunk * chunkSize;
      const sliceLength = end - start + 1;
      const outBuf = combined.subarray(sliceStart, sliceStart + sliceLength);

      res.statusCode = 206;
      res.setHeader("Content-Type", mimeType);
      res.setHeader(
        "Content-Range",
        `bytes ${start}-${start + outBuf.length - 1}/${totalSize}`
      );
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Content-Length", String(outBuf.length));
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.end(outBuf);
      return;
    }

    // Chunked Upload Protocol
    if (req.method === "POST") {
      const body = await readJsonBody<MediaUploadPayload>(req);

      if (body.step === "init") {
        const kind = body.kind === "video" ? "video" : "image";
        const { rows } = await pool.query(
          `
          INSERT INTO public.gustavo_media (
            note_id,
            file_name,
            mime_type,
            kind,
            total_size,
            chunk_size,
            chunk_count,
            completed
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, false)
          RETURNING id
          `,
          [
            body.note_id || null,
            body.file_name || "arquivo",
            body.mime_type ||
              (kind === "video" ? "video/mp4" : "image/jpeg"),
            kind,
            body.total_size || 0,
            body.chunk_size || 1_800_000,
            body.chunk_count || 1,
          ]
        );
        return sendJson(res, 201, { ok: true, media_id: rows[0].id });
      }

      if (body.step === "chunk") {
        if (!body.media_id || body.chunk_index === undefined || !body.base64) {
          return sendJson(res, 400, {
            ok: false,
            error: "Dados do fragmento incompletos.",
          });
        }
        const buf = Buffer.from(body.base64, "base64");
        await pool.query(
          `
          INSERT INTO public.gustavo_media_chunks (media_id, chunk_index, byte_length, data)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (media_id, chunk_index)
          DO UPDATE SET byte_length = EXCLUDED.byte_length, data = EXCLUDED.data
          `,
          [body.media_id, body.chunk_index, buf.length, buf]
        );
        return sendJson(res, 200, { ok: true, chunk_index: body.chunk_index });
      }

      if (body.step === "complete") {
        if (!body.media_id) {
          return sendJson(res, 400, {
            ok: false,
            error: "media_id é obrigatório.",
          });
        }
        await pool.query(
          "UPDATE public.gustavo_media SET completed = true WHERE id = $1",
          [body.media_id]
        );
        return sendJson(res, 200, {
          ok: true,
          media_id: body.media_id,
          url: `/api/media?id=${body.media_id}`,
        });
      }

      return sendJson(res, 400, {
        ok: false,
        error: "Etapa de upload inválida.",
      });
    }

    if (req.method === "DELETE") {
      const id = getQueryParams(req).get("id");
      if (id) {
        await pool.query("DELETE FROM public.gustavo_media WHERE id = $1", [
          id,
        ]);
      }
      return sendJson(res, 200, { ok: true });
    }

    return sendJson(res, 405, { ok: false, error: "Método não suportado." });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return sendJson(res, 500, { ok: false, error: message });
  }
}
