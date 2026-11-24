import type { IncomingMessage, ServerResponse } from "node:http";
import {
  getPool,
  getQueryParams,
  readJsonBody,
  sendJson,
} from "./_lib/db.js";

interface NotesPayload {
  entity?: "folder" | "note";
  id?: string;
  // Folder fields
  parent_id?: string | null;
  name?: string;
  color?: string;
  position?: number;
  // Note fields
  folder_id?: string | null;
  title?: string;
  icon?: string;
  cover_color?: string;
  pinned?: boolean;
  tags?: string[];
  content?: string;
  blocks?: unknown[];
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
      const [foldersRes, notesRes] = await Promise.all([
        pool.query(`
          SELECT *
            FROM public.gustavo_folders
           ORDER BY position ASC, lower(name) ASC, created_at ASC
        `),
        pool.query(`
          SELECT *
            FROM public.gustavo_notes
           ORDER BY pinned DESC, updated_at DESC
        `),
      ]);

      return sendJson(res, 200, {
        ok: true,
        folders: foldersRes.rows,
        notes: notesRes.rows,
      });
    }

    if (req.method === "POST") {
      const body = await readJsonBody<NotesPayload>(req);
      const entity = body.entity || "note";

      if (entity === "folder") {
        const name = (body.name || "").trim();
        if (!name) {
          return sendJson(res, 400, {
            ok: false,
            error: "Informe o nome da pasta.",
          });
        }
        const { rows } = await pool.query(
          `
          INSERT INTO public.gustavo_folders (parent_id, name, icon, color, position)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING *
          `,
          [
            body.parent_id || null,
            name,
            body.icon || "📁",
            body.color || "sky",
            body.position ?? 0,
          ]
        );
        return sendJson(res, 201, { ok: true, folder: rows[0] });
      }

      // Create Note / Card
      const title = (body.title ?? "Sem título").trim() || "Sem título";
      const blocks = Array.isArray(body.blocks)
        ? body.blocks
        : [{ id: crypto.randomUUID(), type: "paragraph", text: "" }];

      const { rows } = await pool.query(
        `
        INSERT INTO public.gustavo_notes (
          folder_id,
          title,
          icon,
          cover_color,
          pinned,
          tags,
          content,
          blocks
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
        RETURNING *
        `,
        [
          body.folder_id || null,
          title,
          body.icon || "📝",
          body.cover_color || "sky",
          Boolean(body.pinned),
          Array.isArray(body.tags) ? body.tags : [],
          body.content || "",
          JSON.stringify(blocks),
        ]
      );

      return sendJson(res, 201, { ok: true, note: rows[0] });
    }

    if (req.method === "PATCH") {
      const body = await readJsonBody<NotesPayload>(req);
      const entity = body.entity || "note";
      const id = body.id || getQueryParams(req).get("id");
      if (!id) {
        return sendJson(res, 400, {
          ok: false,
          error: "ID é obrigatório.",
        });
      }

      if (entity === "folder") {
        const curRes = await pool.query(
          "SELECT * FROM public.gustavo_folders WHERE id = $1",
          [id]
        );
        if (curRes.rowCount === 0) {
          return sendJson(res, 404, {
            ok: false,
            error: "Pasta não encontrada.",
          });
        }
        const cur = curRes.rows[0];
        const nextParent =
          body.parent_id !== undefined ? body.parent_id : cur.parent_id;
        if (nextParent === id) {
          return sendJson(res, 400, {
            ok: false,
            error: "Uma pasta não pode ser subpasta dela mesma.",
          });
        }

        const { rows } = await pool.query(
          `
          UPDATE public.gustavo_folders
             SET name = $1,
                 parent_id = $2,
                 icon = $3,
                 color = $4,
                 updated_at = now()
           WHERE id = $5
           RETURNING *
          `,
          [
            body.name !== undefined ? body.name.trim() || cur.name : cur.name,
            nextParent,
            body.icon ?? cur.icon,
            body.color ?? cur.color,
            id,
          ]
        );
        return sendJson(res, 200, { ok: true, folder: rows[0] });
      }

      // Update Note / Card
      const curRes = await pool.query(
        "SELECT * FROM public.gustavo_notes WHERE id = $1",
        [id]
      );
      if (curRes.rowCount === 0) {
        return sendJson(res, 404, {
          ok: false,
          error: "Anotação não encontrada.",
        });
      }
      const cur = curRes.rows[0];

      const nextTitle =
        body.title !== undefined
          ? body.title.trim() || "Sem título"
          : cur.title;
      const nextFolder =
        body.folder_id !== undefined ? body.folder_id : cur.folder_id;
      const nextBlocks =
        body.blocks !== undefined ? body.blocks : cur.blocks;

      const { rows } = await pool.query(
        `
        UPDATE public.gustavo_notes
           SET folder_id = $1,
               title = $2,
               icon = $3,
               cover_color = $4,
               pinned = $5,
               tags = $6,
               content = $7,
               blocks = $8::jsonb,
               updated_at = now()
         WHERE id = $9
         RETURNING *
        `,
        [
          nextFolder,
          nextTitle,
          body.icon ?? cur.icon,
          body.cover_color ?? cur.cover_color,
          body.pinned !== undefined ? Boolean(body.pinned) : cur.pinned,
          body.tags !== undefined ? body.tags : cur.tags,
          body.content !== undefined ? body.content : cur.content,
          JSON.stringify(nextBlocks),
          id,
        ]
      );

      return sendJson(res, 200, { ok: true, note: rows[0] });
    }

    if (req.method === "DELETE") {
      const params = getQueryParams(req);
      const id = params.get("id");
      const entity = params.get("entity") || "note";
      if (!id) {
        return sendJson(res, 400, {
          ok: false,
          error: "ID é obrigatório.",
        });
      }

      if (entity === "folder") {
        await pool.query("DELETE FROM public.gustavo_folders WHERE id = $1", [
          id,
        ]);
      } else {
        await pool.query("DELETE FROM public.gustavo_notes WHERE id = $1", [
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
