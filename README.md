# Demanda do Gustavo

Aplicativo Web e **PWA responsivo** (estilo Lovable: **React + Vite + TypeScript + Tailwind CSS v3 + Supabase + Vercel**) para controle de demandas diárias, conferências periódicas (**semanais, quinzenais e mensais**) e avisos automáticos via **WhatsApp** (`gusta-teste`).

## Principais Funcionalidades

- **Visão Hoje + Ontem (Menor)**: acompanhe em destaque o dia atual e, ao lado, um resumo compacto do dia anterior.
- **Virada Automática à Meia-Noite**: tarefas não concluídas até `00:00` (Horário de Brasília) avançam automaticamente para o dia seguinte marcadas em **vermelho (Atrasada)**.
- **Código de Cores Claro**:
  - 🟢 **Verde**: Tarefa feita / concluída
  - 🔵 **Azul**: Tarefa pendente dentro do dia
  - 🔴 **Vermelha**: Tarefa atrasada (vinda de dias anteriores)
- **Agenda por Dia (estilo Google Agenda)**: navegue pelos dias (`Ontem`, `Hoje`, próximos dias ou calendário), visualize por horário e marque tarefas diretamente na linha do tempo.
- **Demandas Extras de Conferência**: modo exclusivo de criação e filtro para entregas **Semanal**, **Quinzenal** e **Mensal**, com geração automática do próximo ciclo ao concluir.
- **Integração WhatsApp (`send-whatsapp` + `pg_cron` 24/7)**:
  - Resumo automático do fim do dia (padrão `19:00` Brasília para `556293885258`, editável no app).
  - Criação de avisos e lembretes com disparo automático no WhatsApp.
  - Suporte completo aos 6 endpoints da API de Disparo — Gustavo Gomes.

---

## Como Hospedar na Vercel

1. Importe este repositório (`gustavogomes000/time`) na **Vercel**.
2. Em **Settings → Environment Variables**, adicione:
   - `DATABASE_URL` = URL do **Session Pooler IPv4** do seu projeto Supabase (`postgresql://postgres.tohrjosfglfnkmnzehzj:<SUA_SENHA>@aws-1-us-west-2.pooler.supabase.com:5432/postgres`)
   - `WHATSAPP_API_URL` = `http://189.24.0.59:3000`
   - `WHATSAPP_API_KEY` = `<SUA_CHAVE_API_WHATSAPP>`
   - `WHATSAPP_INSTANCE` = `gusta-teste`
3. Clique em **Deploy**.

---

## Supabase Edge Function (`send-whatsapp`)

A Edge Function está pronta em [`supabase/functions/send-whatsapp/index.ts`](./supabase/functions/send-whatsapp/index.ts). Caso deseje publicá-la também diretamente no runtime de Edge Functions do Supabase:

```bash
npx supabase login
npx supabase link --project-ref tohrjosfglfnkmnzehzj

npx supabase secrets set \
  WHATSAPP_API_URL="http://189.24.0.59:3000" \
  WHATSAPP_API_KEY="<SUA_CHAVE_API_WHATSAPP>" \
  WHATSAPP_INSTANCE="gusta-teste"

npx supabase functions deploy send-whatsapp --no-verify-jwt
```
