import React from "react";
import {
  Check,
  Clock,
  AlertCircle,
  ClipboardCheck,
  Bell,
  Pencil,
  Trash2,
  Repeat,
  ArrowRight,
} from "lucide-react";
import type { Task } from "../types";
import {
  formatShortBr,
  getTaskVisualStatus,
  recurrenceLabel,
} from "../types";

interface TaskCardProps {
  task: Task;
  todayYmd: string;
  viewedDateYmd?: string;
  compact?: boolean;
  onToggle: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onQuickRemind?: (task: Task) => void;
}

export const TaskCard: React.FC<TaskCardProps> = ({
  task,
  todayYmd,
  viewedDateYmd,
  compact = false,
  onToggle,
  onEdit,
  onDelete,
  onQuickRemind,
}) => {
  const status = getTaskVisualStatus(task, todayYmd, viewedDateYmd);
  const isConference =
    task.category === "conference" || task.recurrence !== "none";

  const containerClasses =
    status === "done"
      ? "bg-emerald-50/75 border-emerald-200/90 hover:border-emerald-300"
      : status === "overdue"
      ? "bg-red-50/75 border-red-200/95 hover:border-red-300"
      : "bg-white border-sky-200/90 hover:border-sky-300 shadow-card";

  const checkClasses =
    status === "done"
      ? "bg-emerald-500 border-emerald-500 text-white shadow-sm"
      : status === "overdue"
      ? "bg-white border-red-400 text-transparent hover:border-red-500 hover:bg-red-50"
      : "bg-sky-50/70 border-sky-400 text-transparent hover:border-sky-500 hover:bg-sky-100/70";

  const statusPill =
    status === "done" ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        {viewedDateYmd &&
        viewedDateYmd < todayYmd &&
        task.completed_date &&
        task.completed_date > viewedDateYmd
          ? `Feita em ${formatShortBr(task.completed_date)}`
          : "Feita"}
      </span>
    ) : status === "overdue" ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
        <AlertCircle className="h-3 w-3" />
        {viewedDateYmd && viewedDateYmd < todayYmd ? (
          <span className="inline-flex items-center gap-0.5">
            Passou p/ hoje <ArrowRight className="h-2.5 w-2.5" />
          </span>
        ) : (
          `Atrasada • ${formatShortBr(task.original_date)}`
        )}
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800">
        <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
        Pendente
      </span>
    );

  const conferenceBadge = isConference ? (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold tracking-tight ${
        task.recurrence === "weekly"
          ? "border-sky-300 bg-sky-100/90 text-sky-900"
          : task.recurrence === "biweekly"
          ? "border-cyan-300 bg-cyan-100/90 text-cyan-900"
          : "border-indigo-200 bg-indigo-50 text-indigo-900"
      }`}
    >
      <ClipboardCheck className="h-3 w-3 shrink-0" />
      <span>Conferência • {recurrenceLabel(task.recurrence)}</span>
    </span>
  ) : null;

  return (
    <div
      id={`task-card-${task.id}`}
      className={`group relative rounded-xl border transition-all duration-150 ${containerClasses} ${
        compact ? "p-2.5" : "p-3.5 sm:p-4"
      }`}
    >
      <div className="flex items-start gap-3">
        <button
          id={`toggle-task-${task.id}`}
          type="button"
          onClick={() => onToggle(task)}
          aria-label={
            task.completed ? "Marcar como não feita" : "Marcar como concluída"
          }
          className={`mt-0.5 flex shrink-0 items-center justify-center rounded-lg border-2 transition-all duration-150 active:scale-95 ${checkClasses} ${
            compact ? "h-5 w-5" : "h-6 w-6"
          }`}
        >
          <Check className={compact ? "h-3.5 w-3.5 stroke-[3]" : "h-4 w-4 stroke-[3]"} />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            {statusPill}
            {conferenceBadge}
            {task.scheduled_time && (
              <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-medium text-slate-700">
                <Clock className="h-3 w-3 text-sky-600" />
                {task.scheduled_time}
              </span>
            )}
            {task.priority === "high" && !compact && (
              <span className="rounded-md bg-amber-100/90 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800">
                Prioridade Alta
              </span>
            )}
            {task.remind_whatsapp && task.remind_at && !compact && (
              <span
                title="Aviso agendado no WhatsApp"
                className="inline-flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700"
              >
                <Bell className="h-3 w-3" />
                {task.remind_sent ? "Avisado" : "WhatsApp"}
              </span>
            )}
          </div>

          <p
            onClick={() => onToggle(task)}
            className={`cursor-pointer font-semibold leading-snug transition-colors ${
              compact ? "text-xs sm:text-sm" : "text-sm sm:text-[15px]"
            } ${
              status === "done"
                ? "text-emerald-900/70 line-through decoration-emerald-500/60"
                : status === "overdue"
                ? "text-red-950"
                : "text-slate-900"
            }`}
          >
            {task.title}
          </p>

          {!compact && task.description && (
            <p className="mt-1 text-xs sm:text-sm text-slate-600 line-clamp-2">
              {task.description}
            </p>
          )}

          {!compact && task.recurrence !== "none" && task.auto_recreate && (
            <div className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-slate-500">
              <Repeat className="h-3 w-3 text-sky-600" />
              <span>Renova próximo ciclo ao concluir</span>
            </div>
          )}
        </div>

        <div
          className={`flex shrink-0 items-center gap-1 ${
            compact
              ? "opacity-80"
              : "opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
          }`}
        >
          {!compact && onQuickRemind && !task.completed && (
            <button
              type="button"
              onClick={() => onQuickRemind(task)}
              title="Criar lembrete no WhatsApp para esta tarefa"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-sky-50 hover:text-sky-600 transition-colors"
            >
              <Bell className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => onEdit(task)}
            title="Editar demanda"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          >
            <Pencil className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
          </button>
          <button
            type="button"
            onClick={() => onDelete(task)}
            title="Excluir demanda"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
          >
            <Trash2 className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
          </button>
        </div>
      </div>
    </div>
  );
};
