import React from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Check,
  Clock,
  ClipboardCheck,
  AlertCircle,
  Calendar as CalendarIcon,
} from "lucide-react";
import type {
  FilterMode,
  Task,
  TaskCategory,
  TaskRecurrence,
} from "../types";
import {
  addDaysYmd,
  formatFullBr,
  formatShortBr,
  getTasksForDate,
  getTaskVisualStatus,
  matchesFilter,
  parseYmdLocal,
  recurrenceLabel,
} from "../types";

interface DayAgendaViewProps {
  tasks: Task[];
  todayYmd: string;
  yesterdayYmd: string;
  selectedDate: string;
  filter: FilterMode;
  onSelectDate: (dateYmd: string) => void;
  onFilterChange: (next: FilterMode) => void;
  onToggleTask: (task: Task) => void;
  onEditTask: (task: Task) => void;
  onOpenCreateAt: (
    dateYmd: string,
    time: string | null,
    mode?: TaskCategory,
    rec?: TaskRecurrence
  ) => void;
}

const HOURS = Array.from({ length: 17 }, (_, idx) => idx + 6); // 06:00 .. 22:00

export const DayAgendaView: React.FC<DayAgendaViewProps> = ({
  tasks,
  todayYmd,
  yesterdayYmd,
  selectedDate,
  filter,
  onSelectDate,
  onFilterChange,
  onToggleTask,
  onEditTask,
  onOpenCreateAt,
}) => {
  const dayTasks = getTasksForDate(tasks, selectedDate, todayYmd).filter((t) =>
    matchesFilter(t, filter, todayYmd)
  );

  const untimedTasks = dayTasks.filter((t) => !t.scheduled_time);
  const timedTasks = dayTasks.filter((t) => Boolean(t.scheduled_time));

  // Build 7-day strip centered around selectedDate
  const weekDays = [-3, -2, -1, 0, 1, 2, 3].map((offset) => {
    const ymd = addDaysYmd(selectedDate, offset);
    const dt = parseYmdLocal(ymd);
    const wk = new Intl.DateTimeFormat("pt-BR", { weekday: "short" })
      .format(dt)
      .replace(".", "");
    return {
      ymd,
      dayNum: ymd.split("-")[2],
      wk,
      isToday: ymd === todayYmd,
      isSelected: ymd === selectedDate,
    };
  });

  const doneCount = dayTasks.filter(
    (t) => getTaskVisualStatus(t, todayYmd, selectedDate) === "done"
  ).length;
  const pendingCount = dayTasks.filter(
    (t) => getTaskVisualStatus(t, todayYmd, selectedDate) === "pending"
  ).length;
  const overdueCount = dayTasks.filter(
    (t) => getTaskVisualStatus(t, todayYmd, selectedDate) === "overdue"
  ).length;

  const renderAgendaItem = (task: Task) => {
    const status = getTaskVisualStatus(task, todayYmd, selectedDate);
    const isConf = task.category === "conference" || task.recurrence !== "none";

    const cardStyle =
      status === "done"
        ? "bg-emerald-500/12 border-emerald-400 text-emerald-950 hover:bg-emerald-500/18"
        : status === "overdue"
        ? "bg-red-500/12 border-red-400 text-red-950 hover:bg-red-500/18"
        : "bg-sky-500/12 border-sky-400 text-sky-950 hover:bg-sky-500/18";

    const checkStyle =
      status === "done"
        ? "bg-emerald-500 border-emerald-600 text-white"
        : status === "overdue"
        ? "bg-white border-red-500 text-transparent hover:bg-red-50"
        : "bg-white border-sky-500 text-transparent hover:bg-sky-50";

    return (
      <div
        key={task.id}
        className={`flex items-center justify-between gap-2.5 rounded-xl border px-3 py-2 transition-all ${cardStyle}`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => onToggleTask(task)}
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all ${checkStyle}`}
            aria-label="Alternar conclusão"
          >
            <Check className="h-3.5 w-3.5 stroke-[3]" />
          </button>

          <div
            onClick={() => onEditTask(task)}
            className="min-w-0 cursor-pointer"
          >
            <div className="flex flex-wrap items-center gap-1.5">
              {task.scheduled_time && (
                <span className="font-mono text-[11px] font-bold opacity-80">
                  {task.scheduled_time}
                </span>
              )}
              <span
                className={`text-xs sm:text-sm font-bold truncate ${
                  status === "done" ? "line-through opacity-75" : ""
                }`}
              >
                {task.title}
              </span>
              {isConf && (
                <span className="inline-flex items-center gap-1 rounded bg-white/80 px-1.5 py-0.5 text-[10px] font-bold text-sky-900 border border-sky-200">
                  <ClipboardCheck className="h-2.5 w-2.5" />
                  {recurrenceLabel(task.recurrence)}
                </span>
              )}
              {status === "overdue" && (
                <span className="inline-flex items-center gap-0.5 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  <AlertCircle className="h-2.5 w-2.5" />
                  {selectedDate < todayYmd
                    ? "Não feita no dia"
                    : `Desde ${formatShortBr(task.original_date)}`}
                </span>
              )}
            </div>
          </div>
        </div>

        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase ${
            status === "done"
              ? "bg-emerald-600 text-white"
              : status === "overdue"
              ? "bg-red-100 text-red-800"
              : "bg-sky-600 text-white"
          }`}
        >
          {status === "done"
            ? "Verde • Feita"
            : status === "overdue"
            ? "Vermelha • Atrasada"
            : "Azul • Pendente"}
        </span>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Google Calendar Day Navigation Header */}
      <div className="rounded-2xl bg-white p-4 border border-slate-200/85 shadow-card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              id="agenda-prev-day-btn"
              type="button"
              onClick={() => onSelectDate(addDaysYmd(selectedDate, -1))}
              className="rounded-xl border border-slate-200 p-2 text-slate-700 hover:bg-sky-50 hover:border-sky-300 transition-colors"
              title="Dia anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              id="agenda-yesterday-btn"
              type="button"
              onClick={() => onSelectDate(yesterdayYmd)}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold border transition-colors ${
                selectedDate === yesterdayYmd
                  ? "bg-sky-100 border-sky-300 text-sky-900"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              Ontem
            </button>
            <button
              id="agenda-today-btn"
              type="button"
              onClick={() => onSelectDate(todayYmd)}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold border transition-colors ${
                selectedDate === todayYmd
                  ? "bg-sky-500 border-sky-500 text-white"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              Hoje
            </button>
            <button
              id="agenda-next-day-btn"
              type="button"
              onClick={() => onSelectDate(addDaysYmd(selectedDate, 1))}
              className="rounded-xl border border-slate-200 p-2 text-slate-700 hover:bg-sky-50 hover:border-sky-300 transition-colors"
              title="Próximo dia"
            >
              <ChevronRight className="h-4 w-4" />
            </button>

            <div className="relative ml-1">
              <input
                aria-label="Selecionar data na agenda"
                type="date"
                value={selectedDate}
                onChange={(e) => e.target.value && onSelectDate(e.target.value)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 focus:border-sky-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenCreateAt(selectedDate, null, "daily")}
              className="inline-flex items-center gap-1.5 rounded-xl bg-sky-500 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-sky-600 transition-colors"
            >
              <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
              Lançar neste dia
            </button>
          </div>
        </div>

        {/* 7-Day Strip */}
        <div className="grid grid-cols-7 gap-1.5">
          {weekDays.map((d) => (
            <button
              key={d.ymd}
              type="button"
              onClick={() => onSelectDate(d.ymd)}
              className={`flex flex-col items-center rounded-xl py-2 transition-all border ${
                d.isSelected
                  ? "bg-sky-500 border-sky-500 text-white shadow-sm"
                  : d.isToday
                  ? "bg-sky-50 border-sky-200 text-sky-800"
                  : "bg-slate-50/70 border-transparent text-slate-600 hover:bg-sky-50/50"
              }`}
            >
              <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">
                {d.wk}
              </span>
              <span className="mt-0.5 text-sm font-extrabold">{d.dayNum}</span>
            </button>
          ))}
        </div>

        {/* Title + Color Status Legend + Filter */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-100">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-sky-600" />
            <h2 className="text-sm sm:text-base font-extrabold capitalize text-slate-900">
              {formatFullBr(selectedDate)}
              {selectedDate === todayYmd
                ? " (Hoje)"
                : selectedDate === yesterdayYmd
                ? " (Ontem)"
                : ""}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
            <span className="rounded-lg bg-emerald-100 px-2.5 py-1 text-emerald-800">
              🟢 {doneCount} Feitas
            </span>
            <span className="rounded-lg bg-sky-100 px-2.5 py-1 text-sky-800">
              🔵 {pendingCount} Não feitas
            </span>
            <span className="rounded-lg bg-red-100 px-2.5 py-1 text-red-800">
              🔴 {overdueCount} Atrasadas
            </span>
          </div>
        </div>

        {/* Quick Filter inside Agenda */}
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {(
            [
              { id: "all", label: "Todas" },
              { id: "daily", label: "Diárias" },
              { id: "conference", label: "Conferências" },
              { id: "weekly", label: "Semanal" },
              { id: "biweekly", label: "Quinzenal" },
              { id: "monthly", label: "Mensal" },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onFilterChange(f.id)}
              className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors ${
                filter === f.id
                  ? "bg-sky-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-sky-50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Google Calendar Day Timeline Container */}
      <div className="rounded-2xl bg-white border border-slate-200/85 shadow-card overflow-hidden">
        {/* All-Day / Untimed Section */}
        <div className="border-b border-slate-200 bg-sky-50/40 p-3.5 sm:p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
              Dia Inteiro / Sem Horário Fixo ({untimedTasks.length})
            </span>
            <button
              type="button"
              onClick={() => onOpenCreateAt(selectedDate, null, "daily")}
              className="text-xs font-bold text-sky-600 hover:text-sky-700"
            >
              + Adicionar
            </button>
          </div>

          {untimedTasks.length === 0 ? (
            <p className="text-xs text-slate-400">
              Nenhuma demanda sem horário fixo neste dia.
            </p>
          ) : (
            <div className="space-y-2">
              {untimedTasks.map((t) => renderAgendaItem(t))}
            </div>
          )}
        </div>

        {/* Hourly Grid 06:00 - 22:00 */}
        <div className="divide-y divide-slate-100">
          {HOURS.map((hour) => {
            const hourPrefix = String(hour).padStart(2, "0");
            const slotLabel = `${hourPrefix}:00`;
            const slotTasks = timedTasks.filter((t) =>
              t.scheduled_time?.startsWith(`${hourPrefix}:`)
            );

            return (
              <div
                key={hour}
                className="group flex min-h-[58px] hover:bg-sky-50/30 transition-colors"
              >
                <div className="w-16 sm:w-20 shrink-0 border-r border-slate-100 py-2.5 pr-3 text-right">
                  <span className="font-mono text-xs font-semibold text-slate-400">
                    {slotLabel}
                  </span>
                </div>

                <div className="flex-1 p-2 space-y-1.5">
                  {slotTasks.map((t) => renderAgendaItem(t))}

                  <button
                    type="button"
                    onClick={() =>
                      onOpenCreateAt(selectedDate, slotLabel, "daily")
                    }
                    className={`${
                      slotTasks.length === 0
                        ? "opacity-0 group-hover:opacity-100"
                        : "opacity-0 group-hover:opacity-100"
                    } inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-sky-600 hover:bg-sky-100/70 transition-opacity`}
                  >
                    <Clock className="h-3 w-3" />+ Agendar às {slotLabel}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
