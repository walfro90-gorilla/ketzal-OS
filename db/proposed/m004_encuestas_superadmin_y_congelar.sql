-- m004 · Encuestas: el superadmin puede administrarlas, y las opciones se
--        congelan en la BD al publicar (no solo en la server action)
--
-- Dos hallazgos de la revisión de m002/m003:
--
-- (1) La sección estaba ROTA para el fundador. `polls_admin_ins/upd` solo
--     evaluaban `is_agency_admin(supplier_id)`, que exige `role = 'admin'`
--     literal. La cuenta principal (`walfre.am@gmail.com`) es `superadmin` con
--     `supplier_id` NULL: veía las encuestas (porque `polls_scoped_sel` sí
--     tiene rama `is_superadmin()`) pero no podía crear ni abrir ninguna.
--     Comprobado en vivo: "new row violates row-level security policy".
--     La asimetría select-vs-write era el olvido; el resto del repo
--     (`expenses_scoped_ins`, `customers_ins`) sí lleva las dos ramas.
--
-- (2) `polls_admin_upd` no restringía columnas, así que un admin podía cambiar
--     `options` de una encuesta ya abierta por PostgREST. Al reasignarse los
--     ids por índice, los `poll_votes.option_id` ya emitidos quedaban
--     apuntando a otro destino: los resultados mienten sin que nadie lo note.
--     La regla vivía SOLO en `actions.ts` — es exactamente el error que m003
--     vino a corregir (la protección en la app, no en la base), repetido una
--     capa más abajo. Un trigger lo cierra para todos los caminos.

-- 1) El superadmin administra, como en el resto del repo ────────────────────
drop policy if exists polls_admin_ins on ketzal.polls;
create policy polls_admin_ins on ketzal.polls for insert to authenticated
  with check (
    ketzal.is_superadmin()
    or coalesce(ketzal.is_agency_admin(supplier_id), false)
  );

drop policy if exists polls_admin_upd on ketzal.polls;
create policy polls_admin_upd on ketzal.polls for update to authenticated
  using (
    ketzal.is_superadmin()
    or coalesce(ketzal.is_agency_admin(supplier_id), false)
  )
  with check (
    ketzal.is_superadmin()
    or coalesce(ketzal.is_agency_admin(supplier_id), false)
  );

-- 2) Publicada = destinos y meses congelados, venga por donde venga ─────────
create or replace function ketzal.tg_polls_congelar_opciones()
returns trigger
language plpgsql
set search_path to 'ketzal', 'pg_temp'
as $$
begin
  -- En borrador todo se edita. Publicada, los votos ya emitidos apuntan a
  -- `option_id`s concretos y a un rango de meses: moverlos falsea el resultado.
  if old.status <> 'draft' then
    if new.options is distinct from old.options then
      raise exception 'No se pueden cambiar los destinos de una encuesta publicada';
    end if;
    if new.month_from is distinct from old.month_from
       or new.month_to is distinct from old.month_to then
      raise exception 'No se puede cambiar el rango de meses de una encuesta publicada';
    end if;
  end if;
  -- El dueño tampoco se reasigna: la encuesta y sus leads son de una agencia.
  if new.supplier_id is distinct from old.supplier_id then
    raise exception 'Una encuesta no cambia de agencia';
  end if;
  return new;
end $$;

drop trigger if exists trg_polls_congelar_opciones on ketzal.polls;
create trigger trg_polls_congelar_opciones
  before update on ketzal.polls
  for each row execute function ketzal.tg_polls_congelar_opciones();
