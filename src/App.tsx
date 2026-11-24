import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  LayoutGrid,
  Calendar,
  ClipboardCheck,
  FolderKanban,
  MessageSquare,
  Download,
  RefreshCw,
  Bell,
  X,
  Plus,
  Smartphone,
} from "lucide-react";
import { api, type CreateTaskPayload } from "./lib/api";
import {
  addDaysYmd,
  formatShortBr,
  getTaskVisualStatus,
  toYmd,
  type FilterMode,
  type NavTab,
  type Reminder,
  type Task,
  type TaskCategory,
  type TaskRecurrence,
} from "./types";
import { TodayYesterdayView } from "./components/TodayYesterdayView";
import { DayAgendaView } from "./components/DayAgendaView";
import { ConferencesView } from "./components/ConferencesView";
import { NotionNotesView } from "./components/NotionNotesView";
import { WhatsAppRemindersView } from "./components/WhatsAppRemindersView";
import { CreateTaskModal } from "./components/CreateTaskModal";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function App() {
  const fallbackToday = useMemo(() => toYmd(new Date()), []);
  const [todayYmd, setTodayYmd] = useState<string>(fallbackToday);
  const [yesterdayYmd, setYesterdayYmd] = useState<string>(() =>
    addDaysYmd(fallbackToday, -1)
  );
  const [selectedAgendaDate, setSelectedAgendaDate] =
    useState<string>(fallbackToday);

  const [activeTab, setActiveTab] = useState<NavTab>("overview");
  const [filter, setFilter] = useState<FilterMode>("all");

  const [tasks, setTasks] = useState<Task[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [syncing, setSyncing] = useState<boolean>(false);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<TaskCategory>("daily");
  const [modalRecurrence, setModalRecurrence] =
    useState<TaskRecurrence>("none");
  const [modalDate, setModalDate] = useState<string>(fallbackToday);
  const [modalTime, setModalTime] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // Quick WhatsApp prefill
  const [prefillRemindTask, setPrefillRemindTask] = useState<Task | null>(null);

  // PWA Install Prompt
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallGuide, setShowInstallGuide] = useState(false);

  // Toast feedback
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const notifyToast = useCallback(
    (message: string, type: "success" | "error" = "success") => {
      setToast({ message, type });
      window.setTimeout(() => {
        setToast((cur) => (cur?.message === message ? null : cur));
      }, 4000);
    },
    []
  );

  const loadAll = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      else setSyncing(true);
      try {
        const [taskRes, remRes] = await Promise.all([
          api.fetchTasks(),
          api.fetchReminders(),
        ]);
        const prevToday = todayYmd;
        setTodayYmd(taskRes.today);
        setYesterdayYmd(taskRes.yesterday);
        if (selectedAgendaDate === prevToday && taskRes.today !== prevToday) {
          setSelectedAgendaDate(taskRes.today);
        }
        setTasks(taskRes.tasks);
        setReminders(remRes.reminders);
      } catch (err) {
        if (!silent) {
          notifyToast(
            err instanceof Error
              ? err.message
              : "Erro ao sincronizar com o banco.",
            "error"
          );
        }
      } finally {
        setLoading(false);
        setSyncing(false);
      }
    },
    [notifyToast, selectedAgendaDate, todayYmd]
  );

  useEffect(() => {
    void loadAll(false);
    const interval = window.setInterval(() => {
      void loadAll(true);
    }, 45000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
    } else {
      setShowInstallGuide(true);
    }
  };

  const handleOpenCreate = (
    mode: TaskCategory,
    recurrence: TaskRecurrence = "none",
    customDate?: string,
    customTime: string | null = null
  ) => {
    setEditingTask(null);
    setModalMode(mode);
    setModalRecurrence(recurrence);
    setModalDate(customDate || todayYmd);
    setModalTime(customTime);
    setModalOpen(true);
  };

  const handleSaveTask = async (
    payload: CreateTaskPayload,
    existingId?: string
  ) => {
    if (existingId) {
      const res = await api.updateTask({ id: existingId, ...payload });
      setTasks((prev) =>
        prev.map((t) => (t.id === existingId ? res.task : t))
      );
      notifyToast("Demanda atualizada!");
    } else {
      const res = await api.createTask(payload);
      setTasks((prev) => [res.task, ...prev]);
      notifyToast(
        payload.category === "conference"
          ? "Conferência periódica cadastrada!"
          : "Demanda adicionada!"
      );
    }
    void loadAll(true);
  };

  const handleQuickAddDaily = async (title: string) => {
    const res = await api.createTask({
      title,
      category: "daily",
      recurrence: "none",
      scheduled_date: todayYmd,
      priority: "normal",
    });
    setTasks((prev) => [res.task, ...prev]);
    notifyToast("Demanda adicionada para hoje!");
  };

  const handleToggleTask = async (task: Task) => {
    const nextCompleted = !task.completed;
    // Optimistic state update
    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id
          ? {
              ...t,
              completed: nextCompleted,
              completed_date: nextCompleted ? todayYmd : null,
            }
          : t
      )
    );
    try {
      const res = await api.updateTask({
        id: task.id,
        completed: nextCompleted,
      });
      setTasks((prev) => {
        const mapped = prev.map((t) => (t.id === task.id ? res.task : t));
        return res.nextTask ? [res.nextTask, ...mapped] : mapped;
      });
      if (res.nextTask) {
        notifyToast(
          `Conferência concluída! Próxima entrega agendada para ${formatShortBr(
            res.nextTask.scheduled_date
          )}.`
        );
      }
    } catch (err) {
      // Revert on failure
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
      notifyToast(
        err instanceof Error ? err.message : "Erro ao atualizar tarefa.",
        "error"
      );
    }
  };

  const handleDeleteTask = async (task: Task) => {
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
    try {
      await api.deleteTask(task.id);
      notifyToast("Demanda excluída.");
    } catch (err) {
      setTasks((prev) => [task, ...prev]);
      notifyToast(
        err instanceof Error ? err.message : "Erro ao excluir demanda.",
        "error"
      );
    }
  };

  const handleQuickRemind = (task: Task) => {
    setPrefillRemindTask(task);
    setActiveTab("whatsapp");
  };

  const handleDismissInAppAlert = async (rem: Reminder) => {
    setReminders((prev) =>
      prev.map((r) => (r.id === rem.id ? { ...r, in_app_dismissed: true } : r))
    );
    try {
      await api.updateReminder({ id: rem.id, in_app_dismissed: true });
    } catch {
      // ignore
    }
  };

  // In-app due alerts banner
  const activeAlerts = reminders.filter(
    (r) => !r.in_app_dismissed && new Date(r.remind_at).getTime() <= Date.now()
  );

  const overdueGlobalCount = tasks.filter(
    (t) => getTaskVisualStatus(t, todayYmd) === "overdue"
  ).length;
  const pendingConfCount = tasks.filter(
    (t) =>
      (t.category === "conference" || t.recurrence !== "none") && !t.completed
  ).length;
  const pendingRemCount = reminders.filter((r) => !r.sent).length;

  const navItems: {
    id: NavTab;
    label: string;
    shortLabel: string;
    icon: React.FC<{ className?: string }>;
    badge?: number;
  }[] = [
    {
      id: "overview",
      label: "Hoje & Ontem",
      shortLabel: "Hoje",
      icon: LayoutGrid,
      badge: overdueGlobalCount > 0 ? overdueGlobalCount : undefined,
    },
    {
      id: "agenda",
      label: "Agenda por Dia",
      shortLabel: "Agenda",
      icon: Calendar,
    },
    {
      id: "conferences",
      label: "Conferências",
      shortLabel: "Confer.",
      icon: ClipboardCheck,
      badge: pendingConfCount > 0 ? pendingConfCount : undefined,
    },
    {
      id: "notes",
      label: "Notas & Cards",
      shortLabel: "Notas",
      icon: FolderKanban,
    },
    {
      id: "whatsapp",
      label: "Avisos & WhatsApp",
      shortLabel: "WhatsApp",
      icon: MessageSquare,
      badge: pendingRemCount > 0 ? pendingRemCount : undefined,
    },
  ];

  return (
    <div className="min-h-dvh flex flex-col bg-[#F4F9FD] text-slate-900 pb-20 md:pb-8">
      {/* Top App Bar */}
      <header className="sticky top-0 z-30 border-b border-sky-100/90 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          {/* Brand Logo ("G" + Demanda do Gustavo) */}
          <div className="flex items-center gap-3">
            <img
              src="/pwa-192x192.png"
              alt="Logo G — Demanda do Gustavo"
              className="h-10 w-10 rounded-xl shadow-sm border border-sky-200/70 object-cover"
            />
            <div>
              <h1 className="text-base sm:text-lg font-extrabold tracking-tight text-slate-900 leading-none">
                Demanda do Gustavo
              </h1>
              <p className="mt-1 text-[11px] font-medium text-sky-700">
                Controle Diário, Conferências & WhatsApp
              </p>
            </div>
          </div>

          {/* Desktop Nav */}
          <nav
            aria-label="Navegação principal"
            className="hidden md:flex items-center gap-1 rounded-2xl bg-sky-50/80 p-1 border border-sky-100"
          >
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  id={`nav-desktop-${item.id}`}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-all ${
                    active
                      ? "bg-sky-500 text-white shadow-sm"
                      : "text-slate-600 hover:bg-white hover:text-sky-700"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                  {item.badge !== undefined && (
                    <span
                      className={`rounded-full px-1.5 py-0.2 text-[10px] font-extrabold ${
                        active
                          ? "bg-white text-sky-700"
                          : item.id === "overview"
                          ? "bg-red-100 text-red-700"
                          : "bg-sky-200/80 text-sky-900"
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Right Actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadAll(true)}
              title="Sincronizar agora"
              className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:bg-sky-50 hover:text-sky-700 transition-colors"
            >
              <RefreshCw
                className={`h-4 w-4 ${syncing ? "animate-spin text-sky-600" : ""}`}
              />
            </button>

            <button
              id="btn-install-pwa"
              type="button"
              onClick={() => void handleInstallClick()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-800 hover:bg-sky-100 transition-colors"
              title="Instalar aplicativo PWA"
            >
              <Download className="h-3.5 w-3.5 text-sky-600" />
              <span className="hidden sm:inline">Instalar App</span>
            </button>
          </div>
        </div>
      </header>

      {/* Active In-App Alerts Banner */}
      {activeAlerts.length > 0 && (
        <div className="mx-auto w-full max-w-6xl px-4 pt-3 space-y-2">
          {activeAlerts.map((alert) => (
            <div
              key={alert.id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-sky-300 bg-sky-500 px-4 py-3 text-white shadow-sm"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Bell className="h-4 w-4 shrink-0 animate-bounce" />
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-extrabold truncate">
                    Aviso: {alert.title}
                  </p>
                  {alert.message && alert.message !== alert.title && (
                    <p className="text-xs text-sky-100 truncate">
                      {alert.message}
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleDismissInAppAlert(alert)}
                className="rounded-lg bg-white/20 px-2.5 py-1 text-xs font-bold hover:bg-white/30 transition-colors shrink-0"
              >
                OK
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Main Content Container */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5">
        {loading ? (
          <div className="rounded-2xl bg-white p-12 text-center border border-slate-200/70 shadow-card">
            <RefreshCw className="mx-auto h-7 w-7 animate-spin text-sky-500 mb-3" />
            <p className="text-sm font-semibold text-slate-600">
              Carregando suas demandas no Supabase...
            </p>
          </div>
        ) : activeTab === "overview" ? (
          <TodayYesterdayView
            tasks={tasks}
            todayYmd={todayYmd}
            yesterdayYmd={yesterdayYmd}
            filter={filter}
            onFilterChange={setFilter}
            onQuickAddDaily={handleQuickAddDaily}
            onOpenCreate={(mode, rec) => handleOpenCreate(mode, rec)}
            onToggleTask={handleToggleTask}
            onEditTask={(task) => {
              setEditingTask(task);
              setModalOpen(true);
            }}
            onDeleteTask={handleDeleteTask}
            onQuickRemind={handleQuickRemind}
            onOpenDateInAgenda={(dateYmd) => {
              setSelectedAgendaDate(dateYmd);
              setActiveTab("agenda");
            }}
          />
        ) : activeTab === "agenda" ? (
          <DayAgendaView
            tasks={tasks}
            todayYmd={todayYmd}
            yesterdayYmd={yesterdayYmd}
            selectedDate={selectedAgendaDate}
            filter={filter}
            onSelectDate={setSelectedAgendaDate}
            onFilterChange={setFilter}
            onToggleTask={handleToggleTask}
            onEditTask={(task) => {
              setEditingTask(task);
              setModalOpen(true);
            }}
            onOpenCreateAt={(dateYmd, time, mode = "daily", rec = "none") =>
              handleOpenCreate(mode, rec, dateYmd, time)
            }
          />
        ) : activeTab === "conferences" ? (
          <ConferencesView
            tasks={tasks}
            todayYmd={todayYmd}
            onOpenCreate={(mode, rec) => handleOpenCreate(mode, rec)}
            onToggleTask={handleToggleTask}
            onEditTask={(task) => {
              setEditingTask(task);
              setModalOpen(true);
            }}
            onDeleteTask={handleDeleteTask}
            onQuickRemind={handleQuickRemind}
          />
        ) : activeTab === "notes" ? (
          <NotionNotesView onNotifyToast={notifyToast} />
        ) : (
          <WhatsAppRemindersView
            tasks={tasks}
            reminders={reminders}
            prefillTask={prefillRemindTask}
            onClearPrefillTask={() => setPrefillRemindTask(null)}
            onRefreshReminders={async () => {
              const res = await api.fetchReminders();
              setReminders(res.reminders);
            }}
            onNotifyToast={notifyToast}
          />
        )}
      </main>

      {/* Mobile Floating Action Button + Bottom Navigation */}
      {activeTab !== "notes" && (
        <button
          id="fab-mobile-new-task"
          type="button"
          onClick={() =>
            handleOpenCreate(
              activeTab === "conferences" ? "conference" : "daily",
              activeTab === "conferences" ? "weekly" : "none",
              activeTab === "agenda" ? selectedAgendaDate : todayYmd
            )
          }
          aria-label="Nova demanda"
          className="md:hidden fixed bottom-20 right-4 z-30 flex h-13 w-13 items-center justify-center rounded-2xl bg-sky-500 p-3.5 text-white shadow-elevated active:scale-95 transition-transform"
        >
          <Plus className="h-6 w-6 stroke-[2.5]" />
        </button>
      )}

      <nav
        aria-label="Navegação mobile"
        className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur-md pb-safe"
      >
        <div className="grid grid-cols-5 px-1 pt-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`relative flex flex-col items-center justify-center py-1.5 rounded-xl transition-colors ${
                  active ? "text-sky-600" : "text-slate-500"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="mt-0.5 text-[10px] font-bold">
                  {item.shortLabel}
                </span>
                {item.badge !== undefined && (
                  <span
                    className={`absolute top-1 right-4 rounded-full px-1.5 text-[9px] font-extrabold ${
                      item.id === "overview"
                        ? "bg-red-500 text-white"
                        : "bg-sky-500 text-white"
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Create / Edit Task Modal */}
      <CreateTaskModal
        open={modalOpen}
        initialMode={modalMode}
        initialRecurrence={modalRecurrence}
        initialDate={modalDate}
        initialTime={modalTime}
        editingTask={editingTask}
        onClose={() => {
          setModalOpen(false);
          setEditingTask(null);
        }}
        onSave={handleSaveTask}
      />

      {/* PWA Install Instructions Modal */}
      {showInstallGuide && (
        <div
          onClick={() => setShowInstallGuide(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-elevated border border-slate-200 space-y-3.5"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <img
                  src="/pwa-192x192.png"
                  alt="Ícone G"
                  className="h-10 w-10 rounded-xl"
                />
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">
                    Instalar Demanda do Gustavo
                  </h3>
                  <p className="text-xs text-slate-500">
                    Acesse rápido pela tela inicial (PWA)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowInstallGuide(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="rounded-xl bg-sky-50/80 border border-sky-100 p-3.5 space-y-2 text-xs text-slate-700">
              <p className="flex items-start gap-2">
                <Smartphone className="h-4 w-4 text-sky-600 shrink-0 mt-0.5" />
                <span>
                  <strong>No iPhone (Safari):</strong> Toque em{" "}
                  <strong>Compartilhar</strong> e escolha{" "}
                  <strong>Adicionar à Tela de Início</strong>.
                </span>
              </p>
              <p className="flex items-start gap-2">
                <Download className="h-4 w-4 text-sky-600 shrink-0 mt-0.5" />
                <span>
                  <strong>No Android / Chrome / Edge:</strong> Clique no menu do
                  navegador ou no ícone de instalar na barra de endereço e
                  selecione <strong>Instalar aplicativo</strong>.
                </span>
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowInstallGuide(false)}
              className="w-full rounded-xl bg-sky-500 py-2.5 text-xs font-bold text-white hover:bg-sky-600"
            >
              Entendi
            </button>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div
          role="status"
          className={`fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-xl px-4 py-2.5 text-xs font-bold shadow-elevated border transition-all ${
            toast.type === "error"
              ? "bg-red-600 border-red-700 text-white"
              : "bg-slate-900 border-slate-800 text-white"
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}

export default App;
