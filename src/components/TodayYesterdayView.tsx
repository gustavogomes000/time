import React, { useState } from "react";
import {
  Plus,
  ClipboardCheck,
  History,
  ArrowUpRight,
  CheckCircle2,
  AlertTriangle,
  CircleDot,
  Filter,
  Sparkles,
} from "lucide-react";
import type {
  FilterMode,
  Task,
  TaskCategory,
  TaskRecurrence,
} from "../types";
import {
  formatFullBr,
  formatShortBr,
  getTasksForDate,
  getTaskVisualStatus,
  matchesFilter,
} from "../types";
import { TaskCard } from "./TaskCard";

interface TodayYesterdayViewProps {
  tasks: Task[];
  todayYmd: string;
  yesterdayYmd: string;
  filter: FilterMode;
  onFilterChange: (next: FilterMode) => void;
  onQuickAddDaily: (title: string) => Promise<void>;
  onOpenCreate: (mode: TaskCategory, recurrence?: TaskRecurrence) => void;
  onToggleTask: (task: Task) => void;
  onEditTask: (task: Task) => void;
  onDeleteTask: (task: Task) => void;
  onQuickRemind: (task: Task) => void;
  onOpenDateInAgenda: (dateYmd: string) => void;
}

const FILTER_OPTIONS: { id: FilterMode; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "daily", label: "Diárias" },
  { id: "conference", label: "Conferências" },
  { id: "weekly", label: "Semanal" },
  { id: "biweekly", label: "Quinzenal" },
  { id: "monthly", label: "Mensal" },
  { id: "overdue", label: "Atrasadas" },
];

