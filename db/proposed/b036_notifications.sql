-- b036 — Sistema de notificaciones: feed in-app + suscripciones Web Push.
-- Espejo de la migración aplicada `b036_notifications`.
--
-- Dos tablas nuevas, cero cambios a objetos existentes:
--  · ketzal.notifications — feed por usuario (campana en el header del OS).
--    ESCRITURA solo del servidor (service_role): sin policy de INSERT para
--    authenticated ⇒ nadie se inyecta notificaciones. El usuario solo LEE las
--    suyas y las marca leídas (update de su propia fila).
--  · ketzal.push_subscriptions — endpoints Web Push del navegador/dispositivo
--    (PWA instalada ⇒ notifica aunque la app esté cerrada). El dueño inserta/
--    borra las suyas; el servidor (service_role) las lee para enviar.
-- El envío usa VAPID (web-push) desde el server; llaves en env
-- (NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT).

create table if not exists ketzal.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references ketzal.profiles(id) on delete cascade,
  title text not null,
  body text,
  url text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx
  on ketzal.notifications (user_id, created_at desc);

alter table ketzal.notifications enable row level security;

drop policy if exists notifications_sel_own on ketzal.notifications;
create policy notifications_sel_own on ketzal.notifications
  for select to authenticated using (user_id = auth.uid());

-- Marcar leída: update solo de la propia fila (título/cuerpo son del propio
-- usuario; editarlos no cruza ningún límite de confianza).
drop policy if exists notifications_upd_own on ketzal.notifications;
create policy notifications_upd_own on ketzal.notifications
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Sin policy de INSERT/DELETE para authenticated: escribir es del servidor.
revoke insert, delete on ketzal.notifications from authenticated;
grant select, update on ketzal.notifications to authenticated;

create table if not exists ketzal.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references ketzal.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on ketzal.push_subscriptions (user_id);

alter table ketzal.push_subscriptions enable row level security;

drop policy if exists push_subs_sel_own on ketzal.push_subscriptions;
create policy push_subs_sel_own on ketzal.push_subscriptions
  for select to authenticated using (user_id = auth.uid());

drop policy if exists push_subs_ins_own on ketzal.push_subscriptions;
create policy push_subs_ins_own on ketzal.push_subscriptions
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists push_subs_del_own on ketzal.push_subscriptions;
create policy push_subs_del_own on ketzal.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());

grant select, insert, delete on ketzal.push_subscriptions to authenticated;
