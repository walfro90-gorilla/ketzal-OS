-- 013 — F5: metas por agente + conversión (cotización → venta).
--
-- Decisión de coordinación: NO se re-aplica el hub compartido reports_summary
-- (lo tocan varios agentes). La conversión va en un RPC nuevo e independiente
-- (conversion_summary); /reportes llama ambos y los une en la vista.
--
-- • sales_goals: meta mensual por agente (agent_id) o por agencia (agent_id
--   null). Escritura solo vía RPC con guard admin (RLS deny en insert/upd/del).
-- • goals_progress(month): meta vs vendido real del mes, por agente + agencia.
-- • conversion_summary(from,to): cotizadas (quote_folio no null) → convertidas
--   (status reserved/confirmed/paid) → tasa, global y por agente. Habilitado por
--   el quote_folio de F1.
--
-- Espejo del DDL vivo; la fuente es la BD (apply_migration).

create table if not exists ketzal.sales_goals (
  id          uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references ketzal.suppliers(id),
  agent_id    uuid references ketzal.profiles(id),   -- null = meta de la agencia (agregada)
  month       date not null,                          -- se normaliza al día 1 del mes
  goal_amount numeric not null check (goal_amount > 0),
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
-- una meta por (agencia, agente, mes) y una meta de agencia por (agencia, mes)
create unique index if not exists sales_goals_agent_uk
  on ketzal.sales_goals (supplier_id, agent_id, month) where agent_id is not null;
create unique index if not exists sales_goals_agency_uk
  on ketzal.sales_goals (supplier_id, month) where agent_id is null;

alter table ketzal.sales_goals enable row level security;

-- Lectura: miembros de la agencia (o superadmin). Escritura: solo vía RPC.
drop policy if exists sg_sel on ketzal.sales_goals;
create policy sg_sel on ketzal.sales_goals for select using (
  ketzal.is_superadmin() or supplier_id = ketzal.my_supplier_id()
);
revoke insert, update, delete on ketzal.sales_goals from authenticated;
grant select on ketzal.sales_goals to authenticated;

-- ── helper: ¿el que llama es admin/superadmin? ────────────────────────────
-- (se evalúa dentro de los RPCs DEFINER)

-- ── upsert_sales_goal ─────────────────────────────────────────────────────
create or replace function ketzal.upsert_sales_goal(
  p_agent uuid, p_month date, p_amount numeric
) returns void
  language plpgsql security definer
  set search_path to 'ketzal', 'pg_temp'
as $$
declare
  v_super boolean := ketzal.is_superadmin();
  v_role text := (select role from ketzal.profiles where id = auth.uid());
  v_sup uuid := ketzal.my_supplier_id();
  v_target_sup uuid;
  m date := date_trunc('month', p_month)::date;
begin
  if not v_super and v_role <> 'admin' then
    raise exception 'Solo un admin puede fijar metas.';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'La meta debe ser mayor que cero.';
  end if;

  if p_agent is null then
    -- meta de la agencia: la del que llama (o requiere superadmin con agencia)
    v_target_sup := v_sup;
  else
    -- meta de un agente: su agencia; el admin solo puede fijar dentro de la suya
    select supplier_id into v_target_sup from ketzal.profiles where id = p_agent;
    if not v_super and v_target_sup is distinct from v_sup then
      raise exception 'No puedes fijar metas de otra agencia.';
    end if;
  end if;
  if v_target_sup is null then
    raise exception 'No hay agencia asociada para la meta.';
  end if;

  if p_agent is null then
    insert into ketzal.sales_goals (supplier_id, agent_id, month, goal_amount)
      values (v_target_sup, null, m, round(p_amount, 2))
    on conflict (supplier_id, month) where agent_id is null
      do update set goal_amount = excluded.goal_amount, updated_at = now();
  else
    insert into ketzal.sales_goals (supplier_id, agent_id, month, goal_amount)
      values (v_target_sup, p_agent, m, round(p_amount, 2))
    on conflict (supplier_id, agent_id, month) where agent_id is not null
      do update set goal_amount = excluded.goal_amount, updated_at = now();
  end if;
end $$;
revoke all on function ketzal.upsert_sales_goal(uuid, date, numeric) from public, anon;
grant execute on function ketzal.upsert_sales_goal(uuid, date, numeric) to authenticated;

-- ── delete_sales_goal ─────────────────────────────────────────────────────
create or replace function ketzal.delete_sales_goal(p_agent uuid, p_month date)
  returns void
  language plpgsql security definer
  set search_path to 'ketzal', 'pg_temp'
as $$
declare
  v_super boolean := ketzal.is_superadmin();
  v_role text := (select role from ketzal.profiles where id = auth.uid());
  v_sup uuid := ketzal.my_supplier_id();
  m date := date_trunc('month', p_month)::date;
begin
  if not v_super and v_role <> 'admin' then
    raise exception 'Solo un admin puede borrar metas.';
  end if;
  delete from ketzal.sales_goals
   where month = m
     and agent_id is not distinct from p_agent
     and (v_super or supplier_id = v_sup);
end $$;
revoke all on function ketzal.delete_sales_goal(uuid, date) from public, anon;
grant execute on function ketzal.delete_sales_goal(uuid, date) to authenticated;

-- ── goals_progress ────────────────────────────────────────────────────────
-- Meta vs vendido real del mes (bookings reserved/confirmed/paid creados en el
-- mes), por agente + agregado de agencia. Scope = agencia del que llama.
create or replace function ketzal.goals_progress(p_month date) returns jsonb
  language plpgsql security definer
  set search_path to 'ketzal', 'pg_temp'
as $$
declare
  v jsonb;
  v_super boolean := ketzal.is_superadmin();
  v_sup uuid := ketzal.my_supplier_id();
  m_start date := date_trunc('month', p_month)::date;
  m_end   date := (date_trunc('month', p_month) + interval '1 month')::date;
begin
  if not v_super and v_sup is null then return '{}'::jsonb; end if;

  with vendido as (
    select b.sold_by as agent_id, coalesce(sum(b.total), 0) as vendido, count(*) as num
    from ketzal.bookings b
    where b.status in ('reserved','confirmed','paid')
      and b.created_at >= m_start and b.created_at < m_end
      and (v_super or b.selling_supplier_id = v_sup)
    group by b.sold_by
  ),
  metas as (
    select g.agent_id, g.goal_amount
    from ketzal.sales_goals g
    where g.month = m_start and (v_super or g.supplier_id = v_sup)
  )
  select jsonb_build_object(
    'month', to_char(m_start, 'YYYY-MM'),
    'agencia', jsonb_build_object(
      'goal', coalesce((select goal_amount from metas where agent_id is null), 0),
      'vendido', coalesce((select sum(vendido) from vendido), 0)
    ),
    'agentes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'agent_id', p.id,
        'agente', coalesce(p.name, p.email, 'Agente'),
        'goal', coalesce(mt.goal_amount, 0),
        'vendido', coalesce(vd.vendido, 0),
        'avance', case when coalesce(mt.goal_amount,0) > 0
                       then round(100.0 * coalesce(vd.vendido,0) / mt.goal_amount, 1) else null end
      ) order by coalesce(vd.vendido,0) desc)
      from ketzal.profiles p
      left join metas mt on mt.agent_id = p.id
      left join vendido vd on vd.agent_id = p.id
      where (v_super or p.supplier_id = v_sup)
        and (mt.goal_amount is not null or vd.vendido is not null)
    ), '[]'::jsonb)
  ) into v;
  return v;
