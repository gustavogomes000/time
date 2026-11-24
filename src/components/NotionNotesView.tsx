import React, { useEffect, useMemo, useState } from "react";
import {
  FolderPlus,
  Plus,
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  Search,
  Pin,
  Image as ImageIcon,
  Video,
  CheckSquare,
  Pencil,
  Trash2,
  LayoutGrid,
  List,
  Sparkles,
  Home,
} from "lucide-react";
import { api } from "../lib/api";
import type { NoteFolder, NoteItem } from "../types";
import { NotionNoteEditorModal } from "./NotionNoteEditorModal";

interface NotionNotesViewProps {
  onNotifyToast: (msg: string, type?: "success" | "error") => void;
}

type FolderSelection = "all" | "pinned" | "root" | string;

const COVER_HEADER_MAP: Record<string, string> = {
  sky: "bg-gradient-to-r from-sky-400 to-sky-600",
  ocean: "bg-gradient-to-r from-cyan-500 to-blue-600",
  emerald: "bg-gradient-to-r from-emerald-400 to-teal-600",
  amber: "bg-gradient-to-r from-amber-400 to-orange-500",
  rose: "bg-gradient-to-r from-rose-400 to-red-500",
  slate: "bg-gradient-to-r from-slate-600 to-slate-800",
};

const FOLDER_ICONS = ["📁", "📂", "🗂️", "💼", "📊", "📸", "🎬", "🏢", "📌", "⭐"];

