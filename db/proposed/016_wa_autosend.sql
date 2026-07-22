-- 016 — Auto-envío de recordatorios por WhatsApp (worker en la box).
--
-- El cron diario ya llena ketzal.clawbot_reminders (status 'pendiente', phone,
-- message). Un worker Baileys en la box (fuera de Vercel) los envía por WhatsApp
-- y marca el resultado. Aquí va lo que vive en la BD:
--
-- • app_settings + wa_auto_enabled (gate, default false) + wa_daily_cap (tope 24h).
-- • wa_optout: lista de opt-out (STOP/BAJA) que el poller respeta.
-- • clawbot_claim_pendientes(limit): claim ATÓMICO (FOR UPDATE SKIP LOCKED) de
--   pendientes → 'enviando', SOLO kinds dirigidos al comprador (evita disparar
--   kinds operativos a los clientes). Idempotencia dura del outbox: dedupe_key.
-- • clawbot_marcar_bot(id, status): marca 'enviado'/'error'/'pendiente' sin
--   auth.uid() (lo llama el bot con service role).
-- • status admite 'enviando' y 'error' (claim + fallo).
--
-- Espejo del DDL vivo; la fuente es la BD (apply_migration). [[persona]] viajero.

alter table ketzal.app_settings
  add column if not exists wa_auto_enabled boolean not null default false,
  add column if not exists wa_daily_cap integer not null default 30;

create table if not exists ketzal.wa_optout (
  phone      text primary key,           -- 10 dígitos locales normalizados
  reason     text,
  created_at timestamptz not null default now()
);
alter table ketzal.wa_optout enable row level security;
drop policy if exists wa_optout_admin on ketzal.wa_optout;
create policy wa_optout_admin on ketzal.wa_optout for all
  using (ketzal.is_superadmin()) with check (ketzal.is_superadmin());
grant select, insert, delete on ketzal.wa_optout to authenticated;

-- status: + 'enviando' (claim) y 'error' (fallo de envío).
alter table ketzal.clawbot_reminders drop constraint if exists clawbot_reminders_status_check;
alter table ketzal.clawbot_reminders add constraint clawbot_reminders_status_check
  check (status = any (array['pendiente','enviando','enviado','error','descartado']));

create or replace function ketzal.clawbot_claim_pendientes(p_limit int default 20)
  returns table(id uuid, phone text, message text, kind text)
  language plpgsql security definer
  set search_path to 'ketzal', 'pg_temp'
as $$
begin
  return query
  update ketzal.clawbot_reminders r
     set status = 'enviando'
   where r.id in (
     select r2.id from ketzal.clawbot_reminders r2
      where r2.status = 'pendiente'
        and r2.phone is not null and btrim(r2.phone) <> ''
        and r2.kind in ('abono_por_vencer','abono_vencido','viaje_proximo','cotizacion_seguimiento')
      order by r2.created_at
      for update skip locked
      limit greatest(1, p_limit)
   )
  returning r.id, r.phone, r.message, r.kind;
end $$;
revoke all on function ketzal.clawbot_claim_pendientes(int) from public, anon, authenticated;
grant execute on function ketzal.clawbot_claim_pendientes(int) to service_role;

create or replace function ketzal.clawbot_marcar_bot(p_id uuid, p_status text)
  returns void
  language plpgsql security definer
  set search_path to 'ketzal', 'pg_temp'
as $$
begin
  if p_status not in ('enviado','error','pendiente','descartado') then
    raise exception 'status inválido: %', p_status;
  end if;
  update ketzal.clawbot_reminders
     set status  = p_status,
         channel = case when p_status = 'enviado' then 'whatsapp' else channel end,
         sent_at = case when p_status = 'enviado' then now() else sent_at end
   where id = p_id;
end $$;
revoke all on function ketzal.clawbot_marcar_bot(uuid, text) from public, anon, authenticated;
grant execute on function ketzal.clawbot_marcar_bot(uuid, text) to service_role;
