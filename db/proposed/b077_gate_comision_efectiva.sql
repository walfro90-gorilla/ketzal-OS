-- b077 — El gate de publicación exige comisión EFECTIVA (> 0), no solo resoluble.
--
-- Por qué existe (hallazgo al probar b076 en vivo, 2026-08-30):
-- b076 dejó el gate INERTE. Su guarda era `if r.basis is null then raise`, pero
-- `resolve_commission_rule` NUNCA devuelve vacío para payee_type='plataforma':
-- cuando no hay regla cae a un último recurso que retorna siempre
--     ('percent', coalesce(app_settings.platform_commission_rate, 0), null)
-- así que `basis` jamás es null y el raise no dispara. Comprobado: con la regla
-- general desactivada, publicar un servicio funcionaba igual, y un INSERT con
-- published=true también pasaba.
--
-- El agujero que b076 quería tapar seguía abierto justo en su caso peor: si
-- `platform_commission_rate` es NULL o 0, el último recurso resuelve 0% y el
-- servicio entra a la vitrina devengando $0 — el mismo cobro silencioso de
-- menos que motivó el carril.
--
-- El gate ahora mide el VALOR, que es lo que de verdad importa: hay comisión si
-- el porcentaje es > 0, o si el monto fijo por venta/pax es > 0 (híbrido: basta
-- con que uno de los dos lo sea).
--
-- Nota para quien mueva esto: hay DOS fuentes del % de plataforma —
-- `commission_rules` (regla general, gana) y `app_settings.platform_commission_rate`
-- (último recurso). Hoy dicen 20 y 10. Mientras la regla general esté activa
-- cobra 20; si alguien la desactiva, baja a 10 sin avisar. Unificarlas es
-- decisión de negocio y va en su propio ADR.

create or replace function ketzal.tg_require_commission_to_publish()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'ketzal', 'pg_temp'
as $function$
declare r record;
begin
  -- Sólo importa cuando el servicio queda publicado.
  if coalesce(NEW.published, false) = false then return NEW; end if;
  -- Editar un servicio ya vivo no re-valida: el gate es sobre la transición.
  if TG_OP = 'UPDATE' and coalesce(OLD.published, false) = true then return NEW; end if;

  select * into r from ketzal.resolve_commission_rule(NEW.id, 'plataforma', null);

  -- Comisión efectiva: un 0% resuelto es tan malo como no tener regla.
  if r.basis is null
     or coalesce(r.rate, 0) <= 0 and coalesce(r.unit_amount, 0) <= 0 then
    raise exception 'No se puede publicar "%": la comisión de plataforma resuelve en cero. Define un %% general o una regla por servicio en /comisiones.', NEW.name
      using errcode = 'check_violation';
  end if;
  return NEW;
end $function$;

-- El trigger de b076 ya apunta a esta función; se re-crea por si b076 no corrió.
drop trigger if exists trg_require_commission_to_publish on ketzal.services;
create trigger trg_require_commission_to_publish
  before insert or update of published on ketzal.services
  for each row execute function ketzal.tg_require_commission_to_publish();
