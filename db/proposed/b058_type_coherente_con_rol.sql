-- b058 — `profiles.type` deja de quedarse atrás cuando cambia el rol o la agencia.
-- Migración aplicada: `b058_type_coherente_con_rol` (2026-08-19).
--
-- EL BUG, encontrado en producción al armar un usuario por cada posición:
-- `bordersky@gmail.com` era admin de Border Travels con `type='viajero'`. El gate
-- de persona de todo el back-office (`src/app/(ops)/layout.tsx:33`) hace
--     if (!profile || profile.type === 'viajero') redirect('/mis-compras')
-- así que el admin de una agencia real NO PODÍA ENTRAR a operar su agencia:
-- permisos de admin, superficie de viajero. Border tenía admin y no lo sabía.
--
-- LA CAUSA: los dos ejes del modelo de identidad (role = permiso, type = persona)
-- se desincronizan según por dónde entres. `accept_pending_invitation` SÍ pone
-- `type='agente'` al aceptar la invitación, pero `set_user_role`,
-- `assign_user_agency` y `set_agency_member_role` sólo tocaban `role`/`supplier_id`.
-- Promover a un viajero por esos caminos lo dejaba encerrado fuera.
--
-- LA REGLA: `type` se promueve a 'agente' SÓLO desde 'viajero' o null, y sólo
-- cuando el cambio implica operar el back-office. Nunca se toca a un 'embajador'
-- ni a un 'proveedor' — ambos tienen su portal propio, y el proveedor además
-- lleva `supplier_id` (así que asignarle agencia NO debe volverlo agente).
-- Tampoco se degrada a nadie: quitar la agencia deja un agente libre, no un viajero.
--
-- Re-aplicación aditiva desde el DDL vivo de las tres: guards, firmas y mensajes
-- intactos; sólo se agrega el ajuste de `type`. Más un UPDATE de reparación del
-- dato ya roto.
--
-- HARD-TEST (rollback garantizado, 4/4):
--   viajero  + rol admin    -> agente     ✓
--   PROVEEDOR + agencia     -> proveedor  ✓ (intacto)
--   EMBAJADOR + rol admin   -> embajador  ✓ (intacto)
--   viajero  + agencia      -> agente     ✓
-- Tras aplicar: los 4 perfiles reales quedan coherentes; el único `viajero`
-- restante es el comprador B2C, que es su posición correcta.

create or replace function ketzal.set_user_role(p_user uuid, p_role ketzal.user_role)
 returns void
 language plpgsql
 security definer
 set search_path to 'ketzal', 'pg_temp'
as $function$
begin
  if not ketzal.is_superadmin() then raise exception 'Solo el superadmin puede cambiar roles'; end if;
  update ketzal.profiles set role = p_role, updated_at = now() where id = p_user;
  if not found then raise exception 'Usuario no encontrado'; end if;
  -- b058: admin/superadmin operan el back-office; con type='viajero' el gate de
  -- persona los expulsaría a /mis-compras.
  if p_role in ('admin','superadmin') then
    update ketzal.profiles
       set type = 'agente', updated_at = now()
     where id = p_user and (type is null or type = 'viajero');
  end if;
end $function$;

create or replace function ketzal.assign_user_agency(p_user uuid, p_supplier uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'ketzal', 'pg_temp'
as $function$
begin
  if not ketzal.is_superadmin() then raise exception 'Solo el superadmin puede asignar agencias'; end if;
  if p_supplier is not null and not exists (select 1 from ketzal.suppliers s where s.id = p_supplier) then
    raise exception 'Agencia no encontrada'; end if;
  update ketzal.profiles set supplier_id = p_supplier, updated_at = now() where id = p_user;
  if not found then raise exception 'Usuario no encontrado'; end if;
  -- b058: entrar a una agencia es volverse su staff. Sólo desde viajero/null:
  -- un 'proveedor' también lleva supplier_id y NO debe volverse agente.
  if p_supplier is not null then
    update ketzal.profiles
       set type = 'agente', updated_at = now()
     where id = p_user and (type is null or type = 'viajero');
  end if;
end $function$;

create or replace function ketzal.set_agency_member_role(p_user uuid, p_role ketzal.user_role)
 returns void
 language plpgsql
 security definer
 set search_path to 'ketzal', 'public'
as $function$
declare v_target_sup uuid;
begin
  if p_role not in ('user','admin') then
    raise exception 'Rol inválido (solo user o admin; superadmin es del god admin).';
  end if;
  select supplier_id into v_target_sup from ketzal.profiles where id = p_user;
  if v_target_sup is null then
    raise exception 'Ese usuario no pertenece a una agencia.';
  end if;
  if not (ketzal.is_superadmin() or ketzal.is_agency_admin(v_target_sup)) then
    raise exception 'Solo el superadmin o un admin de la misma agencia puede cambiar el rol.';
  end if;
  update ketzal.profiles set role = p_role where id = p_user;
  -- b058: un miembro de agencia opera el back-office, con cualquiera de los dos roles.
  update ketzal.profiles
     set type = 'agente', updated_at = now()
   where id = p_user and (type is null or type = 'viajero');
end $function$;

-- Reparación del dato ya roto: quien hoy tiene rol o agencia de staff pero quedó
-- con type='viajero'. Excluye embajador y proveedor (tienen su propio portal).
update ketzal.profiles
   set type = 'agente', updated_at = now()
 where (type is null or type = 'viajero')
   and (role in ('admin','superadmin') or supplier_id is not null);
