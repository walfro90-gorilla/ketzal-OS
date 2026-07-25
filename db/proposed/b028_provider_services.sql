-- b028 — Portal del proveedor: RPC de sus servicios (donde participa). Scoped al que llama.
-- Espejo de la migración aplicada `b028_provider_services` (prod wnujoyzdpdyxblgdtxjw).
--
-- El proveedor (profiles type='proveedor', supplier_id) entra a /proveedor y ve los
-- servicios donde es dueño, transporte u hospedaje. DEFINER porque los servicios de
-- OTRAS agencias (donde solo es transporte/hospedaje) no los expone su RLS. Vista
-- operativa: SIN precios ni datos comerciales (nombre/tipo/destino/rol/publicado).
create or replace function ketzal.my_provider_services()
returns jsonb language plpgsql stable security definer set search_path to 'ketzal', 'pg_temp'
as $function$
declare v_uid uuid := auth.uid(); v_sup uuid := ketzal.my_supplier_id(); v jsonb;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if ketzal.my_profile_type() <> 'proveedor' then raise exception 'Solo para proveedores'; end if;
  if v_sup is null then
    return jsonb_build_object('supplier', null, 'servicios', '[]'::jsonb);
  end if;

  select jsonb_build_object(
    'supplier', (select name from ketzal.suppliers s where s.id = v_sup),
    'servicios', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'service_type', s.service_type,
        'city_to', s.city_to, 'state_to', s.state_to, 'published', s.published,
        'rol', case
          when s.supplier_id = v_sup then 'Dueño'
          when s.transport_provider_id = v_sup then 'Transporte'
          when s.hotel_provider_id = v_sup then 'Hospedaje'
          else '—' end)
        order by s.name)
      from ketzal.services s
      where s.supplier_id = v_sup
         or s.transport_provider_id = v_sup
         or s.hotel_provider_id = v_sup
    ), '[]'::jsonb)
  ) into v;
  return v;
end $function$;

revoke all on function ketzal.my_provider_services() from public, anon;
grant execute on function ketzal.my_provider_services() to authenticated, service_role;