end $$;
revoke all on function ketzal.goals_progress(date) from public, anon;
grant execute on function ketzal.goals_progress(date) to authenticated;

-- ── conversion_summary ────────────────────────────────────────────────────
-- Cotizadas (quote_folio no null) → convertidas (venta viva) → tasa. Global y
-- por agente. NO toca reports_summary. Scope = agencia del que llama.
create or replace function ketzal.conversion_summary(p_from date, p_to date) returns jsonb
  language plpgsql security definer
  set search_path to 'ketzal', 'pg_temp'
as $$
declare
  v jsonb;
  v_super boolean := ketzal.is_superadmin();
  v_sup uuid := ketzal.my_supplier_id();
begin
  if not v_super and v_sup is null then
    return jsonb_build_object('cotizadas',0,'convertidas',0,'tasa',0,'por_agente','[]'::jsonb);
  end if;

  with q as (
    select b.sold_by,
           (b.status in ('reserved','confirmed','paid')) as es_venta
    from ketzal.bookings b
    where b.quote_folio is not null
      and b.created_at::date between p_from and p_to
      and (v_super or b.selling_supplier_id = v_sup)
  )
  select jsonb_build_object(
    'cotizadas',   count(*),
    'convertidas', count(*) filter (where es_venta),
    'tasa', case when count(*) > 0
                 then round(100.0 * count(*) filter (where es_venta) / count(*), 1) else 0 end,
    'por_agente', coalesce((
      select jsonb_agg(jsonb_build_object(
        'agente', coalesce(p.name, p.email, 'Agente'),
        'cotizadas', c.cot, 'convertidas', c.conv,
        'tasa', case when c.cot > 0 then round(100.0 * c.conv / c.cot, 1) else 0 end
      ) order by c.cot desc)
      from (select sold_by, count(*) cot, count(*) filter (where es_venta) conv
            from q group by sold_by) c
      left join ketzal.profiles p on p.id = c.sold_by
    ), '[]'::jsonb)
  ) into v from q;
  return v;
end $$;
revoke all on function ketzal.conversion_summary(date, date) from public, anon;
grant execute on function ketzal.conversion_summary(date, date) to authenticated;
