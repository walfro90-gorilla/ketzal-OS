-- m002 · Investigación de mercado: encuestas públicas alimentadas por Meta Ads
--
-- Por qué existe:
-- Hoy la agencia decide a ciegas qué trip armar y para cuándo. Este carril compra
-- esa señal con anuncios: el interesado llega de Meta Ads a una página pública,
-- vota destino + mes SIN registrarse, y opcionalmente deja WhatsApp/correo. Ese
-- contacto es el ROI real del gasto en ads: si su idea empata con la de otros, la
-- agencia lo llama para que sea de los primeros en apartar.
--
-- Decisiones (ADR-0018):
--   · Superficie anónima nueva = 2 RPCs SECURITY DEFINER con grant a `anon`, cero
--     policies para anon (el repo no tiene ninguna y no se estrena aquí). Molde:
--     `accept_policy_by_token` de b047 — fail-closed `return null`, tope de payload,
--     escritura idempotente.
--   · `options` va como jsonb en la encuesta, no como tabla hija: son 4–8 filas con
--     un solo escritor. Una tabla aparte exigiría RLS + policies + grants propios
--     para custodiar una FK que aquí no compra nada.
--   · `polls` NO es RPC-only-write: no es dinero ni append-only, así que la escritura
--     del back-office va directo a la tabla con policy `is_agency_admin`. La regla de
--     oro de escritura-solo-RPC aplica a `poll_votes`, que sí es append-only y guarda PII.
--   · Antiabuso v1 = dedupe por `voter_hash` (sha256 de cookie|ip|ua, calculado en la
--     server action) con unique por encuesta. Sin hCaptcha: en este repo el captcha
--     solo funciona vía Supabase Auth y no hay verificación server-side propia.
--     Techo aceptado: borrar la cookie o rotar de IP permite re-votar. ip/ua quedan
--     en `meta` como evidencia auditable si aparece abuso real.

-- 1) Encuesta ───────────────────────────────────────────────────────────────
create table if not exists ketzal.polls (
  id           uuid primary key default gen_random_uuid(),
  supplier_id  uuid not null default ketzal.my_supplier_id()
               references ketzal.suppliers(id),
  question     text not null check (char_length(question) between 1 and 200),
  -- [{"id":1,"label":"Mazatlán"}, ...] — ids estables asignados al crear.
  -- El check queda laxo (<=10) a propósito: el form del OS impone 4–8.
  options      jsonb not null default '[]'::jsonb
               check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) <= 10),
  month_from   date not null,
  month_to     date not null,
  status       text not null default 'draft' check (status in ('draft','open','closed')),
  closes_at    date,
  created_by   uuid not null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint polls_rango_meses check (month_from <= month_to)
);

create index if not exists polls_supplier_idx on ketzal.polls (supplier_id);

-- 2) Voto (append-only; guarda PII opcional) ────────────────────────────────
create table if not exists ketzal.poll_votes (
  id              uuid primary key default gen_random_uuid(),
  poll_id         uuid not null references ketzal.polls(id) on delete cascade,
  option_id       int not null,
  preferred_month date not null,
  suggestion      text check (char_length(suggestion) <= 280),
  contact         text check (char_length(contact) <= 120),
  voter_hash      text not null check (char_length(voter_hash) between 16 and 128),
  meta            jsonb,
  created_at      timestamptz not null default now(),
  -- El dedupe. También sirve de índice por poll_id para los agregados.
  unique (poll_id, voter_hash)
);

-- 3) RLS ────────────────────────────────────────────────────────────────────
alter table ketzal.polls enable row level security;
alter table ketzal.poll_votes enable row level security;

-- La agencia ve sus encuestas. `supplier_id is not null` es obligatorio: sin él,
-- un my_supplier_id() nulo casaría con filas huérfanas.
drop policy if exists polls_scoped_sel on ketzal.polls;
create policy polls_scoped_sel on ketzal.polls for select to authenticated
  using (
    ketzal.is_superadmin()
    or (supplier_id is not null and supplier_id = ketzal.my_supplier_id())
  );

drop policy if exists polls_admin_ins on ketzal.polls;
create policy polls_admin_ins on ketzal.polls for insert to authenticated
  with check (coalesce(ketzal.is_agency_admin(supplier_id), false));

drop policy if exists polls_admin_upd on ketzal.polls;
create policy polls_admin_upd on ketzal.polls for update to authenticated
  using (coalesce(ketzal.is_agency_admin(supplier_id), false))
  with check (coalesce(ketzal.is_agency_admin(supplier_id), false));

-- Sin policy de delete: una encuesta se cierra, no se borra.

-- Los votos traen PII (contact, ip/ua en meta): SOLO los lee la agencia dueña.
drop policy if exists poll_votes_owner_sel on ketzal.poll_votes;
create policy poll_votes_owner_sel on ketzal.poll_votes for select to authenticated
  using (
    ketzal.is_superadmin()
    or exists (
      select 1 from ketzal.polls p
       where p.id = poll_id
         and p.supplier_id is not null
         and p.supplier_id = ketzal.my_supplier_id()
    )
  );

-- 4) Grants de tabla ────────────────────────────────────────────────────────
-- anon no toca ninguna de las dos tablas: su único camino son los 2 RPCs de abajo.
revoke all on ketzal.polls from anon;
revoke all on ketzal.poll_votes from anon;