export const NotionNotesView: React.FC<NotionNotesViewProps> = ({
  onNotifyToast,
}) => {
  const [folders, setFolders] = useState<NoteFolder[]>([]);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedFolder, setSelectedFolder] = useState<FolderSelection>("all");
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [activeNote, setActiveNote] = useState<NoteItem | null>(null);

  // Folder Create / Rename Dialog
  const [folderDialog, setFolderDialog] = useState<{
    mode: "create" | "edit";
    parentId: string | null;
    folder?: NoteFolder;
  } | null>(null);
  const [folderNameInput, setFolderNameInput] = useState("");
  const [folderIconInput, setFolderIconInput] = useState("📁");
  const [savingFolder, setSavingFolder] = useState(false);

  const loadWorkspace = async () => {
    setLoading(true);
    try {
      const res = await api.fetchNotesWorkspace();
      setFolders(res.folders);
      setNotes(res.notes);
    } catch (err) {
      onNotifyToast(
        err instanceof Error ? err.message : "Erro ao carregar anotações.",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadWorkspace();
  }, []);

  const folderMap = useMemo(
    () => new Map(folders.map((f) => [f.id, f])),
    [folders]
  );

  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, NoteFolder[]>();
    for (const f of folders) {
      const key = f.parent_id || null;
      const arr = map.get(key) || [];
      arr.push(f);
      map.set(key, arr);
    }
    return map;
  }, [folders]);

  // Breadcrumb trail when inside a folder/subfolder
  const breadcrumb = useMemo(() => {
    if (
      selectedFolder === "all" ||
      selectedFolder === "pinned" ||
      selectedFolder === "root"
    ) {
      return [];
    }
    const trail: NoteFolder[] = [];
    let cur = folderMap.get(selectedFolder);
    let guard = 0;
    while (cur && guard < 20) {
      trail.unshift(cur);
      cur = cur.parent_id ? folderMap.get(cur.parent_id) : undefined;
      guard++;
    }
    return trail;
  }, [selectedFolder, folderMap]);

  // Direct subfolders of current view
  const directSubfolders = useMemo(() => {
    if (selectedFolder === "all" || selectedFolder === "pinned") {
      return childrenByParent.get(null) || [];
    }
    if (selectedFolder === "root") {
      return [];
    }
    return childrenByParent.get(selectedFolder) || [];
  }, [selectedFolder, childrenByParent]);

  // Collect all descendant folder IDs so viewing a parent folder shows cards inside it (or filter)
  const visibleNotes = useMemo(() => {
    const q = search.trim().toLowerCase();

    return notes.filter((n) => {
      if (selectedFolder === "pinned" && !n.pinned) return false;
      if (selectedFolder === "root" && n.folder_id !== null) return false;
      if (
        selectedFolder !== "all" &&
        selectedFolder !== "pinned" &&
        selectedFolder !== "root"
      ) {
        if (n.folder_id !== selectedFolder) return false;
      }

      if (!q) return true;
      const inTitle = n.title.toLowerCase().includes(q);
      const inContent = (n.content || "").toLowerCase().includes(q);
      const inBlocks = (n.blocks || []).some(
        (b) =>
          (b.text || "").toLowerCase().includes(q) ||
          (b.caption || "").toLowerCase().includes(q)
      );
      return inTitle || inContent || inBlocks;
    });
  }, [notes, selectedFolder, search]);

  const openCreateFolderModal = (parentId: string | null) => {
    setFolderNameInput("");
    setFolderIconInput(parentId ? "📂" : "📁");
    setFolderDialog({ mode: "create", parentId });
  };

  const openEditFolderModal = (folder: NoteFolder) => {
    setFolderNameInput(folder.name);
    setFolderIconInput(folder.icon || "📁");
    setFolderDialog({
      mode: "edit",
      parentId: folder.parent_id,
      folder,
    });
  };

  const handleSaveFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderDialog || !folderNameInput.trim()) return;
    setSavingFolder(true);
    try {
      if (folderDialog.mode === "create") {
        const res = await api.createFolder({
          name: folderNameInput.trim(),
          parent_id: folderDialog.parentId,
          icon: folderIconInput,
        });
        setFolders((prev) => [...prev, res.folder]);
        if (folderDialog.parentId) {
          setExpandedIds((prev) => ({
            ...prev,
            [folderDialog.parentId!]: true,
          }));
        }
        setSelectedFolder(res.folder.id);
        onNotifyToast(
          folderDialog.parentId ? "Subpasta criada!" : "Pasta criada!"
        );
      } else if (folderDialog.folder) {
        const res = await api.updateFolder({
          id: folderDialog.folder.id,
          name: folderNameInput.trim(),
          icon: folderIconInput,
        });
        setFolders((prev) =>
          prev.map((f) => (f.id === res.folder.id ? res.folder : f))
        );
        onNotifyToast("Pasta atualizada!");
      }
      setFolderDialog(null);
    } catch (err) {
      onNotifyToast(
        err instanceof Error ? err.message : "Erro ao salvar pasta.",
        "error"
      );
    } finally {
      setSavingFolder(false);
    }
  };

  const handleDeleteFolder = async (folder: NoteFolder) => {
    if (
      !window.confirm(
        `Excluir a pasta "${folder.name}" e todas as subpastas/cards dentro dela?`
      )
    ) {
      return;
    }
    try {
      await api.deleteFolder(folder.id);
      if (selectedFolder === folder.id) {
        setSelectedFolder(folder.parent_id || "all");
      }
      await loadWorkspace();
      onNotifyToast("Pasta excluída.");
    } catch (err) {
      onNotifyToast(
        err instanceof Error ? err.message : "Erro ao excluir pasta.",
        "error"
      );
    }
  };

  const handleCreateNewCard = async () => {
    const targetFolderId =
      selectedFolder !== "all" &&
      selectedFolder !== "pinned" &&
      selectedFolder !== "root"
        ? selectedFolder
        : null;

    try {
      const res = await api.createNote({
        folder_id: targetFolderId,
        title: "Nova Anotação",
        icon: "📝",
        cover_color: "sky",
        blocks: [{ id: crypto.randomUUID(), type: "paragraph", text: "" }],
      });
      setNotes((prev) => [res.note, ...prev]);
      setActiveNote(res.note);
    } catch (err) {
      onNotifyToast(
        err instanceof Error ? err.message : "Erro ao criar card.",
        "error"
      );
    }
  };

  const renderFolderTree = (parentId: string | null, depth = 0) => {
    const list = childrenByParent.get(parentId) || [];
    if (list.length === 0) return null;

    return (
      <div className="space-y-0.5">
        {list.map((folder) => {
          const children = childrenByParent.get(folder.id) || [];
          const hasChildren = children.length > 0;
          const isExpanded = Boolean(expandedIds[folder.id]);
          const isSelected = selectedFolder === folder.id;
          const countInFolder = notes.filter(
            (n) => n.folder_id === folder.id
          ).length;

          return (
            <div key={folder.id}>
              <div
                style={{ paddingLeft: `${depth * 14 + 8}px` }}
                className={`group flex items-center justify-between gap-1 rounded-xl py-1.5 pr-2 text-xs font-semibold transition-colors cursor-pointer ${
                  isSelected
                    ? "bg-sky-500 text-white shadow-sm"
                    : "text-slate-700 hover:bg-sky-50"
                }`}
                onClick={() => {
                  setSelectedFolder(folder.id);
                  if (hasChildren) {
                    setExpandedIds((prev) => ({
                      ...prev,
                      [folder.id]: true,
                    }));
                  }
                }}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedIds((prev) => ({
                        ...prev,
                        [folder.id]: !prev[folder.id],
                      }));
                    }}
                    className={`p-0.5 rounded ${
                      hasChildren ? "opacity-100" : "opacity-0 pointer-events-none"
                    }`}
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <span className="shrink-0">{folder.icon || "📁"}</span>
                  <span className="truncate">{folder.name}</span>
                </div>

                <div className="flex items-center gap-0.5 shrink-0">
                  {countInFolder > 0 && (
                    <span
                      className={`rounded-full px-1.5 text-[10px] font-bold ${
                        isSelected
                          ? "bg-white/20 text-white"
                          : "bg-slate-100 text-slate-500 group-hover:hidden"
                      }`}
                    >
                      {countInFolder}
                    </span>
                  )}

                  <div
                    className={`hidden group-hover:flex items-center gap-0.5 ${
                      isSelected ? "text-white" : "text-slate-500"
                    }`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      title="Criar subpasta aqui dentro"
                      onClick={() => openCreateFolderModal(folder.id)}
                      className="rounded p-1 hover:bg-black/10"
                    >
                      <FolderPlus className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Renomear pasta"
                      onClick={() => openEditFolderModal(folder)}
                      className="rounded p-1 hover:bg-black/10"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      title="Excluir pasta"
                      onClick={() => void handleDeleteFolder(folder)}
                      className="rounded p-1 hover:bg-red-500/20"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>

              {hasChildren && isExpanded && renderFolderTree(folder.id, depth + 1)}
            </div>
          );
        })}
      </div>
    );
  };

  const currentFolderObj =
    selectedFolder !== "all" &&
    selectedFolder !== "pinned" &&
    selectedFolder !== "root"
      ? folderMap.get(selectedFolder) || null
      : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      {/* LEFT SIDEBAR: Pastas & Subpastas Tree */}
      <aside className="lg:col-span-3 rounded-2xl bg-white p-4 border border-slate-200/85 shadow-card space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <div className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-sky-600" />
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
              Pastas & Subpastas
            </h2>
          </div>
          <button
            id="btn-new-root-folder"
            type="button"
            onClick={() => openCreateFolderModal(null)}
            className="inline-flex items-center gap-1 rounded-lg bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-700 hover:bg-sky-100 transition-colors"
          >
            <FolderPlus className="h-3.5 w-3.5" />
            + Pasta
          </button>
        </div>

        {/* Built-in smart filters */}
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => setSelectedFolder("all")}
            className={`w-full flex items-center justify-between rounded-xl px-3 py-2 text-xs font-bold transition-colors ${
              selectedFolder === "all"
                ? "bg-sky-500 text-white shadow-sm"
                : "text-slate-700 hover:bg-sky-50"
            }`}
          >
            <span className="flex items-center gap-2">
              <Home className="h-3.5 w-3.5" />
              Todos os Cards
            </span>
            <span className="text-[11px] opacity-80">{notes.length}</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedFolder("pinned")}
            className={`w-full flex items-center justify-between rounded-xl px-3 py-2 text-xs font-bold transition-colors ${
              selectedFolder === "pinned"
                ? "bg-sky-500 text-white shadow-sm"
                : "text-slate-700 hover:bg-sky-50"
            }`}
          >
            <span className="flex items-center gap-2">
              <Pin className="h-3.5 w-3.5" />
              Fixados
            </span>
            <span className="text-[11px] opacity-80">
              {notes.filter((n) => n.pinned).length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedFolder("root")}
            className={`w-full flex items-center justify-between rounded-xl px-3 py-2 text-xs font-bold transition-colors ${
              selectedFolder === "root"
                ? "bg-sky-500 text-white shadow-sm"
                : "text-slate-700 hover:bg-sky-50"
            }`}
          >
            <span className="flex items-center gap-2">
              <Folder className="h-3.5 w-3.5" />
              Sem Pasta (Raiz)
            </span>
            <span className="text-[11px] opacity-80">
              {notes.filter((n) => !n.folder_id).length}
            </span>
          </button>
        </div>

        <div className="border-t border-slate-100 pt-2">
          {(childrenByParent.get(null) || []).length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-slate-400">
              Crie pastas e subpastas para organizar seus cards, fotos e vídeos.
            </p>
          ) : (
            renderFolderTree(null, 0)
          )}
        </div>
      </aside>

      {/* MAIN WORKSPACE: Breadcrumbs + Subfolders + Notion Cards Gallery */}
      <section className="lg:col-span-9 space-y-4">
        {/* Header Bar */}
        <div className="rounded-2xl bg-white p-4 sm:p-5 border border-sky-100 shadow-card space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              {/* Breadcrumb Navigation */}
              <div className="flex flex-wrap items-center gap-1 text-xs font-semibold text-slate-500 mb-1">
                <button
                  type="button"
                  onClick={() => setSelectedFolder("all")}
                  className="hover:text-sky-600 transition-colors"
                >
                  Notas & Cards
                </button>
                {breadcrumb.map((b) => (
                  <React.Fragment key={b.id}>
                    <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                    <button
                      type="button"
                      onClick={() => setSelectedFolder(b.id)}
                      className="hover:text-sky-600 transition-colors font-bold text-slate-700"
                    >
                      {b.icon} {b.name}
                    </button>
                  </React.Fragment>
                ))}
              </div>

              <h2 className="text-lg sm:text-xl font-extrabold text-slate-900">
                {currentFolderObj
                  ? `${currentFolderObj.icon} ${currentFolderObj.name}`
                  : selectedFolder === "pinned"
                  ? "⭐ Cards Fixados"
                  : selectedFolder === "root"
                  ? "📂 Cards sem Pasta"
                  : "Espaço de Cards & Anotações (Estilo Notion)"}
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {currentFolderObj ? (
                <button
                  id="btn-new-subfolder"
                  type="button"
                  onClick={() => openCreateFolderModal(currentFolderObj.id)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-800 hover:bg-sky-100 transition-colors"
                >
                  <FolderPlus className="h-3.5 w-3.5 text-sky-600" />
                  + Nova Subpasta
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => openCreateFolderModal(null)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-800 hover:bg-sky-100 transition-colors"
                >
                  <FolderPlus className="h-3.5 w-3.5 text-sky-600" />
                  + Nova Pasta
                </button>
              )}

              <button
                id="btn-new-notion-card"
                type="button"
                onClick={() => void handleCreateNewCard()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-sky-500 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-sky-600 transition-colors"
              >
                <Plus className="h-4 w-4 stroke-[2.5]" />
                Novo Card / Nota
              </button>
            </div>
          </div>

          {/* Search & View Mode Switcher */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                id="notes-search-input"
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pesquisar anotações, cards, textos ou legendas..."
                className="w-full rounded-xl border border-slate-200 bg-[#F8FBFF] pl-9 pr-3.5 py-2 text-xs sm:text-sm text-slate-900 focus:border-sky-500 focus:bg-white focus:outline-none"
              />
            </div>

            <div className="flex items-center rounded-xl border border-slate-200 p-0.5 bg-slate-50">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={`rounded-lg p-1.5 ${
                  viewMode === "grid"
                    ? "bg-white text-sky-600 shadow-sm"
                    : "text-slate-400 hover:text-slate-700"
                }`}
                title="Visualização em Cards"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={`rounded-lg p-1.5 ${
                  viewMode === "list"
                    ? "bg-white text-sky-600 shadow-sm"
                    : "text-slate-400 hover:text-slate-700"
                }`}
                title="Visualização em Lista"
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Subfolder Quick Cards (great for navigating folders & subfolders on mobile & desktop!) */}
        {directSubfolders.length > 0 && !search.trim() && (
          <div className="space-y-2">
            <h3 className="px-1 text-xs font-bold uppercase tracking-wider text-slate-500">
              {currentFolderObj ? "Subpastas" : "Pastas Principais"} (
              {directSubfolders.length})
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
              {directSubfolders.map((sf) => {
                const subCount = (childrenByParent.get(sf.id) || []).length;
                const cardCount = notes.filter(
                  (n) => n.folder_id === sf.id
                ).length;
                return (
                  <button
                    key={sf.id}
                    type="button"
                    onClick={() => {
                      setSelectedFolder(sf.id);
                      setExpandedIds((prev) => ({ ...prev, [sf.id]: true }));
                    }}
                    className="flex items-center gap-2.5 rounded-2xl border border-slate-200/85 bg-white p-3 text-left shadow-card hover:border-sky-300 hover:bg-sky-50/40 transition-all"
                  >
                    <span className="text-2xl shrink-0">{sf.icon || "📁"}</span>
                    <div className="min-w-0">
                      <div className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                        {sf.name}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {cardCount} card{cardCount === 1 ? "" : "s"}
                        {subCount > 0 ? ` • ${subCount} sub` : ""}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Cards Grid / List */}
        {loading ? (
          <div className="rounded-2xl bg-white p-10 text-center border border-slate-200/80">
            <p className="text-xs font-semibold text-slate-500">
              Carregando suas pastas e cards...
            </p>
          </div>
        ) : visibleNotes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-sky-200 bg-white p-10 text-center">
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-100 text-sky-600">
              <Sparkles className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">
              Nenhum card ou anotação aqui ainda
            </h3>
            <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
              Crie cards estilo Notion com textos, checklists, fotos e vídeos
              organizados em pastas e subpastas ilimitadas.
            </p>
            <div className="mt-4 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => void handleCreateNewCard()}
                className="rounded-xl bg-sky-500 px-4 py-2 text-xs font-bold text-white hover:bg-sky-600 transition-colors"
              >
                + Criar Primeiro Card
              </button>
              {currentFolderObj && (
                <button
                  type="button"
                  onClick={() => openCreateFolderModal(currentFolderObj.id)}
                  className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-xs font-bold text-sky-800 hover:bg-sky-100 transition-colors"
                >
                  + Criar Subpasta
                </button>
              )}
            </div>
          </div>
        ) : (
          <div
            className={
              viewMode === "grid"
                ? "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4"
                : "space-y-2.5"
            }
          >
            {visibleNotes.map((note) => {
              const blocks = Array.isArray(note.blocks) ? note.blocks : [];
              const firstImage = blocks.find(
                (b) => b.type === "image" && b.url
              );
              const imageCount = blocks.filter(
                (b) => b.type === "image"
              ).length;
              const videoCount = blocks.filter(
                (b) => b.type === "video"
              ).length;
              const todos = blocks.filter((b) => b.type === "todo");
              const todosDone = todos.filter((b) => b.checked).length;
              const folder = note.folder_id
                ? folderMap.get(note.folder_id)
                : null;
              const coverClass =
                COVER_HEADER_MAP[note.cover_color] || COVER_HEADER_MAP.sky;

              return (
                <article
                  key={note.id}
                  onClick={() => setActiveNote(note)}
                  className="group cursor-pointer overflow-hidden rounded-2xl border border-slate-200/85 bg-white shadow-card hover:border-sky-300 hover:shadow-elevated transition-all flex flex-col"
                >
                  {/* Card Visual Cover (First Photo Thumbnail OR Color Strip) */}
                  {viewMode === "grid" &&
                    (firstImage?.url ? (
                      <div className="relative h-36 w-full overflow-hidden bg-slate-100">
                        <img
                          src={firstImage.url}
                          alt={note.title}
                          className="h-full w-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                        />
                        {note.pinned && (
                          <span className="absolute top-2.5 right-2.5 rounded-full bg-amber-400 p-1.5 text-slate-950 shadow-sm">
                            <Pin className="h-3 w-3" />
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className={`relative h-12 w-full ${coverClass}`}>
                        {note.pinned && (
                          <span className="absolute top-2.5 right-2.5 rounded-full bg-white/90 p-1 text-amber-600 shadow-sm">
                            <Pin className="h-3 w-3" />
                          </span>
                        )}
                      </div>
                    ))}

                  <div className="flex-1 p-4 flex flex-col justify-between space-y-3">
                    <div>
                      <div className="flex items-start gap-2">
                        <span className="text-xl shrink-0">
                          {note.icon || "📝"}
                        </span>
                        <h3 className="text-sm sm:text-[15px] font-extrabold text-slate-900 line-clamp-2 leading-snug">
                          {note.title || "Sem título"}
                        </h3>
                      </div>

                      {note.content && (
                        <p className="mt-2 text-xs text-slate-500 line-clamp-3 leading-relaxed">
                          {note.content}
                        </p>
                      )}
                    </div>

                    {/* Metadata Footer */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-[11px] font-semibold text-slate-500">
                      <div className="flex flex-wrap items-center gap-2">
                        {folder && (
                          <span className="rounded-md bg-sky-50 border border-sky-100 px-2 py-0.5 text-sky-800 truncate max-w-[130px]">
                            {folder.icon} {folder.name}
                          </span>
                        )}
                        {imageCount > 0 && (
                          <span className="inline-flex items-center gap-1 text-sky-700">
                            <ImageIcon className="h-3 w-3" />
                            {imageCount}
                          </span>
                        )}
                        {videoCount > 0 && (
                          <span className="inline-flex items-center gap-1 text-indigo-700">
                            <Video className="h-3 w-3" />
                            {videoCount}
                          </span>
                        )}
                        {todos.length > 0 && (
                          <span className="inline-flex items-center gap-1 text-emerald-700">
                            <CheckSquare className="h-3 w-3" />
                            {todosDone}/{todos.length}
                          </span>
                        )}
                      </div>

                      <span className="text-[10px] text-slate-400">
                        {new Intl.DateTimeFormat("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                        }).format(new Date(note.updated_at))}
                      </span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Create / Rename Folder & Subfolder Modal */}
      {folderDialog && (
        <div
          onClick={() => setFolderDialog(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSaveFolder}
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-elevated border border-slate-200 space-y-4"
          >
            <div>
              <h3 className="text-base font-extrabold text-slate-900">
                {folderDialog.mode === "edit"
                  ? "Editar Pasta"
                  : folderDialog.parentId
                  ? `Nova Subpasta em "${
                      folderMap.get(folderDialog.parentId)?.name || "Pasta"
                    }"`
                  : "Nova Pasta Principal"}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Organize seus cards, fotos e vídeos em quantos níveis quiser
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Ícone da Pasta
              </label>
              <div className="flex flex-wrap gap-1.5">
                {FOLDER_ICONS.map((ic) => (
                  <button
                    key={ic}
                    type="button"
                    onClick={() => setFolderIconInput(ic)}
                    className={`rounded-xl p-2 text-lg border transition-all ${
                      folderIconInput === ic
                        ? "border-sky-500 bg-sky-50 scale-105"
                        : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    {ic}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nome da {folderDialog.parentId ? "Subpasta" : "Pasta"}
              </label>
              <input
                type="text"
                autoFocus
                required
                value={folderNameInput}
                onChange={(e) => setFolderNameInput(e.target.value)}
                placeholder="Ex.: Processos, Tutoriais, Clientes..."
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-medium text-slate-900 focus:border-sky-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setFolderDialog(null)}
                className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingFolder}
                className="rounded-xl bg-sky-500 px-4 py-2 text-xs font-bold text-white hover:bg-sky-600 disabled:opacity-60"
              >
                {savingFolder ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Notion Card Editor Modal */}
      <NotionNoteEditorModal
        note={activeNote}
        folders={folders}
        onClose={() => setActiveNote(null)}
        onUpdated={(updated) => {
          setNotes((prev) =>
            prev.map((n) => (n.id === updated.id ? updated : n))
          );
          setActiveNote((cur) => (cur?.id === updated.id ? updated : cur));
        }}
        onDeleted={(deletedId) => {
          setNotes((prev) => prev.filter((n) => n.id !== deletedId));
        }}
        onNotifyToast={onNotifyToast}
      />
    </div>
  );
};
