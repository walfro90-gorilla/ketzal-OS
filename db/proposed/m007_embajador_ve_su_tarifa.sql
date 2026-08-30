-- m007 · El embajador puede leer SU propia tarifa
--
-- m005 dejó que el admin de agencia gobierne las reglas de sus embajadores,
-- pero nadie podía leerlas desde el otro lado: el portal /embajador mostraba
-- "Tu tarifa todavía no está configurada" aunque estuviera puesta, porque
-- `commission_rules_sel` solo contemplaba superadmin, admin de agencia y admin
-- del embajador — nunca al embajador mismo.
--
-- Detectado entrando al portal como un embajador real, no leyendo código: la
-- consulta devolvía 0 filas en silencio y la UI creía que no había tarifa. Es la
-- clase de hueco que ni el build ni los tests de dominio ven.
--
-- Solo su propia fila: `scope_profile_id = auth.uid()`. Un embajador no ve la
-- tarifa de otro ni las de agencia/plataforma.

drop policy if exists commission_rules_sel on ketzal.commission_rules;
create policy commission_rules_sel on ketzal.commission_rules for select
  using (
    ketzal.is_superadmin()
    or (payee_type = 'agencia' and scope_supplier_id = ketzal.my_supplier_id())
    or (payee_type = 'embajador'
        and coalesce(ketzal.is_admin_de_embajador(scope_profile_id), false))
    -- El interesado ve lo suyo (embajador o agente con tarifa propia).
    or (scope_profile_id is not null and scope_profile_id = auth.uid())
  );