grant select, insert, update on ketzal.polls to authenticated;
revoke delete on ketzal.polls from authenticated;

-- poll_votes es append-only y RPC-only-write: GRANT de tabla + policy sin
-- restricción de columnas = escritura arbitraria por PostgREST.
grant select on ketzal.poll_votes to authenticated;
revoke insert, update, delete, truncate on ketzal.poll_votes from authenticated;

-- 5) RPC anónimo de escritura ───────────────────────────────────────────────
create or replace function ketzal.submit_poll_vote(
  p_poll uuid,
  p_option int,
  p_month date,
  p_voter_hash text,
  p_suggestion text default null,
  p_contact text default null,
  p_meta jsonb default null
) returns jsonb
language plpgsql security definer
set search_path to 'ketzal', 'pg_temp'
as $$
declare
  v_poll ketzal.polls;
  v_month date;
  v_id uuid;
begin
  -- Fail-closed: nada que reportarle a un anónimo con argumentos inválidos.
  if p_poll is null or p_option is null or p_month is null or p_voter_hash is null then
    return null;
  end if;
  if char_length(p_voter_hash) not between 16 and 128 then return null; end if;

  -- Estos sí son excepción: es abuso, no un caso normal.
  if p_meta is not null and pg_column_size(p_meta) > 4096 then
    raise exception 'Meta demasiado grande';
  end if;
  if char_length(coalesce(p_suggestion, '')) > 280 then
    raise exception 'Sugerencia demasiado larga';
  end if;
  if char_length(coalesce(p_contact, '')) > 120 then
    raise exception 'Contacto demasiado largo';
  end if;

  -- Draft, cerrada y expirada son indistinguibles desde afuera.
  select * into v_poll from ketzal.polls
   where id = p_poll
     and status = 'open'
     and (closes_at is null or closes_at >= current_date);
  if not found then return null; end if;

  if not exists (
    select 1 from jsonb_array_elements(v_poll.options) o
     where (o->>'id')::int = p_option
  ) then
    return null;
  end if;

  v_month := date_trunc('month', p_month)::date;
  if v_month < date_trunc('month', v_poll.month_from)::date
     or v_month > date_trunc('month', v_poll.month_to)::date then
    return null;
  end if;

  -- El dedupe: el repetidor no pisa su voto anterior ni se entera de cuál fue.
  insert into ketzal.poll_votes
    (poll_id, option_id, preferred_month, suggestion, contact, voter_hash, meta)
  values
    (p_poll, p_option, v_month, nullif(btrim(p_suggestion), ''),
     nullif(btrim(p_contact), ''), p_voter_hash, p_meta)
  on conflict (poll_id, voter_hash) do nothing
  returning id into v_id;

  return jsonb_build_object('ok', true, 'ya_votaste', v_id is null);
end $$;

-- 6) RPC anónimo de lectura (solo agregados; jamás PII ni votos individuales) ─
create or replace function ketzal.get_public_poll(p_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path to 'ketzal', 'pg_temp'
as $$
declare
  v_poll ketzal.polls;
  v_sup record;
  v_cerrada boolean;
begin
  if p_id is null then return null; end if;

  -- Una encuesta en borrador no es enumerable desde afuera.
  select * into v_poll from ketzal.polls where id = p_id and status <> 'draft';
  if not found then return null; end if;

  select name, img_logo into v_sup from ketzal.suppliers where id = v_poll.supplier_id;

  v_cerrada := v_poll.status = 'closed'
               or (v_poll.closes_at is not null and v_poll.closes_at < current_date);

  return jsonb_build_object(
    'id', v_poll.id,
    'question', v_poll.question,
    'options', v_poll.options,
    'month_from', v_poll.month_from,
    'month_to', v_poll.month_to,
    'closes_at', v_poll.closes_at,
    'status_efectivo', case when v_cerrada then 'closed' else 'open' end,
    'agency', jsonb_build_object('name', v_sup.name, 'logo', v_sup.img_logo),
    'total_votes', (select count(*) from ketzal.poll_votes v where v.poll_id = v_poll.id),
    'by_option', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.option_id, 'votes', t.n) order by t.n desc)
        from (select option_id, count(*) as n from ketzal.poll_votes
               where poll_id = v_poll.id group by option_id) t
    ), '[]'::jsonb),
    'by_month', coalesce((
      select jsonb_agg(jsonb_build_object('month', t.m, 'votes', t.n) order by t.m)
        from (select to_char(preferred_month, 'YYYY-MM') as m, count(*) as n
                from ketzal.poll_votes where poll_id = v_poll.id
               group by 1) t
    ), '[]'::jsonb)
  );
end $$;

-- 7) Grants de función ──────────────────────────────────────────────────────
revoke all on function ketzal.submit_poll_vote(uuid, int, date, text, text, text, jsonb) from public;
grant execute on function ketzal.submit_poll_vote(uuid, int, date, text, text, text, jsonb)
  to anon, authenticated, service_role;

revoke all on function ketzal.get_public_poll(uuid) from public;
grant execute on function ketzal.get_public_poll(uuid) to anon, authenticated, service_role;
