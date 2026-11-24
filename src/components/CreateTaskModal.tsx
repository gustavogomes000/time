import React, { useEffect, useState } from "react";
import {
  X,
  CalendarDays,
  Clock,
  ClipboardCheck,
  CheckSquare,
  BellRing,
  Repeat,
  Flag,
} from "lucide-react";
import type {
  Task,
  TaskCategory,
  TaskPriority,
  TaskRecurrence,
} from "../types";
import type { CreateTaskPayload } from "../lib/api";

interface CreateTaskModalProps {
  open: boolean;
  initialMode?: TaskCategory;
  initialRecurrence?: TaskRecurrence;
  initialDate: string;
  initialTime?: string | null;
  editingTask?: Task | null;
  onClose: () => void;
  onSave: (payload: CreateTaskPayload, existingId?: string) => Promise<void>;
}

export const CreateTaskModal: React.FC<CreateTaskModalProps> = ({
  open,
  initialMode = "daily",
  initialRecurrence = "none",
  initialDate,
  initialTime = null,
  editingTask = null,
  onClose,
  onSave,
}) => {
  const [category, setCategory] = useState<TaskCategory>(initialMode);
  const [recurrence, setRecurrence] =
    useState<TaskRecurrence>(initialRecurrence);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [scheduledDate, setScheduledDate] = useState(initialDate);
  const [scheduledTime, setScheduledTime] = useState(initialTime || "");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [autoRecreate, setAutoRecreate] = useState(true);
  const [remindWhatsapp, setRemindWhatsapp] = useState(false);
  const [remindDateTime, setRemindDateTime] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    if (editingTask) {
      setCategory(editingTask.category);
      setRecurrence(editingTask.recurrence);
      setTitle(editingTask.title);
      setDescription(editingTask.description || "");
      setScheduledDate(editingTask.scheduled_date);
      setScheduledTime(editingTask.scheduled_time || "");
      setPriority(editingTask.priority);
      setAutoRecreate(editingTask.auto_recreate);
      setRemindWhatsapp(editingTask.remind_whatsapp);
      if (editingTask.remind_at) {
        const dt = new Date(editingTask.remind_at);
        const pad = (n: number) => String(n).padStart(2, "0");
        setRemindDateTime(
          `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(
            dt.getDate()
          )}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`
        );
      } else {
        setRemindDateTime(`${editingTask.scheduled_date}T09:00`);
      }
    } else {
      const nextCat = initialMode;
      setCategory(nextCat);
      setRecurrence(
        nextCat === "conference"
          ? initialRecurrence !== "none"
            ? initialRecurrence
            : "weekly"
          : "none"
      );
      setTitle("");
      setDescription("");
      setScheduledDate(initialDate);
      setScheduledTime(initialTime || "");
      setPriority("normal");
      setAutoRecreate(true);
      setRemindWhatsapp(false);
      setRemindDateTime(`${initialDate}T${initialTime || "09:00"}`);
    }
  }, [open, editingTask, initialMode, initialRecurrence, initialDate, initialTime]);

  if (!open) return null;

  const isConference = category === "conference";

  const handleModeSwitch = (nextMode: TaskCategory) => {
    setCategory(nextMode);
    if (nextMode === "conference" && recurrence === "none") {
      setRecurrence("weekly");
    }
    if (nextMode === "daily") {
      setRecurrence("none");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Digite o título da tarefa ou conferência.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      let remindIso: string | null = null;
      if (remindWhatsapp && remindDateTime) {
        remindIso = new Date(remindDateTime).toISOString();
      }
      await onSave(
        {
          title: title.trim(),
          description: description.trim(),
          category,
          recurrence: isConference ? recurrence : "none",
          auto_recreate: isConference ? autoRecreate : false,
          scheduled_date: scheduledDate,
          scheduled_time: scheduledTime || null,
          priority,
          remind_whatsapp: remindWhatsapp && Boolean(remindIso),
          remind_at: remindIso,
        },
        editingTask?.id
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/45 backdrop-blur-[2px] p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-t-2xl sm:rounded-2xl bg-white shadow-elevated border border-slate-200/80 max-h-[92dvh] flex flex-col"
      >
        {/* Distinct Mode Header */}
        <div
          className={`px-5 py-4 border-b transition-colors ${
            isConference
              ? "bg-sky-900 text-white border-sky-800"
              : "bg-sky-50/90 text-slate-900 border-sky-100"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                  isConference
                    ? "bg-sky-400/20 text-sky-200"
                    : "bg-sky-500 text-white"
                }`}
              >
                {isConference ? (
                  <ClipboardCheck className="h-5 w-5" />
                ) : (
                  <CheckSquare className="h-5 w-5" />
                )}
              </div>
              <div>
                <h2 className="text-base font-bold leading-tight">
                  {editingTask
                    ? "Editar Demanda"
                    : isConference
                    ? "Nova Demanda Extra de Conferência"
                    : "Nova Demanda Diária"}
                </h2>
                <p
                  className={`text-xs ${
                    isConference ? "text-sky-200" : "text-slate-500"
                  }`}
                >
                  {isConference
                    ? "Entrega periódica com etiqueta exclusiva e renovação de ciclo"
                    : "Se não concluir até meia-noite, passa p/ amanhã como atrasada"}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className={`rounded-lg p-1.5 transition-colors ${
                isConference
                  ? "text-sky-200 hover:bg-sky-800 hover:text-white"
                  : "text-slate-400 hover:bg-sky-100 hover:text-slate-700"
              }`}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Mode Switcher */}
          <div className="mt-3.5 grid grid-cols-2 gap-2 rounded-xl bg-black/5 p-1">
            <button
              id="mode-daily-btn"
              type="button"
              onClick={() => handleModeSwitch("daily")}
              className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition-all ${
                !isConference
                  ? "bg-white text-sky-700 shadow-sm"
                  : "text-sky-100 hover:text-white"
              }`}
            >
              <CheckSquare className="h-3.5 w-3.5" />
              Demanda Diária
            </button>
            <button
              id="mode-conference-btn"
              type="button"
              onClick={() => handleModeSwitch("conference")}
              className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition-all ${
                isConference
                  ? "bg-sky-400 text-slate-950 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <ClipboardCheck className="h-3.5 w-3.5" />
              Conferência (Periódica)
            </button>
          </div>
        </div>

        {/* Form Body */}
        <form
          onSubmit={handleSubmit}
          className="overflow-y-auto p-5 space-y-4 flex-1"
        >
          {/* Distinct Frequency Selector ONLY when Conference is active */}
          {isConference && (
            <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-3.5 space-y-2.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-sky-900">
                Periodicidade da Conferência
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    {
                      value: "weekly",
                      title: "Semanal",
                      sub: "A cada 7 dias",
                    },
                    {
                      value: "biweekly",
                      title: "Quinzenal",
                      sub: "A cada 15 dias",
                    },
                    {
                      value: "monthly",
                      title: "Mensal",
                      sub: "Todo mês",
                    },
                  ] as const
                ).map((opt) => {
                  const active = recurrence === opt.value;
                  return (
                    <button
                      key={opt.value}
                      id={`recurrence-${opt.value}-btn`}
                      type="button"
                      onClick={() => setRecurrence(opt.value)}
                      className={`flex flex-col items-start rounded-xl border p-2.5 text-left transition-all ${
                        active
                          ? "border-sky-600 bg-sky-600 text-white shadow-sm"
                          : "border-sky-200 bg-white text-slate-700 hover:border-sky-400"
                      }`}
                    >
                      <span className="text-xs font-bold">{opt.title}</span>
                      <span
                        className={`text-[11px] ${
                          active ? "text-sky-100" : "text-slate-500"
                        }`}
                      >
                        {opt.sub}
                      </span>
                    </button>
                  );
                })}
              </div>

              <label className="flex items-center gap-2 pt-1 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoRecreate}
                  onChange={(e) => setAutoRecreate(e.target.checked)}
                  className="h-4 w-4 rounded border-sky-300 text-sky-600 focus:ring-sky-500"
                />
                <span className="text-xs font-medium text-sky-950 flex items-center gap-1">
                  <Repeat className="h-3.5 w-3.5 text-sky-600" />
                  Agendar próxima entrega automaticamente quando marcar como feita
                </span>
              </label>
            </div>
          )}

          <div>
            <label
              htmlFor="task-title-input"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              {isConference
                ? "Qual conferência precisa ser entregue?"
                : "O que precisa ser feito?"}
            </label>
            <input
              id="task-title-input"
              type="text"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                isConference
                  ? "Ex.: Conferência quinzenal de fechamento e notas"
                  : "Ex.: Validar relatório de vendas e responder cliente"
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            />
          </div>

          <div>
            <label
              htmlFor="task-desc-input"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              {isConference
                ? "Itens da conferência / Observações (opcional)"
                : "Detalhes ou anotações (opcional)"}
            </label>
            <textarea
              id="task-desc-input"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                isConference
                  ? "Ex.: Conferir extrato, planilha de controle e comprovantes..."
                  : "Observações rápidas..."
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label
                htmlFor="task-date-input"
                className="flex items-center gap-1 text-xs font-semibold text-slate-700 mb-1"
              >
                <CalendarDays className="h-3.5 w-3.5 text-sky-600" />
                {isConference ? "Data da Entrega" : "Dia da Demanda"}
              </label>
              <input
                id="task-date-input"
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 focus:border-sky-500 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="task-time-input"
                className="flex items-center gap-1 text-xs font-semibold text-slate-700 mb-1"
              >
                <Clock className="h-3.5 w-3.5 text-sky-600" />
                Horário (Agenda)
              </label>
              <input
                id="task-time-input"
                type="time"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-mono font-medium text-slate-800 focus:border-sky-500 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="task-priority-select"
                className="flex items-center gap-1 text-xs font-semibold text-slate-700 mb-1"
              >
                <Flag className="h-3.5 w-3.5 text-sky-600" />
                Prioridade
              </label>
              <select
                id="task-priority-select"
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 focus:border-sky-500 focus:outline-none"
              >
                <option value="normal">Normal</option>
                <option value="high">Alta</option>
                <option value="low">Baixa</option>
              </select>
            </div>
          </div>

          {/* WhatsApp Reminder Toggle */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2.5">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                <BellRing className="h-4 w-4 text-emerald-600" />
                Me avisar no WhatsApp sobre esta demanda
              </span>
              <input
                id="task-whatsapp-remind-checkbox"
                type="checkbox"
                checked={remindWhatsapp}
                onChange={(e) => setRemindWhatsapp(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              />
            </label>

            {remindWhatsapp && (
              <div className="pt-1">
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Data e hora do disparo no WhatsApp:
                </label>
                <input
                  id="task-whatsapp-remind-datetime"
                  type="datetime-local"
                  value={remindDateTime}
                  onChange={(e) => setRemindDateTime(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-mono text-slate-800 focus:border-sky-500 focus:outline-none"
                />
              </div>
            )}
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-3.5 py-2 text-xs font-medium text-red-700">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Cancelar
            </button>
            <button
              id="save-task-submit-btn"
              type="submit"
              disabled={saving}
              className={`rounded-xl px-5 py-2.5 text-xs font-bold text-white shadow-sm transition-all active:scale-[0.99] disabled:opacity-60 ${
                isConference
                  ? "bg-sky-700 hover:bg-sky-800"
                  : "bg-sky-500 hover:bg-sky-600"
              }`}
            >
              {saving
                ? "Salvando..."
                : editingTask
                ? "Salvar Alterações"
                : isConference
                ? "Criar Conferência"
                : "Adicionar Demanda"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