export const TodayYesterdayView: React.FC<TodayYesterdayViewProps> = ({
  tasks,
  todayYmd,
  yesterdayYmd,
  filter,
  onFilterChange,
  onQuickAddDaily,
  onOpenCreate,
  onToggleTask,
  onEditTask,
  onDeleteTask,
  onQuickRemind,
  onOpenDateInAgenda,
}) => {
  const [quickTitle, setQuickTitle] = useState("");
  const [quickSubmitting, setQuickSubmitting] = useState(false);

  const allTodayTasks = getTasksForDate(tasks, todayYmd, todayYmd);
  const filteredTodayTasks = allTodayTasks.filter((t) =>
    matchesFilter(t, filter, todayYmd)
  );

  const overdueToday = filteredTodayTasks.filter(
    (t) => getTaskVisualStatus(t, todayYmd, todayYmd) === "overdue"
  );
  const pendingToday = filteredTodayTasks.filter(
    (t) => getTaskVisualStatus(t, todayYmd, todayYmd) === "pending"
  );
  const doneToday = filteredTodayTasks.filter(
    (t) => getTaskVisualStatus(t, todayYmd, todayYmd) === "done"
  );

  // Totals for unfiltered today header badges
  const totalDone = allTodayTasks.filter((t) => t.completed).length;
  const totalOverdue = allTodayTasks.filter(
    (t) => getTaskVisualStatus(t, todayYmd, todayYmd) === "overdue"
  ).length;
  const totalPending = allTodayTasks.filter(
    (t) => getTaskVisualStatus(t, todayYmd, todayYmd) === "pending"
  ).length;
  const progressPct =
    allTodayTasks.length > 0
      ? Math.round((totalDone / allTodayTasks.length) * 100)
      : 0;

  // Yesterday compact view tasks
  const yesterdayTasks = getTasksForDate(
    tasks,
    yesterdayYmd,
    todayYmd
  ).filter((t) => matchesFilter(t, filter, todayYmd));
  const yesterdayDoneCount = yesterdayTasks.filter((t) => t.completed).length;
  const yesterdayRolledCount = yesterdayTasks.filter(
    (t) => !t.completed
  ).length;

  const handleQuickSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTitle.trim() || quickSubmitting) return;
    setQuickSubmitting(true);
    try {
      await onQuickAddDaily(quickTitle.trim());
      setQuickTitle("");
    } finally {
      setQuickSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Filter Pills Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-3 border border-slate-200/80 shadow-card">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 sm:pb-0">
          <span className="inline-flex items-center gap-1 pl-1 pr-2 text-xs font-semibold text-slate-500 shrink-0">
            <Filter className="h-3.5 w-3.5 text-sky-600" />
            Filtrar:
          </span>
          {FILTER_OPTIONS.map((opt) => {
            const active = filter === opt.id;
            return (
              <button
                key={opt.id}
                id={`filter-pill-${opt.id}`}
                type="button"
                onClick={() => onFilterChange(opt.id)}
                className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                  active
                    ? opt.id === "overdue"
                      ? "bg-red-600 text-white shadow-sm"
                      : "bg-sky-500 text-white shadow-sm"
                    : "bg-slate-100/80 text-slate-600 hover:bg-sky-50 hover:text-sky-700"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            id="btn-new-conference-top"
            type="button"
            onClick={() => onOpenCreate("conference", "weekly")}
            className="inline-flex items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-800 hover:bg-sky-100 transition-colors"
          >
            <ClipboardCheck className="h-3.5 w-3.5 text-sky-600" />
            + Conferência
          </button>
          <button
            id="btn-new-daily-top"
            type="button"
            onClick={() => onOpenCreate("daily")}
            className="inline-flex items-center gap-1.5 rounded-xl bg-sky-500 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-sky-600 transition-colors"
          >
            <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
            Nova Demanda
          </button>
        </div>
      </div>

      {/* Main Two-Column Grid: TODAY (Large) + YESTERDAY (Smaller) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* LEFT / MAIN: HOJE */}
        <section
          aria-labelledby="today-heading"
          className="lg:col-span-8 space-y-4"
        >
          <div className="rounded-2xl bg-white p-4 sm:p-5 border border-sky-100 shadow-card">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded-lg bg-sky-500 px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wider text-white">
                    Hoje
                  </span>
                  <span className="text-xs font-medium text-slate-500 capitalize">
                    {formatFullBr(todayYmd)}
                  </span>
                </div>
                <h2
                  id="today-heading"
                  className="mt-1 text-lg sm:text-xl font-extrabold tracking-tight text-slate-900"
                >
                  Demandas do Dia
                </h2>
              </div>

              {/* Color Legend Status Counters */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 border border-emerald-200/80 px-2.5 py-1.5 text-xs font-bold text-emerald-800">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  <span>{totalDone} Feitas</span>
                </div>
                <div className="inline-flex items-center gap-1.5 rounded-xl bg-sky-50 border border-sky-200/80 px-2.5 py-1.5 text-xs font-bold text-sky-800">
                  <CircleDot className="h-3.5 w-3.5 text-sky-600" />
                  <span>{totalPending} No dia</span>
                </div>
                <div className="inline-flex items-center gap-1.5 rounded-xl bg-red-50 border border-red-200/80 px-2.5 py-1.5 text-xs font-bold text-red-700">
                  <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
                  <span>{totalOverdue} Atrasadas</span>
                </div>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-medium text-slate-500">
                  Progresso de hoje
                </span>
                <span className="font-bold text-sky-700">{progressPct}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-sky-100/80">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            {/* Quick Inline Add */}
            <form
              onSubmit={handleQuickSubmit}
              className="mt-4 flex items-center gap-2"
            >
              <input
                id="quick-add-today-input"
                type="text"
                value={quickTitle}
                onChange={(e) => setQuickTitle(e.target.value)}
                placeholder="Lançar demanda rápida para hoje e apertar Enter..."
                className="flex-1 rounded-xl border border-slate-200 bg-[#F8FBFF] px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              />
              <button
                id="quick-add-today-btn"
                type="submit"
                disabled={!quickTitle.trim() || quickSubmitting}
                className="shrink-0 rounded-xl bg-sky-500 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-sky-600 disabled:opacity-50 transition-all"
              >
                Adicionar
              </button>
            </form>
          </div>

          {/* Task Groups for Today */}
          {filteredTodayTasks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-sky-200 bg-white/80 p-8 text-center">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-100 text-sky-600 mb-3">
                <Sparkles className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-800">
                {filter === "all"
                  ? "Nenhuma demanda lançada para hoje ainda"
                  : "Nenhuma demanda encontrada neste filtro"}
              </h3>
              <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
                Adicione suas tarefas diárias acima ou cadastre conferências
                semanais, quinzenais e mensais. O que não for concluído até
                meia-noite passa automaticamente para o dia seguinte em vermelho.
              </p>
              <div className="mt-4 flex items-center justify-center gap-2.5">
                <button
                  type="button"
                  onClick={() => onOpenCreate("daily")}
                  className="rounded-xl bg-sky-500 px-4 py-2 text-xs font-bold text-white hover:bg-sky-600 transition-colors"
                >
                  + Demanda Diária
                </button>
                <button
                  type="button"
                  onClick={() => onOpenCreate("conference", "weekly")}
                  className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-xs font-bold text-sky-800 hover:bg-sky-100 transition-colors"
                >
                  + Conferência Periódica
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {overdueToday.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-red-600 flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-red-500" />
                      Atrasadas vindas de dias anteriores ({overdueToday.length})
                    </h3>
                  </div>
                  <div className="space-y-2.5">
                    {overdueToday.map((t) => (
                      <TaskCard
                        key={t.id}
                        task={t}
                        todayYmd={todayYmd}
                        viewedDateYmd={todayYmd}
                        onToggle={onToggleTask}
                        onEdit={onEditTask}
                        onDelete={onDeleteTask}
                        onQuickRemind={onQuickRemind}
                      />
                    ))}
                  </div>
                </div>
              )}

              {pendingToday.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-sky-700 flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-sky-500" />
                      Pendentes de hoje ({pendingToday.length})
                    </h3>
                  </div>
                  <div className="space-y-2.5">
                    {pendingToday.map((t) => (
                      <TaskCard
                        key={t.id}
                        task={t}
                        todayYmd={todayYmd}
                        viewedDateYmd={todayYmd}
                        onToggle={onToggleTask}
                        onEdit={onEditTask}
                        onDelete={onDeleteTask}
                        onQuickRemind={onQuickRemind}
                      />
                    ))}
                  </div>
                </div>
              )}

              {doneToday.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-700 flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      Concluídas hoje ({doneToday.length})
                    </h3>
                  </div>
                  <div className="space-y-2">
                    {doneToday.map((t) => (
                      <TaskCard
                        key={t.id}
                        task={t}
                        todayYmd={todayYmd}
                        viewedDateYmd={todayYmd}
                        onToggle={onToggleTask}
                        onEdit={onEditTask}
                        onDelete={onDeleteTask}
                        onQuickRemind={onQuickRemind}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* RIGHT / SMALLER PANEL: ONTEM */}
        <aside
          aria-labelledby="yesterday-heading"
          className="lg:col-span-4 rounded-2xl bg-white p-4 border border-slate-200/85 shadow-card space-y-3.5"
        >
          <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <div className="flex items-center gap-1.5">
                <History className="h-3.5 w-3.5 text-sky-600" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Ontem • {formatShortBr(yesterdayYmd)}
                </span>
              </div>
              <h2
                id="yesterday-heading"
                className="mt-0.5 text-sm font-bold text-slate-900"
              >
                Resumo do Dia Anterior
              </h2>
            </div>

            <button
              type="button"
              onClick={() => onOpenDateInAgenda(yesterdayYmd)}
              className="inline-flex items-center gap-1 rounded-lg bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-700 hover:bg-sky-100 transition-colors"
            >
              Ver Agenda
              <ArrowUpRight className="h-3 w-3" />
            </button>
          </div>

          {/* Mini counters for yesterday */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-emerald-50/80 border border-emerald-200/70 px-3 py-2">
              <div className="text-base font-extrabold text-emerald-700">
                {yesterdayDoneCount}
              </div>
              <div className="text-[11px] font-semibold text-emerald-800">
                Concluídas
              </div>
            </div>
            <div className="rounded-xl bg-red-50/80 border border-red-200/70 px-3 py-2">
              <div className="text-base font-extrabold text-red-600">
                {yesterdayRolledCount}
              </div>
              <div className="text-[11px] font-semibold text-red-800">
                Passaram p/ hoje
              </div>
            </div>
          </div>

          {yesterdayTasks.length === 0 ? (
            <div className="rounded-xl bg-slate-50 p-4 text-center">
              <p className="text-xs font-medium text-slate-500">
                Nenhum registro encontrado para ontem ({formatShortBr(yesterdayYmd)}).
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-0.5">
              {yesterdayTasks.map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  todayYmd={todayYmd}
                  viewedDateYmd={yesterdayYmd}
                  compact
                  onToggle={onToggleTask}
                  onEdit={onEditTask}
                  onDelete={onDeleteTask}
                />
              ))}
            </div>
          )}

          <p className="text-[11px] leading-relaxed text-slate-500 bg-sky-50/60 rounded-xl p-2.5 border border-sky-100">
            À meia-noite, qualquer tarefa não marcada como feita avança
            automaticamente para <strong>Hoje</strong> em vermelho como atrasada.
          </p>
        </aside>
      </div>
    </div>
  );
};
