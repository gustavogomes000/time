import React, { useEffect, useState } from "react";
import {
  MessageSquare,
  BellPlus,
  Send,
  Settings2,
  CheckCircle2,
  Trash2,
  RefreshCw,
  ShieldCheck,
  Clock,
  PhoneCall,
} from "lucide-react";
import { api } from "../lib/api";
import type { AppSettings, Reminder, Task, WhatsAppLog } from "../types";

interface WhatsAppRemindersViewProps {
  tasks: Task[];
  reminders: Reminder[];
  prefillTask?: Task | null;
  onClearPrefillTask: () => void;
  onRefreshReminders: () => Promise<void>;
  onNotifyToast: (msg: string, type?: "success" | "error") => void;
}

export const WhatsAppRemindersView: React.FC<WhatsAppRemindersViewProps> = ({
  tasks,
  reminders,
  prefillTask,
  onClearPrefillTask,
  onRefreshReminders,
  onNotifyToast,
}) => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [summaryPreview, setSummaryPreview] = useState("");
  const [logs, setLogs] = useState<WhatsAppLog[]>([]);
  const [loadingSettings, setLoadingSettings] = useState(true);

  // Reminder creation form
  const [remTitle, setRemTitle] = useState("");
  const [remMessage, setRemMessage] = useState("");
  const [remDateTime, setRemDateTime] = useState("");
  const [remRecurrence, setRemRecurrence] = useState<
    "none" | "daily" | "weekly"
  >("none");
  const [remTaskId, setRemTaskId] = useState("");
  const [savingRem, setSavingRem] = useState(false);

  // Settings edit form
  const [phoneInput, setPhoneInput] = useState("556293885258");
  const [summaryTimeInput, setSummaryTimeInput] = useState("19:00");
  const [summaryEnabledInput, setSummaryEnabledInput] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [sendingSummary, setSendingSummary] = useState(false);
  const [testingMsg, setTestingMsg] = useState(false);
  const [checkingPhone, setCheckingPhone] = useState(false);

  const loadSettingsData = async () => {
    setLoadingSettings(true);
    try {
      const res = await api.fetchSettings();
      setSettings(res.settings);
      setSummaryPreview(res.summaryPreview);
      setLogs(res.logs);
      setPhoneInput(res.settings.default_phone || "556293885258");
      setSummaryTimeInput(res.settings.daily_summary_time || "19:00");
      setSummaryEnabledInput(res.settings.daily_summary_enabled);
    } catch (err) {
      onNotifyToast(
        err instanceof Error ? err.message : "Erro ao carregar WhatsApp",
        "error"
      );
    } finally {
      setLoadingSettings(false);
    }
  };

  useEffect(() => {
    void loadSettingsData();
  }, []);

  useEffect(() => {
    const now = new Date(Date.now() + 15 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    const defaultDt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
      now.getDate()
    )}T${pad(now.getHours())}:${pad(now.getMinutes())}`;

    if (prefillTask) {
      setRemTitle(`Lembrete: ${prefillTask.title}`);
      setRemMessage(
        prefillTask.description
          ? `${prefillTask.title}\n${prefillTask.description}`
          : `Não esquecer de concluir: ${prefillTask.title}`
      );
      setRemTaskId(prefillTask.id);
      setRemDateTime(defaultDt);
    } else if (!remDateTime) {
      setRemDateTime(defaultDt);
    }
  }, [prefillTask]);

  const handleCreateReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!remTitle.trim() || !remDateTime) {
      onNotifyToast("Preencha o título e a data/hora do lembrete.", "error");
      return;
    }
    setSavingRem(true);
    try {
      await api.createReminder({
        title: remTitle.trim(),
        message: (remMessage || remTitle).trim(),
        remind_at: new Date(remDateTime).toISOString(),
        phone: phoneInput.replace(/\D/g, "") || null,
        recurrence: remRecurrence,
        send_whatsapp: true,
        task_id: remTaskId || null,
      });
      setRemTitle("");
      setRemMessage("");
      setRemTaskId("");
      onClearPrefillTask();
      await onRefreshReminders();
      await loadSettingsData();
      onNotifyToast("Aviso agendado com disparo automático no WhatsApp!");
    } catch (err) {
      onNotifyToast(
        err instanceof Error ? err.message : "Erro ao agendar aviso.",
        "error"
      );
    } finally {
      setSavingRem(false);
    }
  };

  const handleSendInstantReminder = async () => {
    if (!remTitle.trim()) {
      onNotifyToast("Digite o título/mensagem para enviar agora.", "error");
      return;
    }
    setSavingRem(true);
    try {
      const text = `🔔 *Aviso — Demanda do Gustavo*\n\n*${remTitle.trim()}*${
        remMessage.trim() ? `\n${remMessage.trim()}` : ""
      }`;
      await api.sendWhatsApp({
        action: "text",
        kind: "manual_reminder",
        number: phoneInput,
        text,
      });
      setRemTitle("");
      setRemMessage("");
      await loadSettingsData();
      onNotifyToast("Mensagem enviada agora mesmo para seu WhatsApp!");
    } catch (err) {
      onNotifyToast(
        err instanceof Error ? err.message : "Falha ao enviar no WhatsApp.",
        "error"
      );
    } finally {
      setSavingRem(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      await api.updateSettings({
        default_phone: phoneInput.replace(/\D/g, ""),
        daily_summary_time: summaryTimeInput,
        daily_summary_enabled: summaryEnabledInput,
      });
      await loadSettingsData();
      onNotifyToast("Configurações do WhatsApp salvas com sucesso!");
    } catch (err) {
      onNotifyToast(
        err instanceof Error ? err.message : "Erro ao salvar configurações.",
        "error"
      );
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSendSummaryNow = async () => {
    setSendingSummary(true);
    try {
      await api.sendWhatsApp({
        action: "daily_summary",
        number: phoneInput,
      });
      await loadSettingsData();
      onNotifyToast("Resumo do dia enviado para seu WhatsApp!");
    } catch (err) {
      onNotifyToast(
        err instanceof Error ? err.message : "Erro ao enviar resumo.",
        "error"
      );
    } finally {
      setSendingSummary(false);
    }
  };

  const handleSendTest = async () => {
    setTestingMsg(true);
    try {
      await api.sendWhatsApp({
        action: "text",
        kind: "test",
        number: phoneInput,
        text: "✅ *Demanda do Gustavo*\nConexão com sua API de Disparo (`gusta-teste`) ativa e funcionando perfeitamente!",
      });
      await loadSettingsData();
      onNotifyToast("Mensagem de teste enviada no WhatsApp!");
    } catch (err) {
      onNotifyToast(
        err instanceof Error ? err.message : "Erro no teste de WhatsApp.",
        "error"
      );
    } finally {
      setTestingMsg(false);
    }
  };

  const handleCheckPhone = async () => {
    setCheckingPhone(true);
    try {
      const res = await api.sendWhatsApp({
        action: "check",
        number: phoneInput,
      });
      onNotifyToast(
        `Verificação concluída na instância gusta-teste (${res.status})!`
      );
    } catch (err) {
      onNotifyToast(
        err instanceof Error ? err.message : "Erro ao verificar número.",
        "error"
      );
    } finally {
      setCheckingPhone(false);
    }
  };

  const handleDeleteReminder = async (id: string) => {
    try {
      await api.deleteReminder(id);
      await onRefreshReminders();
      onNotifyToast("Aviso removido.");
    } catch (err) {
      onNotifyToast(
        err instanceof Error ? err.message : "Erro ao excluir aviso.",
        "error"
      );
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      {/* LEFT: Create Reminder + Scheduled Reminders */}
      <div className="lg:col-span-7 space-y-5">
        <div className="rounded-2xl bg-white p-5 border border-sky-100 shadow-card">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500 text-white">
              <BellPlus className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
                Criar Aviso / Lembrete no WhatsApp
              </h2>
              <p className="text-xs text-slate-500">
                A API envia mensagem automaticamente no horário programado mesmo com o app fechado
              </p>
            </div>
          </div>

          <form onSubmit={handleCreateReminder} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Título do aviso
              </label>
              <input
                id="reminder-title-input"
                type="text"
                value={remTitle}
                onChange={(e) => setRemTitle(e.target.value)}
                placeholder="Ex.: Cobrar fechamento da conferência quinzenal"
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Mensagem que chegará no WhatsApp (opcional)
              </label>
              <textarea
                id="reminder-message-input"
                rows={2}
                value={remMessage}
                onChange={(e) => setRemMessage(e.target.value)}
                placeholder="Detalhes extras que vão aparecer na mensagem..."
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Data e Horário do Disparo
                </label>
                <input
                  id="reminder-datetime-input"
                  type="datetime-local"
                  value={remDateTime}
                  onChange={(e) => setRemDateTime(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs sm:text-sm font-mono text-slate-800 focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Repetição do Lembrete
                </label>
                <select
                  value={remRecurrence}
                  onChange={(e) =>
                    setRemRecurrence(
                      e.target.value as "none" | "daily" | "weekly"
                    )
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-sky-500 focus:outline-none"
                >
                  <option value="none">Apenas uma vez</option>
                  <option value="daily">Repetir todos os dias</option>
                  <option value="weekly">Repetir toda semana</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Vincular a uma demanda existente (opcional)
              </label>
              <select
                value={remTaskId}
                onChange={(e) => setRemTaskId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs sm:text-sm text-slate-800 focus:border-sky-500 focus:outline-none"
              >
                <option value="">Sem vínculo específico</option>
                {tasks
                  .filter((t) => !t.completed)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
              <button
                id="btn-send-instant-whatsapp"
                type="button"
                disabled={savingRem}
                onClick={handleSendInstantReminder}
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition-colors"
              >
                <Send className="h-3.5 w-3.5" />
                Enviar Agora no WhatsApp
              </button>
              <button
                id="btn-schedule-reminder"
                type="submit"
                disabled={savingRem}
                className="inline-flex items-center gap-1.5 rounded-xl bg-sky-500 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-sky-600 transition-colors"
              >
                <Clock className="h-3.5 w-3.5" />
                Agendar Lembrete
              </button>
            </div>
          </form>
        </div>

        {/* Scheduled Reminders List */}
        <div className="rounded-2xl bg-white p-5 border border-slate-200/85 shadow-card space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-slate-900">
              Meus Avisos & Lembretes ({reminders.length})
            </h3>
            <button
              type="button"
              onClick={() => void onRefreshReminders()}
              className="inline-flex items-center gap-1 text-xs font-semibold text-sky-600 hover:text-sky-700"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Atualizar
            </button>
          </div>

          {reminders.length === 0 ? (
            <p className="rounded-xl bg-slate-50 p-4 text-center text-xs text-slate-500">
              Nenhum aviso agendado no momento. Crie um acima para receber no seu WhatsApp!
            </p>
          ) : (
            <div className="space-y-2.5">
              {reminders.map((r) => {
                const dtFormatted = new Intl.DateTimeFormat("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(new Date(r.remind_at));
                return (
                  <div
                    key={r.id}
                    className={`flex items-start justify-between gap-3 rounded-xl border p-3 ${
                      r.sent
                        ? "bg-emerald-50/50 border-emerald-200/80"
                        : "bg-sky-50/40 border-sky-200/80"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            r.sent
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-sky-100 text-sky-800"
                          }`}
                        >
                          {r.sent ? "Enviado no WhatsApp" : `Agendado • ${dtFormatted}`}
                        </span>
                        {r.recurrence !== "none" && (
                          <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 border border-slate-200">
                            {r.recurrence === "daily" ? "Diário" : "Semanal"}
                          </span>
                        )}
                      </div>
                      <p className="text-xs sm:text-sm font-bold text-slate-900">
                        {r.title}
                      </p>
                      {r.message && r.message !== r.title && (
                        <p className="text-xs text-slate-600 mt-0.5">
                          {r.message}
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleDeleteReminder(r.id)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                      title="Remover aviso"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT: Daily Summary Preview + WhatsApp Settings + Logs */}
      <div className="lg:col-span-5 space-y-5">
        {/* End-of-Day Summary Card */}
        <div className="rounded-2xl bg-white p-5 border border-sky-100 shadow-card space-y-3.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-emerald-600" />
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">
                  Resumo do Fim do Dia no WhatsApp
                </h3>
                <p className="text-[11px] text-slate-500">
                  Prévia ao vivo do que será enviado com feitas e pendentes
                </p>
              </div>
            </div>
          </div>

          <pre className="whitespace-pre-wrap rounded-xl bg-[#ECFDF5] border border-emerald-200 p-3.5 font-sans text-xs leading-relaxed text-slate-800 max-h-72 overflow-y-auto">
            {loadingSettings
              ? "Montando prévia do resumo..."
              : summaryPreview || "Sem dados no momento."}
          </pre>

          <button
            id="btn-send-daily-summary-now"
            type="button"
            disabled={sendingSummary}
            onClick={handleSendSummaryNow}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60 transition-colors"
          >
            <Send className="h-4 w-4" />
            {sendingSummary
              ? "Enviando resumo no WhatsApp..."
              : "Enviar Resumo do Dia Agora no meu WhatsApp"}
          </button>
        </div>

        {/* Settings Card */}
        <div className="rounded-2xl bg-white p-5 border border-slate-200/85 shadow-card space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-sky-600" />
              <h3 className="text-sm font-extrabold text-slate-900">
                Configuração da API (gusta-teste)
              </h3>
            </div>
            {settings?.has_api_key && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                <ShieldCheck className="h-3 w-3" />
                API Conectada
              </span>
            )}
          </div>

          <form onSubmit={handleSaveSettings} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Meu Número de WhatsApp (com DDI 55 + DDD)
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="whatsapp-phone-input"
                  type="text"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  placeholder="556293885258"
                  className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono text-slate-900 focus:border-sky-500 focus:outline-none"
                />
                <button
                  type="button"
                  disabled={checkingPhone}
                  onClick={handleCheckPhone}
                  className="shrink-0 inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-sky-50 transition-colors"
                  title="Verificar número na API"
                >
                  <PhoneCall className="h-3.5 w-3.5 text-sky-600" />
                  Verificar
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 items-end">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Horário do Resumo Diário
                </label>
                <input
                  id="summary-time-input"
                  type="time"
                  value={summaryTimeInput}
                  onChange={(e) => setSummaryTimeInput(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono text-slate-900 focus:border-sky-500 focus:outline-none"
                />
              </div>

              <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={summaryEnabledInput}
                  onChange={(e) => setSummaryEnabledInput(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-sky-600"
                />
                <span className="text-xs font-semibold text-slate-700">
                  Envio diário ativo
                </span>
              </label>
            </div>

            <div className="rounded-xl bg-slate-50 p-2.5 text-[11px] text-slate-500 space-y-0.5">
              <div>
                Instância: <strong className="text-slate-700">{settings?.whatsapp_instance || "gusta-teste"}</strong>
              </div>
              <div>
                Token: <span className="font-mono">{settings?.masked_api_key || "Configurado"}</span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                id="btn-test-whatsapp"
                type="button"
                disabled={testingMsg}
                onClick={handleSendTest}
                className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-800 hover:bg-sky-100 transition-colors"
              >
                {testingMsg ? "Testando..." : "Testar Mensagem"}
              </button>

              <button
                id="btn-save-whatsapp-settings"
                type="submit"
                disabled={savingSettings}
                className="inline-flex items-center gap-1.5 rounded-xl bg-sky-500 px-4 py-2 text-xs font-bold text-white hover:bg-sky-600 transition-colors"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {savingSettings ? "Salvando..." : "Salvar Horário & Número"}
              </button>
            </div>
          </form>

          {/* Recent Logs */}
          {logs.length > 0 && (
            <div className="pt-3 border-t border-slate-100 space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Últimos Disparos ({logs.length})
              </h4>
              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px]"
                  >
                    <span className="truncate text-slate-700 font-medium">
                      {log.message_preview.replace(/\n/g, " ")}
                    </span>
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 font-bold ${
                        log.status === "error"
                          ? "bg-red-100 text-red-700"
                          : "bg-emerald-100 text-emerald-800"
                      }`}
                    >
                      {log.status === "error" ? "Erro" : "OK"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
