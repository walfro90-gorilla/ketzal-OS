-- m005 · Embajadores operables: tarifa por agencia, dueño del embajador y
--        onboarding por usuario
--
-- Por qué existe:
-- El flujo de embajadores estaba construido pero NUNCA se había ejercido. Los
-- números de la BD antes de esta migración: 0 embajadores, 0 códigos de
-- referido, 0 ventas atribuidas y — lo que bloqueaba todo — **0 reglas de
-- comisión con payee_type='embajador'**. Es decir: si se reclutaba a alguien y
-- traía una venta, el motor no le asignaba nada. Cobraba cero.
--
-- Walfre quiere reclutar embajadores de verdad, así que hacen falta tres cosas:
--
-- (1) Que el admin de agencia pueda fijar la tarifa de SUS embajadores. b019
--     dejó las reglas de embajador como superadmin-only bajo el supuesto
--     "Ketzal paga al embajador". Ese supuesto ya no aplica: si Wanderlust
--     recluta a su embajador, Wanderlust le paga. Sin esto el admin puede
--     reclutar pero no definir cuánto paga, y el embajador vuelve a cobrar cero.
--
-- (2) Saber de quién es cada embajador. `crearEmbajador` nunca escribió
--     `supplier_id` en el profile, así que un embajador no pertenecía a ninguna
--     agencia — y sin eso, "los embajadores de mi agencia" no se puede consultar
--     ni acotar por RLS. El scope de la regla va por `scope_profile_id` (así lo
--     exige `commission_rules_scope_chk`), de modo que la agencia se resuelve
--     mirando el profile del embajador.
--
-- (3) Recordar quién ya vio el tour. Hoy vive en localStorage, o sea por
--     dispositivo: reaparece en cada navegador y no se sabe quién ya lo pasó.
--
-- Nota de convivencia: `commission_rules` la comparte el carril de comisiones
-- (b076/b077 recién aplicados). Las policies de abajo se reescriben desde el
-- DDL vivo conservando la rama 'agencia' tal cual estaba — solo se AGREGA la
-- rama de embajador.

-- 1) Guard: ¿soy admin de la agencia dueña de este embajador? ───────────────
-- DEFINER porque lee `profiles` de otro usuario, que la RLS no expone. Se usa
-- dentro de policies, así que necesita GRANT EXECUTE explícito (lección de b063:
-- sin el grant, el INSERT legítimo muere con "permission denied for function").
create or replace function ketzal.is_admin_de_embajador(p_profile uuid)
returns boolean
language sql stable security definer
set search_path to 'ketzal', 'pg_temp'
as $$
  select coalesce(
    (select ketzal.is_agency_admin(p.supplier_id)
       from ketzal.profiles p
      where p.id = p_profile
        and p.type = 'embajador'
        and p.supplier_id is not null),
    false)
$$;

revoke all on function ketzal.is_admin_de_embajador(uuid) from public, anon;
grant execute on function ketzal.is_admin_de_embajador(uuid) to authenticated, service_role;

-- 2) commission_rules: el admin gobierna las reglas de sus embajadores ──────
-- La rama 'agencia' se conserva IDÉNTICA al DDL vivo; solo se suma la rama
-- 'embajador' acotada por `is_admin_de_embajador`.
drop policy if exists commission_rules_sel on ketzal.commission_rules;
create policy commission_rules_sel on ketzal.commission_rules for select
  using (
    ketzal.is_superadmin()
    or (payee_type = 'agencia' and scope_supplier_id = ketzal.my_supplier_id())
    or (payee_type = 'embajador'
        and coalesce(ketzal.is_admin_de_embajador(scope_profile_id), false))
  );

drop policy if exists commission_rules_ins on ketzal.commission_rules;
create policy commission_rules_ins on ketzal.commission_rules for insert
  with check (
    ketzal.is_superadmin()
    or (payee_type = 'agencia' and scope_supplier_id = ketzal.my_supplier_id()
        and ketzal.is_active())
    or (payee_type = 'embajador'
        and coalesce(ketzal.is_admin_de_embajador(scope_profile_id), false)
        and ketzal.is_active())
  );

drop policy if exists commission_rules_upd on ketzal.commission_rules;
create policy commission_rules_upd on ketzal.commission_rules for update
  using (
    ketzal.is_superadmin()
    or (payee_type = 'agencia' and scope_supplier_id = ketzal.my_supplier_id())
    or (payee_type = 'embajador'
        and coalesce(ketzal.is_admin_de_embajador(scope_profile_id), false))
  )
  with check (
    ketzal.is_superadmin()
    or (payee_type = 'agencia' and scope_supplier_id = ketzal.my_supplier_id())
    or (payee_type = 'embajador'
        and coalesce(ketzal.is_admin_de_embajador(scope_profile_id), false))
  );

drop policy if exists commission_rules_del on ketzal.commission_rules;
create policy commission_rules_del on ketzal.commission_rules for delete
  using (
    ketzal.is_superadmin()
    or (payee_type = 'agencia' and scope_supplier_id = ketzal.my_supplier_id())
    or (payee_type = 'embajador'
        and coalesce(ketzal.is_admin_de_embajador(scope_profile_id), false))
  );

-- 3) El admin ve a los embajadores de su agencia ────────────────────────────
-- Sin esta rama, el admin puede crear al embajador pero no volver a listarlo:
-- `profiles` se acota por supplier_id y el embajador quedaba invisible para él.
-- (Se re-crea desde el DDL vivo; ver el comentario de convivencia de arriba.)
do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname='ketzal' and tablename='profiles'
       and policyname='profiles_embajadores_de_mi_agencia'
  ) then
    execute $p$
      create policy profiles_embajadores_de_mi_agencia on ketzal.profiles for select
        using (
          type = 'embajador'
          and supplier_id is not null
          and coalesce(ketzal.is_agency_admin(supplier_id), false)
        )
    $p$;
  end if;
end $$;

-- 4) Onboarding por usuario, no por dispositivo ─────────────────────────────
alter table ketzal.profiles add column if not exists onboarded_at timestamptz;

-- `profiles` es RPC-only-write (b017: GRANT + policy sin columnas = ponerse
-- role='superadmin' por PATCH), así que la marca va por función, no por UPDATE.
create or replace function ketzal.marcar_onboarding_visto()
returns timestamptz
language plpgsql security definer
set search_path to 'ketzal', 'pg_temp'
as $$
declare v_at timestamptz;
begin
  if auth.uid() is null then return null; end if;
  update ketzal.profiles
     set onboarded_at = coalesce(onboarded_at, now())
   where id = auth.uid()
  returning onboarded_at into v_at;
  return v_at;
end $$;

revoke all on function ketzal.marcar_onboarding_visto() from public, anon;
grant execute on function ketzal.marcar_onboarding_visto() to authenticated, service_role;
