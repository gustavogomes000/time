-- ============================================================================
-- Demanda do Gustavo — Supabase Schema, Rollover Engine & pg_cron WhatsApp Bot
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 1. Tasks (Demandas Diárias + Conferências Semanais / Quinzenais / Mensais)
CREATE TABLE IF NOT EXISTS public.gustavo_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'daily' CHECK (category IN ('daily', 'conference')),
  recurrence TEXT NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none', 'weekly', 'biweekly', 'monthly')),
  auto_recreate BOOLEAN NOT NULL DEFAULT true,
  next_generated BOOLEAN NOT NULL DEFAULT false,
  parent_task_id UUID REFERENCES public.gustavo_tasks(id) ON DELETE SET NULL,
  original_date DATE NOT NULL,
  scheduled_date DATE NOT NULL,
  scheduled_time TEXT DEFAULT NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ DEFAULT NULL,
  completed_date DATE DEFAULT NULL,
  rollover_count INTEGER NOT NULL DEFAULT 0,
  remind_whatsapp BOOLEAN NOT NULL DEFAULT false,
  remind_at TIMESTAMPTZ DEFAULT NULL,
  remind_sent BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gustavo_tasks_scheduled_date ON public.gustavo_tasks(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_gustavo_tasks_original_date ON public.gustavo_tasks(original_date);
CREATE INDEX IF NOT EXISTS idx_gustavo_tasks_completed_date ON public.gustavo_tasks(completed_date);
CREATE INDEX IF NOT EXISTS idx_gustavo_tasks_category_recurrence ON public.gustavo_tasks(category, recurrence);

-- 2. Standalone Reminders / Avisos (App + WhatsApp)
CREATE TABLE IF NOT EXISTS public.gustavo_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  remind_at TIMESTAMPTZ NOT NULL,
  phone TEXT DEFAULT NULL,
  recurrence TEXT NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none', 'daily', 'weekly')),
  send_whatsapp BOOLEAN NOT NULL DEFAULT true,
  in_app_dismissed BOOLEAN NOT NULL DEFAULT false,
  sent BOOLEAN NOT NULL DEFAULT false,
  sent_at TIMESTAMPTZ DEFAULT NULL,
  last_error TEXT DEFAULT NULL,
  task_id UUID REFERENCES public.gustavo_tasks(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gustavo_reminders_due ON public.gustavo_reminders(sent, remind_at);

-- 3. App & WhatsApp Settings (Singleton Row id = 1)
CREATE TABLE IF NOT EXISTS public.gustavo_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  default_phone TEXT NOT NULL DEFAULT '556293885258',
  daily_summary_enabled BOOLEAN NOT NULL DEFAULT true,
  daily_summary_time TEXT NOT NULL DEFAULT '19:00',
  last_summary_sent_date DATE DEFAULT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  whatsapp_api_url TEXT NOT NULL DEFAULT 'http://189.24.0.59:3000',
  whatsapp_api_key TEXT DEFAULT NULL,
  whatsapp_instance TEXT NOT NULL DEFAULT 'gusta-teste',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.gustavo_settings (id, default_phone, daily_summary_enabled, daily_summary_time, timezone, whatsapp_api_url, whatsapp_instance)
VALUES (1, '556293885258', true, '19:00', 'America/Sao_Paulo', 'http://189.24.0.59:3000', 'gusta-teste')
ON CONFLICT (id) DO NOTHING;

-- 4. WhatsApp Dispatch History Logs
CREATE TABLE IF NOT EXISTS public.gustavo_whatsapp_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL DEFAULT 'manual',
  phone TEXT NOT NULL,
  message_preview TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  response_body TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gustavo_whatsapp_logs_created ON public.gustavo_whatsapp_logs(created_at DESC);

-- Enable RLS so unauthenticated PostgREST requests cannot read API keys or mutate data
ALTER TABLE public.gustavo_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gustavo_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gustavo_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gustavo_whatsapp_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Automatic Midnight Rollover Function (America/Sao_Paulo)
-- Moves any unfinished task from previous days to TODAY and increments rollover_count
-- ============================================================================
CREATE OR REPLACE FUNCTION public.gustavo_rollover_tasks()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tz TEXT;
  v_today DATE;
  v_updated INTEGER := 0;
BEGIN
  SELECT COALESCE(timezone, 'America/Sao_Paulo')
    INTO v_tz
    FROM public.gustavo_settings
   WHERE id = 1;

  v_today := (now() AT TIME ZONE COALESCE(v_tz, 'America/Sao_Paulo'))::date;

  UPDATE public.gustavo_tasks
     SET scheduled_date = v_today,
         rollover_count = GREATEST(1, (v_today - original_date)),
         updated_at = now()
   WHERE completed = false
     AND scheduled_date < v_today;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

-- ============================================================================
-- Build Formatted Daily WhatsApp Summary Text
-- ============================================================================
CREATE OR REPLACE FUNCTION public.gustavo_build_daily_summary(p_date DATE DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tz TEXT;
  v_date DATE;
  v_done_list TEXT := '';
  v_overdue_list TEXT := '';
  v_pending_list TEXT := '';
  v_conf_list TEXT := '';
  v_done_count INTEGER := 0;
  v_overdue_count INTEGER := 0;
  v_pending_count INTEGER := 0;
  v_conf_count INTEGER := 0;
  rec RECORD;
  v_rec_label TEXT;
BEGIN
  SELECT COALESCE(timezone, 'America/Sao_Paulo')
    INTO v_tz
    FROM public.gustavo_settings
   WHERE id = 1;

  v_date := COALESCE(p_date, (now() AT TIME ZONE COALESCE(v_tz, 'America/Sao_Paulo'))::date);

  -- Ensure overdue tasks are rolled over first if summarizing today
  IF v_date = (now() AT TIME ZONE COALESCE(v_tz, 'America/Sao_Paulo'))::date THEN
    PERFORM public.gustavo_rollover_tasks();
  END IF;

  -- 1. Completed on v_date
  FOR rec IN
    SELECT title, category, recurrence
      FROM public.gustavo_tasks
     WHERE completed = true
       AND (completed_date = v_date OR (completed_date IS NULL AND scheduled_date = v_date))
     ORDER BY completed_at ASC NULLS LAST, created_at ASC
  LOOP
    v_done_count := v_done_count + 1;
    v_done_list := v_done_list || '  • ' || rec.title || E'\n';
  END LOOP;

  -- 2. Overdue uncompleted on v_date (came from earlier days)
  FOR rec IN
    SELECT title, original_date, category, recurrence
      FROM public.gustavo_tasks
     WHERE completed = false
       AND scheduled_date = v_date
       AND original_date < v_date
     ORDER BY original_date ASC, priority DESC, created_at ASC
  LOOP
    v_overdue_count := v_overdue_count + 1;
    v_overdue_list := v_overdue_list || '  • ' || rec.title || ' _(desde ' || to_char(rec.original_date, 'DD/MM') || ')_' || E'\n';
  END LOOP;

  -- 3. Pending created for v_date
  FOR rec IN
    SELECT title, scheduled_time, category, recurrence
      FROM public.gustavo_tasks
     WHERE completed = false
       AND scheduled_date = v_date
       AND original_date = v_date
     ORDER BY scheduled_time ASC NULLS LAST, created_at ASC
  LOOP
    v_pending_count := v_pending_count + 1;
    v_pending_list := v_pending_list || '  • ' ||
      CASE WHEN rec.scheduled_time IS NOT NULL AND rec.scheduled_time <> '' THEN '[' || rec.scheduled_time || '] ' ELSE '' END ||
      rec.title || E'\n';
  END LOOP;

  -- 4. Active Conference Demands due today or within next 3 days
  FOR rec IN
    SELECT title, recurrence, scheduled_date
      FROM public.gustavo_tasks
     WHERE completed = false
       AND category = 'conference'
       AND scheduled_date <= (v_date + 3)
     ORDER BY scheduled_date ASC
  LOOP
    v_conf_count := v_conf_count + 1;
    v_rec_label := CASE rec.recurrence
      WHEN 'weekly' THEN 'Semanal'
      WHEN 'biweekly' THEN 'Quinzenal'
      WHEN 'monthly' THEN 'Mensal'
      ELSE 'Conferência'
    END;
    v_conf_list := v_conf_list || '  • [' || v_rec_label || '] ' || rec.title || ' _(' || to_char(rec.scheduled_date, 'DD/MM') || ')_' || E'\n';
  END LOOP;

  RETURN
    '📊 *Demanda do Gustavo — Resumo (' || to_char(v_date, 'DD/MM/YYYY') || ')*' || E'\n\n' ||
    '🟢 *Feitas no dia (' || v_done_count || '):*' || E'\n' ||
    CASE WHEN v_done_count > 0 THEN v_done_list ELSE E'  _Nenhuma tarefa concluída hoje._\n' END || E'\n' ||
    '🔵 *Pendentes do dia (' || v_pending_count || '):*' || E'\n' ||
    CASE WHEN v_pending_count > 0 THEN v_pending_list ELSE E'  _Tudo em dia!_\n' END || E'\n' ||
    '🔴 *Atrasadas acumuladas (' || v_overdue_count || '):*' || E'\n' ||
    CASE WHEN v_overdue_count > 0 THEN v_overdue_list ELSE E'  _Zero tarefas atrasadas!_\n' END ||
    CASE WHEN v_conf_count > 0 THEN E'\n📋 *Conferências próximas/pendentes (' || v_conf_count || '):*\n' || v_conf_list ELSE '' END ||
    E'\n_Obs.: O que ficar pendente até meia-noite passa automaticamente para amanhã como atrasada._';
END;
$$;

-- ============================================================================
-- Minute-by-Minute Scheduler (pg_cron + pg_net)
-- 1. Rolls over overdue tasks at midnight
-- 2. Dispatches scheduled WhatsApp task reminders & standalone avisos
-- 3. Dispatches automatic End-of-Day WhatsApp summary at configured hour
-- ============================================================================
CREATE OR REPLACE FUNCTION public.gustavo_cron_tick()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cfg public.gustavo_settings%ROWTYPE;
  v_now_local TIMESTAMP;
  v_today DATE;
  v_now_hm TEXT;
  v_rolled INTEGER := 0;
  v_rem_sent INTEGER := 0;
  v_summary_sent BOOLEAN := false;
  v_target_phone TEXT;
  v_msg TEXT;
  v_headers JSONB;
  v_body JSONB;
  v_req_id BIGINT;
  rec RECORD;
  trec RECORD;
BEGIN
  v_rolled := public.gustavo_rollover_tasks();

  SELECT * INTO v_cfg FROM public.gustavo_settings WHERE id = 1;
  IF NOT FOUND OR v_cfg.whatsapp_api_key IS NULL OR v_cfg.whatsapp_api_key = '' THEN
    RETURN jsonb_build_object('rolled_over', v_rolled, 'skipped', 'no_api_key');
  END IF;

  v_now_local := now() AT TIME ZONE COALESCE(v_cfg.timezone, 'America/Sao_Paulo');
  v_today := v_now_local::date;
  v_now_hm := to_char(v_now_local, 'HH24:MI');

  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'X-API-Key', v_cfg.whatsapp_api_key
  );

  -- A. Task-level WhatsApp reminders
  IF v_cfg.default_phone IS NOT NULL AND v_cfg.default_phone <> '' THEN
    FOR trec IN
      SELECT id, title, description, category, recurrence, scheduled_time
        FROM public.gustavo_tasks
       WHERE completed = false
         AND remind_whatsapp = true
         AND remind_sent = false
         AND remind_at IS NOT NULL
         AND remind_at <= now()
       FOR UPDATE SKIP LOCKED
    LOOP
      v_target_phone := regexp_replace(v_cfg.default_phone, '\D', '', 'g');
      v_msg := '⏰ *Lembrete de Tarefa — Demanda do Gustavo*' || E'\n\n' ||
               '📌 *' || trec.title || '*' ||
               CASE WHEN trec.scheduled_time IS NOT NULL AND trec.scheduled_time <> '' THEN E'\n🕒 Horário: ' || trec.scheduled_time ELSE '' END ||
               CASE WHEN trec.description IS NOT NULL AND trec.description <> '' THEN E'\n📝 ' || trec.description ELSE '' END;

      v_body := jsonb_build_object(
        'instance', v_cfg.whatsapp_instance,
        'number', v_target_phone,
        'text', v_msg
      );

      SELECT net.http_post(
        url := rtrim(v_cfg.whatsapp_api_url, '/') || '/v1/messages/text',
        body := v_body,
        params := '{}'::jsonb,
        headers := v_headers,
        timeout_milliseconds := 8000
      ) INTO v_req_id;

      UPDATE public.gustavo_tasks
         SET remind_sent = true, updated_at = now()
       WHERE id = trec.id;

      INSERT INTO public.gustavo_whatsapp_logs (kind, phone, message_preview, status, response_body)
      VALUES ('task_reminder', v_target_phone, left(v_msg, 240), 'queued', 'pg_net req_id=' || COALESCE(v_req_id::text, '0'));

      v_rem_sent := v_rem_sent + 1;
    END LOOP;
  END IF;

  -- B. Standalone Avisos / Lembretes
  FOR rec IN
    SELECT *
      FROM public.gustavo_reminders
     WHERE sent = false
       AND send_whatsapp = true
       AND remind_at <= now()
     FOR UPDATE SKIP LOCKED
  LOOP
    v_target_phone := regexp_replace(COALESCE(NULLIF(rec.phone, ''), v_cfg.default_phone), '\D', '', 'g');
    IF v_target_phone <> '' THEN
      v_msg := '🔔 *Aviso — Demanda do Gustavo*' || E'\n\n' ||
               '*' || rec.title || '*' ||
               CASE WHEN rec.message IS NOT NULL AND rec.message <> '' AND rec.message <> rec.title THEN E'\n' || rec.message ELSE '' END;

      v_body := jsonb_build_object(
        'instance', v_cfg.whatsapp_instance,
        'number', v_target_phone,
        'text', v_msg
      );

      SELECT net.http_post(
        url := rtrim(v_cfg.whatsapp_api_url, '/') || '/v1/messages/text',
        body := v_body,
        params := '{}'::jsonb,
        headers := v_headers,
        timeout_milliseconds := 8000
      ) INTO v_req_id;

      IF rec.recurrence = 'daily' THEN
        UPDATE public.gustavo_reminders
           SET remind_at = remind_at + interval '1 day',
               sent_at = now()
         WHERE id = rec.id;
      ELSIF rec.recurrence = 'weekly' THEN
        UPDATE public.gustavo_reminders
           SET remind_at = remind_at + interval '7 days',
               sent_at = now()
         WHERE id = rec.id;
      ELSE
        UPDATE public.gustavo_reminders
           SET sent = true,
               sent_at = now()
         WHERE id = rec.id;
      END IF;

      INSERT INTO public.gustavo_whatsapp_logs (kind, phone, message_preview, status, response_body)
      VALUES ('reminder', v_target_phone, left(v_msg, 240), 'queued', 'pg_net req_id=' || COALESCE(v_req_id::text, '0'));

      v_rem_sent := v_rem_sent + 1;
    END IF;
  END LOOP;

  -- C. End-of-Day Summary (within 59 min window of daily_summary_time, once per day)
  IF v_cfg.daily_summary_enabled = true
     AND v_cfg.default_phone IS NOT NULL
     AND v_cfg.default_phone <> ''
     AND (v_cfg.last_summary_sent_date IS NULL OR v_cfg.last_summary_sent_date < v_today)
     AND v_now_hm >= v_cfg.daily_summary_time
     AND v_now_hm <= to_char((v_cfg.daily_summary_time::time + interval '59 minutes'), 'HH24:MI')
  THEN
    v_target_phone := regexp_replace(v_cfg.default_phone, '\D', '', 'g');
    v_msg := public.gustavo_build_daily_summary(v_today);

    v_body := jsonb_build_object(
      'instance', v_cfg.whatsapp_instance,
      'number', v_target_phone,
      'text', v_msg
    );

    SELECT net.http_post(
      url := rtrim(v_cfg.whatsapp_api_url, '/') || '/v1/messages/text',
      body := v_body,
      params := '{}'::jsonb,
      headers := v_headers,
      timeout_milliseconds := 8000
    ) INTO v_req_id;

    UPDATE public.gustavo_settings
       SET last_summary_sent_date = v_today,
           updated_at = now()
     WHERE id = 1;

    INSERT INTO public.gustavo_whatsapp_logs (kind, phone, message_preview, status, response_body)
    VALUES ('daily_summary', v_target_phone, left(v_msg, 240), 'queued', 'pg_net req_id=' || COALESCE(v_req_id::text, '0'));

    v_summary_sent := true;
  END IF;

  RETURN jsonb_build_object(
    'rolled_over', v_rolled,
    'reminders_sent', v_rem_sent,
    'summary_sent', v_summary_sent,
    'local_time', v_now_hm
  );
END;
$$;

-- Schedule pg_cron job every minute (idempotent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'gustavo-demandas-every-minute') THEN
    PERFORM cron.unschedule('gustavo-demandas-every-minute');
  END IF;
  PERFORM cron.schedule(
    'gustavo-demandas-every-minute',
    '* * * * *',
    'SELECT public.gustavo_cron_tick();'
  );
END;
$$;
