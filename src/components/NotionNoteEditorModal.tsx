import React, { useEffect, useRef, useState } from "react";
import {
  X,
  Pin,
  Trash2,
  Type,
  Heading2,
  CheckSquare,
  Info,
  Minus,
  Image as ImageIcon,
  Video,
  Link2,
  ArrowUp,
  ArrowDown,
  Check,
  Maximize2,
  FolderOpen,
  UploadCloud,
} from "lucide-react";
import { api } from "../lib/api";
import type {
  NoteBlock,
  NoteBlockType,
  NoteFolder,
  NoteItem,
} from "../types";

interface NotionNoteEditorModalProps {
  note: NoteItem | null;
  folders: NoteFolder[];
  onClose: () => void;
  onUpdated: (updated: NoteItem) => void;
  onDeleted: (noteId: string) => void;
  onNotifyToast: (msg: string, type?: "success" | "error") => void;
}

const ICONS = [
  "📝",
  "💡",
  "📌",
  "📊",
  "📸",
  "🎬",
  "🚀",
  "✅",
  "💼",
  "🛠️",
  "📂",
  "⭐",
];

const COVERS: { id: string; label: string; bgClass: string }[] = [
  {
    id: "sky",
    label: "Azul Claro",
    bgClass: "bg-gradient-to-r from-sky-400 to-sky-600",
  },
  {
    id: "ocean",
    label: "Oceano",
    bgClass: "bg-gradient-to-r from-cyan-500 to-blue-600",
  },
  {
    id: "emerald",
    label: "Verde",
    bgClass: "bg-gradient-to-r from-emerald-400 to-teal-600",
  },
  {
    id: "amber",
    label: "Âmbar",
    bgClass: "bg-gradient-to-r from-amber-400 to-orange-500",
  },
  {
    id: "rose",
    label: "Coral",
    bgClass: "bg-gradient-to-r from-rose-400 to-red-500",
  },
  {
    id: "slate",
    label: "Neutro",
    bgClass: "bg-gradient-to-r from-slate-600 to-slate-800",
  },
];

function extractPlainSummary(blocks: NoteBlock[]): string {
  return blocks
    .map((b) => b.text || b.caption || "")
    .filter(Boolean)
    .join(" • ")
    .slice(0, 300);
}

function getYoutubeEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com") && u.searchParams.get("v")) {
      return `https://www.youtube.com/embed/${u.searchParams.get("v")}`;
    }
    if (u.hostname === "youtu.be" && u.pathname.length > 1) {
      return `https://www.youtube.com/embed/${u.pathname.slice(1)}`;
    }
    if (u.hostname.includes("vimeo.com")) {
      const id = u.pathname.split("/").filter(Boolean).pop();
      if (id && /^\d+$/.test(id)) {
        return `https://player.vimeo.com/video/${id}`;
      }
    }
  } catch {
    // ignore invalid URL
  }
  return null;
}

function buildFolderPathLabel(
  folderId: string,
  folderMap: Map<string, NoteFolder>
): string {
  const parts: string[] = [];
  let cur = folderMap.get(folderId);
  let guard = 0;
  while (cur && guard < 15) {
    parts.unshift(`${cur.icon} ${cur.name}`);
    cur = cur.parent_id ? folderMap.get(cur.parent_id) : undefined;
    guard++;
  }
  return parts.join(" / ");
}

