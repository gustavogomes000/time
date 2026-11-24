import React, { useState } from "react";
import {
  ClipboardCheck,
  Plus,
  CalendarRange,
  Repeat,
  CheckCircle2,
} from "lucide-react";
import type { Task, TaskCategory, TaskRecurrence } from "../types";
import { formatDayMonthYearBr } from "../types";
import { TaskCard } from "./TaskCard";

interface ConferencesViewProps {
  tasks: Task[];
  todayYmd: string;
  onOpenCreate: (mode: TaskCategory, recurrence: TaskRecurrence) => void;
  onToggleTask: (task: Task) => void;
  onEditTask: (task: Task) => void;
  onDeleteTask: (task: Task) => void;
  onQuickRemind: (task: Task) => void;
}

export const ConferencesView: React.FC<ConferencesViewProps> = ({
  tasks,
  todayYmd,
  onOpenCreate,
  onToggleTask,
  onEditTask,
  onDeleteTask,
  onQuickRemind,
}) => {
  const [subFilter, setSubFilter] = useState<
    "all" | "weekly" | "biweekly" | "monthly"
  >("all");
  const [showCompleted, setShowCompleted] = useState(true);

  const conferenceTasks = tasks.filter(
    (t) => t.category === "conference" || t.recurrence !== "none"
  );

  const filtered = conferenceTasks.filter((t) => {
    if (!showCompleted && t.completed) return false;
    if (subFilter === "all") return true;
    return t.recurrence === subFilter;
  });

  const weeklyCount = conferenceTasks.filter(
    (t) => t.recurrence === "weekly" && !t.completed
  ).length;
  const biweeklyCount = conferenceTasks.filter(
    (t) => t.recurrence === "biweekly" && !t.completed
  ).length;
  const monthlyCount = conferenceTasks.filter(
    (t) => t.recurrence === "monthly" && !t.completed
  ).length;

  return (
    <div className="space-y-5">
      {/* Header & Fast Launchers */}
      <div className="rounded-2xl bg-white p-5 border border-sky-100 shadow-card">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-sky-700">
              <ClipboardCheck className="h-4 w-4" />
              Entregas Periódicas
            </div>
            <h2 className="mt-1 text-lg sm:text-xl font-extrabold text-slate-900">
              Demandas Extras de Conferência
            </h2>
            <p className="mt-0.5 text-xs sm:text-sm text-slate-500">
              Controle exclusivo das suas entregas semanais, quinzenais e mensais.
              Ao concluir uma conferência, o próximo ciclo é agendado automaticamente.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              id="btn-create-weekly"
              type="button"
              onClick={() => onOpenCreate("conference", "weekly")}
              className="inline-flex items-center gap-1.5 rounded-xl bg-sky-500 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-sky-600 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Semanal
            </button>
            <button
              id="btn-create-biweekly"
              type="button"
              onClick={() => onOpenCreate("conference", "biweekly")}
              className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-cyan-700 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Quinzenal
            </button>
            <button
              id="btn-create-monthly"
              type="button"
              onClick={() => onOpenCreate("conference", "monthly")}
              className="inline-flex items-center gap-1.5 rounded-xl bg-sky-800 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-sky-900 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Mensal
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="mt-4 grid grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() =>
              setSubFilter(subFilter === "weekly" ? "all" : "weekly")
            }
            className={`rounded-xl border p-3 text-left transition-all ${
              subFilter === "weekly"
                ? "border-sky-500 bg-sky-50 ring-2 ring-sky-500/20"
                : "border-slate-200/80 bg-slate-50/50 hover:bg-sky-50/40"
            }`}
          >
            <div className="text-xs font-bold text-sky-800">Semanais</div>
            <div className="mt-1 text-xl font-extrabold text-slate-900">
              {weeklyCount}
            </div>
            <div className="text-[11px] text-slate-500">pendentes</div>
          </button>

          <button
            type="button"
            onClick={() =>
              setSubFilter(subFilter === "biweekly" ? "all" : "biweekly")
            }
            className={`rounded-xl border p-3 text-left transition-all ${
              subFilter === "biweekly"
                ? "border-cyan-500 bg-cyan-50/70 ring-2 ring-cyan-500/20"
                : "border-slate-200/80 bg-slate-50/50 hover:bg-cyan-50/40"
            }`}
          >
            <div className="text-xs font-bold text-cyan-800">Quinzenais</div>
            <div className="mt-1 text-xl font-extrabold text-slate-900">
              {biweeklyCount}
            </div>
            <div className="text-[11px] text-slate-500">pendentes</div>
          </button>

          <button
            type="button"
            onClick={() =>
              setSubFilter(subFilter === "monthly" ? "all" : "monthly")
            }
            className={`rounded-xl border p-3 text-left transition-all ${
              subFilter === "monthly"
                ? "border-indigo-400 bg-indigo-50/70 ring-2 ring-indigo-500/20"
                : "border-slate-200/80 bg-slate-50/50 hover:bg-indigo-50/40"
            }`}
          >
            <div className="text-xs font-bold text-indigo-900">Mensais</div>
            <div className="mt-1 text-xl font-extrabold text-slate-900">
              {monthlyCount}
            </div>
            <div className="text-[11px] text-slate-500">pendentes</div>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 border border-slate-200/80 shadow-card">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {(
            [
              { id: "all", label: "Todas Conferências" },
              { id: "weekly", label: "Só Semanal" },
              { id: "biweekly", label: "Só Quinzenal" },
              { id: "monthly", label: "Só Mensal" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubFilter(tab.id)}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-colors ${
                subFilter === tab.id
                  ? "bg-sky-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-sky-50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={showCompleted}
            onChange={(e) => setShowCompleted(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-sky-600"
          />
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          Mostrar concluídas
        </label>
      </div>

      {/* Conference List */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-sky-200 bg-white p-10 text-center">
          <Repeat className="mx-auto h-8 w-8 text-sky-500 mb-2" />
          <h3 className="text-sm font-bold text-slate-800">
            Nenhuma conferência cadastrada neste filtro
          </h3>
          <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
            Lance suas conferências semanais, quinzenais ou mensais acima para
            acompanhar prazos e receber alertas automáticos.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((task) => (
            <div key={task.id} className="space-y-1">
              <div className="flex items-center gap-1.5 px-1 text-[11px] font-semibold text-slate-500">
                <CalendarRange className="h-3.5 w-3.5 text-sky-600" />
                <span>
                  Entrega programada:{" "}
                  <strong className="text-slate-800">
                    {formatDayMonthYearBr(task.scheduled_date)}
                  </strong>
                </span>
              </div>
              <TaskCard
                task={task}
                todayYmd={todayYmd}
                onToggle={onToggleTask}
                onEdit={onEditTask}
                onDelete={onDeleteTask}
                onQuickRemind={onQuickRemind}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
