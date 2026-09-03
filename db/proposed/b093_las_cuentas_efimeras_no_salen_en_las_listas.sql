-- b093 — Las cuentas efímeras de los hard-tests no salen en las listas de gente
--
-- El fundador reportó que al abrir el expediente de un usuario desde /usuarios
-- daba "no se encuentra". No reproducía: los 9 perfiles de producción abrían en
-- 200, con superadmin y con admin de agencia, en local y en producción.
--
-- La causa es una carrera con los hard-tests. `_fixtures.mjs` crea cuentas
-- `qa.efimero.<llave>.<corrida>@ketzal.local` que viven SEGUNDOS y se borran en
-- un `finally`. Mientras corren, esas filas aparecen en /usuarios y en /equipo
-- como cualquier persona. Si alguien le da clic a una después de que la fixture
-- la borró, `user_account_detail` devuelve null y la página tira 404: "esa
-- cuenta no existe". Es exactamente lo que se vio.
--
-- Se corrige en la raíz — un predicado compartido, no un filtro por pantalla —
-- porque los dos listados de gente tienen el mismo problema. El prefijo es
-- seguro de usar como criterio: `_fixtures.mjs` lo eligió precisamente para que
-- "ninguna cuenta real pueda llevarlo jamás", y el barrido de restos ya borra
-- por él.
--
-- Lo que NO se toca: `user_account_detail` sigue devolviendo null para un id que
-- no existe o que no es del alcance de quien pregunta. No distinguir esos dos
-- casos es a propósito (no revelar de quién hay cuenta en otra agencia); lo que
-- cambia es que la página lo explica en vez de dar un 404 mudo.

-- ---------------------------------------------------------------- predicado --
create or replace function ketzal.es_cuenta_efimera(p_email text)
 returns boolean
 language sql
 immutable
 set search_path to 'ketzal', 'pg_temp'
as $function$
  select coalesce(p_email, '') like 'qa.efimero.%';
$function$;
revoke all on function ketzal.es_cuenta_efimera(text) from public, anon;
grant execute on function ketzal.es_cuenta_efimera(text) to authenticated, service_role;

-- ------------------------------------------------------- /usuarios (b066) ----
-- Reaplicada ADITIVAMENTE desde el DDL vivo: sólo se agrega la condición nueva.
create or replace function ketzal.list_users(p_q text DEFAULT NULL::text, p_limit integer DEFAULT 100)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'ketzal', 'pg_temp'
as $function$
declare
  v jsonb;
  v_lim int := least(greatest(coalesce(p_limit, 100), 1), 500);
  v_q text := nullif(trim(coalesce(p_q, '')), '');
begin
  select coalesce(jsonb_agg(to_jsonb(t) order by t.creada desc), '[]'::jsonb) into v
  from (
    select p.id, p.name as nombre, coalesce(p.email, u.email) as email,
           p.role::text as rol, p.type::text as tipo, p.active as activo,
           (select s.name from ketzal.suppliers s where s.id = p.supplier_id) as agencia,
           p.created_at as creada,
           u.last_sign_in_at as ultimo_acceso,
           (u.id is null) as sin_cuenta_auth
      from ketzal.profiles p
      left join auth.users u on u.id = p.id
     where ketzal.can_view_user(p.id)
       and not ketzal.es_cuenta_efimera(coalesce(p.email, u.email))   -- b093
       and (v_q is null
            or p.name ilike '%' || v_q || '%'
            or coalesce(p.email, u.email) ilike '%' || v_q || '%')
     limit v_lim
  ) t;
  return v;
end $function$;

-- ---------------------------------------------------------- /equipo (b012) ---
create or replace function ketzal.list_team()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'ketzal', 'pg_temp'
as $function$
declare v jsonb; v_super boolean := ketzal.is_superadmin(); v_sup uuid := ketzal.my_supplier_id();
begin
  if not v_super and v_sup is null then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'email', p.email, 'name', p.name, 'role', p.role, 'active', p.active,
    'supplier_id', p.supplier_id,
    'agency', (select name from ketzal.suppliers s where s.id = p.supplier_id),
    'num_ventas', (select count(*) from ketzal.bookings b
                    where b.sold_by = p.id and b.status in ('reserved','confirmed','paid'))
  ) order by p.active asc, p.email asc), '[]'::jsonb) into v
  from ketzal.profiles p
  where (v_super or (p.supplier_id is not null and p.supplier_id = v_sup))
    and not ketzal.es_cuenta_efimera(p.email);                         -- b093
  return v;
end $function$;