export const NotionNoteEditorModal: React.FC<NotionNoteEditorModalProps> = ({
  note,
  folders,
  onClose,
  onUpdated,
  onDeleted,
  onNotifyToast,
}) => {
  const [title, setTitle] = useState("");
  const [icon, setIcon] = useState("📝");
  const [coverColor, setCoverColor] = useState("sky");
  const [pinned, setPinned] = useState(false);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<NoteBlock[]>([]);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "dirty">(
    "saved"
  );

  // Media upload state
  const [uploadingPct, setUploadingPct] = useState<number | null>(null);
  const [uploadingName, setUploadingName] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // External link modal mini-prompt
  const [linkPromptOpen, setLinkPromptOpen] = useState(false);
  const [externalUrl, setExternalUrl] = useState("");
  const [externalKind, setExternalKind] = useState<"image" | "video">("video");

  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const hydratedNoteIdRef = useRef<string | null>(null);

  const folderMap = new Map(folders.map((f) => [f.id, f]));

  useEffect(() => {
    if (!note) {
      hydratedNoteIdRef.current = null;
      return;
    }
    hydratedNoteIdRef.current = note.id;
    setTitle(note.title || "Sem título");
    setIcon(note.icon || "📝");
    setCoverColor(note.cover_color || "sky");
    setPinned(Boolean(note.pinned));
    setFolderId(note.folder_id || null);
    setBlocks(
      Array.isArray(note.blocks) && note.blocks.length > 0
        ? note.blocks
        : [{ id: crypto.randomUUID(), type: "paragraph", text: "" }]
    );
    setSaveState("saved");
  }, [note?.id]);

  const persistNow = async (
    nextTitle = title,
    nextIcon = icon,
    nextCover = coverColor,
    nextPinned = pinned,
    nextFolder = folderId,
    nextBlocks = blocks
  ) => {
    if (!note) return;
    setSaveState("saving");
    try {
      const res = await api.updateNote({
        id: note.id,
        title: nextTitle.trim() || "Sem título",
        icon: nextIcon,
        cover_color: nextCover,
        pinned: nextPinned,
        folder_id: nextFolder,
        content: extractPlainSummary(nextBlocks),
        blocks: nextBlocks,
      });
      onUpdated(res.note);
      setSaveState("saved");
    } catch (err) {
      setSaveState("dirty");
      onNotifyToast(
        err instanceof Error ? err.message : "Erro ao salvar anotação.",
        "error"
      );
    }
  };

  // Debounced auto-save whenever fields change
  useEffect(() => {
    if (!note || hydratedNoteIdRef.current !== note.id) return;
    setSaveState("dirty");
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      void persistNow(title, icon, coverColor, pinned, folderId, blocks);
    }, 650);

    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [title, icon, coverColor, pinned, folderId, blocks]);

  if (!note) return null;

  const handleClose = async () => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }
    if (saveState === "dirty") {
      await persistNow();
    }
    onClose();
  };

  const addBlock = (type: NoteBlockType, extra?: Partial<NoteBlock>) => {
    const newBlock: NoteBlock = {
      id: crypto.randomUUID(),
      type,
      text: "",
      checked: type === "todo" ? false : undefined,
      ...extra,
    };
    setBlocks((prev) => [...prev, newBlock]);
  };

  const updateBlock = (id: string, patch: Partial<NoteBlock>) => {
    setBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, ...patch } : b))
    );
  };

  const moveBlock = (idx: number, dir: -1 | 1) => {
    setBlocks((prev) => {
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(idx, 1);
      copy.splice(target, 0, item);
      return copy;
    });
  };

  const removeBlock = async (block: NoteBlock) => {
    setBlocks((prev) => {
      const filtered = prev.filter((b) => b.id !== block.id);
      return filtered.length > 0
        ? filtered
        : [{ id: crypto.randomUUID(), type: "paragraph", text: "" }];
    });
    if (block.mediaId) {
      try {
        await api.deleteMedia(block.mediaId);
      } catch {
        // ignore cleanup error
      }
    }
  };

  const handleFilesUpload = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter(
      (f) => f.type.startsWith("image/") || f.type.startsWith("video/")
    );
    if (files.length === 0) {
      onNotifyToast("Selecione uma foto ou vídeo válido.", "error");
      return;
    }

    for (const file of files) {
      setUploadingName(file.name);
      setUploadingPct(1);
      try {
        const uploaded = await api.uploadMedia(file, note.id, (pct) =>
          setUploadingPct(pct)
        );
        const newBlock: NoteBlock = {
          id: crypto.randomUUID(),
          type: uploaded.kind,
          url: uploaded.url,
          mediaId: uploaded.mediaId,
          fileName: file.name,
          caption: "",
        };
        setBlocks((prev) => [...prev, newBlock]);
        onNotifyToast(
          uploaded.kind === "video"
            ? "Vídeo enviado e salvo na anotação!"
            : "Foto adicionada à anotação!"
        );
      } catch (err) {
        onNotifyToast(
          err instanceof Error ? err.message : "Erro ao enviar mídia.",
          "error"
        );
      }
    }
    setUploadingPct(null);
    setUploadingName("");
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const mediaFiles: File[] = [];
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/") || item.type.startsWith("video/")) {
        const f = item.getAsFile();
        if (f) mediaFiles.push(f);
      }
    }
    if (mediaFiles.length > 0) {
      e.preventDefault();
      void handleFilesUpload(mediaFiles);
    }
  };

  const handleInsertExternalUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (!externalUrl.trim()) return;
    addBlock(externalKind, {
      url: externalUrl.trim(),
      caption: "",
    });
    setExternalUrl("");
    setLinkPromptOpen(false);
  };

  const handleDeleteNote = async () => {
    if (!window.confirm("Deseja realmente excluir este card/anotação?")) return;
    try {
      await api.deleteNote(note.id);
      onDeleted(note.id);
      onClose();
      onNotifyToast("Card excluído.");
    } catch (err) {
      onNotifyToast(
        err instanceof Error ? err.message : "Erro ao excluir card.",
        "error"
      );
    }
  };

  const activeCover =
    COVERS.find((c) => c.id === coverColor) || COVERS[0];

  return (
    <div
      onClick={() => void handleClose()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragActive(false);
        if (e.dataTransfer.files?.length) {
          void handleFilesUpload(e.dataTransfer.files);
        }
      }}
      onPaste={handlePaste}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-[2px] p-0 sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative flex flex-col w-full max-w-4xl h-[94dvh] sm:h-[88dvh] overflow-hidden rounded-t-2xl sm:rounded-2xl bg-white shadow-elevated border ${
          dragActive ? "border-sky-500 ring-4 ring-sky-500/20" : "border-slate-200"
        }`}
      >
        {/* Top Utility Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-white px-4 py-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <FolderOpen className="h-4 w-4 text-sky-600 shrink-0" />
            <select
              aria-label="Mover para pasta ou subpasta"
              value={folderId || ""}
              onChange={(e) => setFolderId(e.target.value || null)}
              className="max-w-[210px] sm:max-w-xs truncate rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 focus:border-sky-500 focus:outline-none"
            >
              <option value="">📂 Raiz (Sem pasta)</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {buildFolderPathLabel(f.id, folderMap)}
                </option>
              ))}
            </select>

            <span className="hidden sm:inline text-[11px] font-medium text-slate-400">
              {saveState === "saving"
                ? "Salvando..."
                : saveState === "dirty"
                ? "Editando..."
                : "✓ Salvo no Supabase"}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPinned((p) => !p)}
              title={pinned ? "Desafixar do topo" : "Fixar card no topo"}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors ${
                pinned
                  ? "bg-amber-100 text-amber-800"
                  : "text-slate-500 hover:bg-slate-100"
              }`}
            >
              <Pin className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">
                {pinned ? "Fixado" : "Fixar"}
              </span>
            </button>

            <button
              type="button"
              onClick={() => void handleDeleteNote()}
              title="Excluir card"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => void handleClose()}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Notion Page Canvas */}
        <div className="flex-1 overflow-y-auto">
          {/* Cover Strip */}
          <div className={`relative h-24 sm:h-28 w-full ${activeCover.bgClass}`}>
            <div className="absolute bottom-2 right-3 flex items-center gap-1 rounded-xl bg-white/90 backdrop-blur px-2 py-1 shadow-sm">
              {COVERS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  title={`Capa: ${c.label}`}
                  onClick={() => setCoverColor(c.id)}
                  className={`h-4 w-4 rounded-full ${c.bgClass} ${
                    coverColor === c.id
                      ? "ring-2 ring-slate-900 ring-offset-1"
                      : "opacity-75 hover:opacity-100"
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="mx-auto max-w-3xl px-5 sm:px-10 pb-12">
            {/* Emoji Page Icon */}
            <div className="relative -mt-7 mb-3 inline-block">
              <button
                type="button"
                onClick={() => setShowIconPicker((v) => !v)}
                className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-3xl shadow-md border border-slate-100 hover:scale-105 transition-transform"
                title="Trocar ícone"
              >
                {icon}
              </button>

              {showIconPicker && (
                <div className="absolute left-0 mt-2 z-20 grid grid-cols-6 gap-1.5 rounded-2xl bg-white p-2.5 shadow-elevated border border-slate-200 w-56">
                  {ICONS.map((ic) => (
                    <button
                      key={ic}
                      type="button"
                      onClick={() => {
                        setIcon(ic);
                        setShowIconPicker(false);
                      }}
                      className="rounded-lg p-1.5 text-xl hover:bg-sky-50 transition-colors"
                    >
                      {ic}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Page Title */}
            <input
              id="notion-note-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Título do Card / Anotação..."
              className="w-full bg-transparent text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 placeholder:text-slate-300 focus:outline-none mb-5"
            />

            {/* Upload Progress Indicator */}
            {uploadingPct !== null && (
              <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-3.5">
                <div className="flex items-center justify-between text-xs font-bold text-sky-900 mb-1.5">
                  <span className="flex items-center gap-1.5 truncate">
                    <UploadCloud className="h-4 w-4 text-sky-600 animate-bounce" />
                    Enviando {uploadingName}...
                  </span>
                  <span>{uploadingPct}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-sky-200/70">
                  <div
                    className="h-full rounded-full bg-sky-500 transition-all duration-200"
                    style={{ width: `${uploadingPct}%` }}
                  />
                </div>
              </div>
            )}

            {/* Notion Blocks */}
            <div className="space-y-3">
              {blocks.map((block, idx) => (
                <div
                  key={block.id}
                  className="group relative rounded-xl border border-transparent hover:border-slate-200/80 hover:bg-slate-50/40 p-2 -mx-2 transition-colors"
                >
                  {/* Block Controls (Reorder & Delete) */}
                  <div className="absolute right-2 top-2 z-10 flex items-center gap-0.5 rounded-lg bg-white/95 border border-slate-200 px-1 py-0.5 shadow-sm opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => moveBlock(idx, -1)}
                      disabled={idx === 0}
                      className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                      title="Subir bloco"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveBlock(idx, 1)}
                      disabled={idx === blocks.length - 1}
                      className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                      title="Descer bloco"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeBlock(block)}
                      className="p-1 text-slate-400 hover:text-red-600"
                      title="Remover bloco"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Render by Block Type */}
                  {block.type === "heading" && (
                    <input
                      type="text"
                      value={block.text || ""}
                      onChange={(e) =>
                        updateBlock(block.id, { text: e.target.value })
                      }
                      placeholder="Subtítulo da seção..."
                      className="w-full bg-transparent pr-20 text-lg sm:text-xl font-bold text-slate-900 placeholder:text-slate-300 focus:outline-none"
                    />
                  )}

                  {block.type === "paragraph" && (
                    <textarea
                      rows={Math.max(
                        2,
                        (block.text || "").split("\n").length
                      )}
                      value={block.text || ""}
                      onChange={(e) =>
                        updateBlock(block.id, { text: e.target.value })
                      }
                      placeholder="Escreva sua anotação aqui... (Você também pode colar prints com Ctrl+V ou arrastar fotos e vídeos)"
                      className="w-full resize-y bg-transparent pr-16 text-sm sm:text-[15px] leading-relaxed text-slate-800 placeholder:text-slate-400 focus:outline-none"
                    />
                  )}

                  {block.type === "todo" && (
                    <div className="flex items-start gap-2.5 pr-20">
                      <button
                        type="button"
                        onClick={() =>
                          updateBlock(block.id, { checked: !block.checked })
                        }
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
                          block.checked
                            ? "bg-emerald-500 border-emerald-500 text-white"
                            : "bg-white border-sky-400 text-transparent"
                        }`}
                      >
                        <Check className="h-3.5 w-3.5 stroke-[3]" />
                      </button>
                      <input
                        type="text"
                        value={block.text || ""}
                        onChange={(e) =>
                          updateBlock(block.id, { text: e.target.value })
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addBlock("todo");
                          }
                        }}
                        placeholder="Item de verificação..."
                        className={`w-full bg-transparent text-sm font-medium focus:outline-none ${
                          block.checked
                            ? "line-through text-slate-400"
                            : "text-slate-800"
                        }`}
                      />
                    </div>
                  )}

                  {block.type === "callout" && (
                    <div className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50/80 p-3.5 pr-20">
                      <Info className="h-5 w-5 text-sky-600 shrink-0 mt-0.5" />
                      <textarea
                        rows={Math.max(
                          2,
                          (block.text || "").split("\n").length
                        )}
                        value={block.text || ""}
                        onChange={(e) =>
                          updateBlock(block.id, { text: e.target.value })
                        }
                        placeholder="Destaque ou observação importante..."
                        className="w-full resize-y bg-transparent text-sm font-medium text-sky-950 placeholder:text-sky-400 focus:outline-none"
                      />
                    </div>
                  )}

                  {block.type === "divider" && (
                    <div className="py-3">
                      <hr className="border-slate-200" />
                    </div>
                  )}

                  {block.type === "image" && block.url && (
                    <div className="space-y-2">
                      <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                        <img
                          src={block.url}
                          alt={block.caption || block.fileName || "Foto"}
                          onClick={() => setLightboxUrl(block.url!)}
                          className="max-h-[460px] w-full object-contain cursor-zoom-in"
                        />
                        <button
                          type="button"
                          onClick={() => setLightboxUrl(block.url!)}
                          className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 rounded-lg bg-slate-900/75 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-slate-900"
                        >
                          <Maximize2 className="h-3 w-3" />
                          Ampliar
                        </button>
                      </div>
                      <input
                        type="text"
                        value={block.caption || ""}
                        onChange={(e) =>
                          updateBlock(block.id, { caption: e.target.value })
                        }
                        placeholder="Adicionar legenda para esta foto..."
                        className="w-full bg-transparent text-center text-xs text-slate-500 placeholder:text-slate-400 focus:outline-none"
                      />
                    </div>
                  )}

                  {block.type === "video" && block.url && (
                    <div className="space-y-2">
                      <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-950">
                        {getYoutubeEmbedUrl(block.url) ? (
                          <iframe
                            src={getYoutubeEmbedUrl(block.url)!}
                            title={block.caption || "Vídeo"}
                            allowFullScreen
                            className="aspect-video w-full"
                          />
                        ) : (
                          <video
                            src={block.url}
                            controls
                            playsInline
                            preload="metadata"
                            className="max-h-[460px] w-full"
                          />
                        )}
                      </div>
                      <input
                        type="text"
                        value={block.caption || ""}
                        onChange={(e) =>
                          updateBlock(block.id, { caption: e.target.value })
                        }
                        placeholder="Adicionar legenda para este vídeo..."
                        className="w-full bg-transparent text-center text-xs text-slate-500 placeholder:text-slate-400 focus:outline-none"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* External Link Mini Form */}
            {linkPromptOpen && (
              <form
                onSubmit={handleInsertExternalUrl}
                className="mt-4 rounded-xl border border-sky-200 bg-sky-50/70 p-3.5 space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-sky-900">
                    Inserir foto ou vídeo por link (YouTube, Vimeo, MP4 ou URL de imagem)
                  </span>
                  <button
                    type="button"
                    onClick={() => setLinkPromptOpen(false)}
                    className="text-xs text-slate-500 hover:text-slate-800"
                  >
                    Cancelar
                  </button>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <select
                    value={externalKind}
                    onChange={(e) =>
                      setExternalKind(e.target.value as "image" | "video")
                    }
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700"
                  >
                    <option value="video">Vídeo / YouTube</option>
                    <option value="image">Imagem (URL)</option>
                  </select>
                  <input
                    type="url"
                    required
                    value={externalUrl}
                    onChange={(e) => setExternalUrl(e.target.value)}
                    placeholder="https://..."
                    className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-sky-500 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="rounded-lg bg-sky-500 px-4 py-2 text-xs font-bold text-white hover:bg-sky-600"
                  >
                    Inserir
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* Sticky Bottom Notion Block Insert Toolbar */}
        <div className="border-t border-slate-200 bg-slate-50/90 px-4 py-2.5">
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) {
                void handleFilesUpload(e.target.files);
                e.target.value = "";
              }
            }}
          />
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) {
                void handleFilesUpload(e.target.files);
                e.target.value = "";
              }
            }}
          />

          <div className="flex items-center gap-1.5 overflow-x-auto">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mr-1 shrink-0">
              Inserir:
            </span>
            <button
              type="button"
              onClick={() => addBlock("paragraph")}
              className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-sky-50 hover:border-sky-200"
            >
              <Type className="h-3.5 w-3.5 text-sky-600" />
              Texto
            </button>
            <button
              type="button"
              onClick={() => addBlock("heading")}
              className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-sky-50 hover:border-sky-200"
            >
              <Heading2 className="h-3.5 w-3.5 text-sky-600" />
              Título
            </button>
            <button
              type="button"
              onClick={() => addBlock("todo")}
              className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-sky-50 hover:border-sky-200"
            >
              <CheckSquare className="h-3.5 w-3.5 text-sky-600" />
              Checklist
            </button>
            <button
              type="button"
              onClick={() => addBlock("callout")}
              className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-sky-50 hover:border-sky-200"
            >
              <Info className="h-3.5 w-3.5 text-sky-600" />
              Destaque
            </button>
            <button
              type="button"
              onClick={() => addBlock("divider")}
              className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-sky-50 hover:border-sky-200"
            >
              <Minus className="h-3.5 w-3.5 text-sky-600" />
              Divisor
            </button>

            <button
              id="btn-upload-photo-block"
              type="button"
              onClick={() => imageInputRef.current?.click()}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-sky-600 transition-colors"
            >
              <ImageIcon className="h-3.5 w-3.5" />
              + Foto
            </button>

            <button
              id="btn-upload-video-block"
              type="button"
              onClick={() => videoInputRef.current?.click()}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-sky-700 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-sky-800 transition-colors"
            >
              <Video className="h-3.5 w-3.5" />
              + Vídeo
            </button>

            <button
              type="button"
              onClick={() => setLinkPromptOpen((v) => !v)}
              className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-sky-50"
            >
              <Link2 className="h-3.5 w-3.5 text-sky-600" />
              Link
            </button>
          </div>
        </div>
      </div>

      {/* Fullscreen Photo Lightbox */}
      {lightboxUrl && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            setLightboxUrl(null);
          }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4 cursor-zoom-out"
        >
          <img
            src={lightboxUrl}
            alt="Visualização ampliada"
            className="max-h-[92dvh] max-w-[94vw] rounded-xl object-contain"
          />
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 rounded-full bg-white/15 p-2 text-white hover:bg-white/25"
          >
            <X className="h-6 w-6" />
          </button>
        </div>
      )}
    </div>
  );
};
