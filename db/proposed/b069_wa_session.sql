-- b069 — Estado de la sesión de WhatsApp, para pairear el QR desde /ajustes.
--
-- ESPEJO de la migración aplicada `b069_wa_session`.
--
-- El bridge de Baileys corre en una box con PM2, fuera de Vercel y detrás de
-- NAT: la app NO puede llamarlo. Pero el bridge ya tiene cliente de Supabase
-- con service role (lo usa para el opt-out entrante), así que la comunicación
-- va por esta tabla en los dos sentidos:
--
--   box → app :  state, qr, wa_number, last_seen_at   (escribe service_role)
--   app → box :  command ('restart' | 'logout')       (escribe el RPC con guard)
--
-- Sobre el QR: es el payload que autoriza ligar un dispositivo a la cuenta de
-- WhatsApp, así que sólo lo lee el superadmin y rota cada ~20 s por diseño de
-- Baileys. La UI además ignora uno más viejo que un minuto.

create table if not exists ketzal.wa_session (
  -- Fila única: hay un solo número dedicado.
  id smallint primary key default 1 check (id = 1),
  state text not null default 'DESCONOCIDO'
    check (state in ('DESCONOCIDO', 'STARTING', 'UNPAIRED', 'CONNECTED', 'STOPPED')),
  qr text,
  qr_at timestamptz,
  wa_number text,
  -- Latido: sin esto no se distingue "desconectado" de "la box no está prendida",
  -- que es la diferencia entre esperar y ir a prenderla.
  last_seen_at timestamptz,
  command text check (command is null or command in ('restart', 'logout')),
  command_at timestamptz,
  -- Último motivo de cierre, para diagnosticar sin entrar a la box.
  note text,
  updated_at timestamptz not null default now()
);

insert into ketzal.wa_session (id, state) values (1, 'DESCONOCIDO')
on conflict (id) do nothing;

alter table ketzal.wa_session enable row level security;

-- Sólo el superadmin ve el QR y el número: es configuración de plataforma, no
-- de agencia.
drop policy if exists wa_session_sel on ketzal.wa_session;
create policy wa_session_sel on ketzal.wa_session for select to authenticated
using (ketzal.is_superadmin());

-- Escritura: la box con service_role, y los comandos por RPC. Nada directo
-- desde el cliente (un GRANT de tabla + policy sin columnas es escritura
-- arbitraria por PostgREST, la familia de bugs #1 de este repo).
revoke insert, update, delete, truncate on ketzal.wa_session from authenticated, anon;
grant select on ketzal.wa_session to authenticated;

-- ── Comando de la app a la box ───────────────────────────────────────
create or replace function ketzal.wa_send_command(p_command text)
returns void language plpgsql security definer
set search_path to 'ketzal', 'pg_temp' as $$
begin
  if not ketzal.is_superadmin() then
    raise exception 'Solo el superadmin puede operar la sesión de WhatsApp.';
  end if;
  if p_command is not null and p_command not in ('restart', 'logout') then
    raise exception 'Comando no reconocido.';
  end if;

  update ketzal.wa_session
     set command = p_command,
         command_at = case when p_command is null then null else now() end,
         -- Un QR viejo no debe quedar en pantalla mientras la box reinicia.
         qr = case when p_command is null then qr else null end,
         qr_at = case when p_command is null then qr_at else null end,
         updated_at = now()
   where id = 1;
end $$;

revoke all on function ketzal.wa_send_command(text) from public, anon;
grant execute on function ketzal.wa_send_command(text) to authenticated, service_role;

-- ── Hard-test aplicado en vivo (rollback vía RAISE) ──────────────────
-- privilegios: service_role ins/upd = t · authenticated ins/upd = f · anon sel = f
-- superadmin ve 1 fila · admin de agencia ve 0
-- admin de agencia mandando comando .......... bloqueado
-- superadmin manda 'restart' .................. ok, y borra el QR viejo
-- comando inventado ('rm -rf') ................ rechazado
-- Residuo tras el rollback: la fila única en DESCONOCIDO, sin QR.
--
-- Ojo con el `set local role authenticated` al probar RLS: como `postgres` es
-- dueño de la tabla, sin cambiar de rol la RLS no aplica y el chequeo sale
-- falso positivo.
