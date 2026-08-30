-- b076 — Ningún servicio se publica sin comisión de plataforma configurada.
--
-- Hallazgo de la prueba en vivo (2026-08-29): `commission_rules` estaba VACÍA en
-- producción. El motor está completo (b019 + b072-b075) pero sin una regla
-- sembrada `resolve_commission_rule` devuelve null ⇒ `commission_amount` 0 ⇒ una
-- venta del portal devengaba $0. El código no fallaba: cobraba de menos en
-- silencio. Se cierra por dos frentes:
--
--  1. Se siembra la regla GENERAL de plataforma (20% percent, service_id null).
--     Aplica a todo servicio sin override por servicio. 20% = banda sana de
--     marketplaces de tours/actividades (Airbnb Experiences ~20, GetYourGuide/
--     Klook 20-25); override por servicio o agencia en /comisiones.
--  2. Un trigger PROHÍBE publicar (published=true) un servicio si
--     `resolve_commission_rule(servicio,'plataforma',null)` no resuelve nada
--     (ni general ni por servicio). Invariante EN BD: cubre el UPDATE de la web
--     (servicios/actions.ts) y del MCP (tools/catalogo.ts) y cualquier escritura
--     por PostgREST — no un guard por-llamador. Acepta %, fijo por venta o por
--     pax (cualquier basis que resuelva).
--
-- Regla de negocio (fundador): Ketzal comisiona SOLO ventas del portal; la venta
-- manual (SaaS) no comisiona (b072). El gate es sobre la PUBLICACIÓN (entrar a la
-- vitrina), no sobre la venta manual.

set search_path to ketzal, public;

-- 1) Regla general de plataforma (idempotente: el índice único parcial la protege)
insert into ketzal.commission_rules (service_id, payee_type, scope_supplier_id, basis, rate, unit_amount, active)
select null, 'plataforma', null, 'percent', 20, null, true
where not exists (
  select 1 from ketzal.commission_rules
  where payee_type = 'plataforma' and service_id is null and active
);

-- 2) Gate: no publicar sin comisión de plataforma resoluble
create or replace function ketzal.tg_require_commission_to_publish()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'ketzal', 'pg_temp'
as $function$
declare r record;
begin
  -- sólo importa cuando el servicio queda publicado
  if coalesce(NEW.published, false) = false then return NEW; end if;
  -- si ya estaba publicado y sigue publicado (edición de un servicio vivo), no re-validar
  if TG_OP = 'UPDATE' and coalesce(OLD.published, false) = true then return NEW; end if;
  select * into r from ketzal.resolve_commission_rule(NEW.id, 'plataforma', null);
  if r.basis is null then
    raise exception 'No se puede publicar "%": sin comisión de plataforma configurada. Define un %% general o una regla por servicio en /comisiones.', NEW.name
      using errcode = 'check_violation';
  end if;
  return NEW;
end $function$;

drop trigger if exists trg_require_commission_to_publish on ketzal.services;
create trigger trg_require_commission_to_publish
  before insert or update of published on ketzal.services
  for each row execute function ketzal.tg_require_commission_to_publish();
