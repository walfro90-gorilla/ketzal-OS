# ADR-0018 — Investigación de mercado: encuesta pública anónima con lead opcional

- Estado: aceptada · Fecha: 2026-08-29 · Sustituye: —
- Alcance: `ketzal.polls`, `ketzal.poll_votes`, RPCs `submit_poll_vote` /
  `get_public_poll`, ruta pública `/opina/[id]`, sección `/investigacion` (m002)

## Contexto
La agencia decide a ciegas qué trip armar y para cuándo: arma la salida, luego
descubre si había demanda. Comprar esa señal con Meta Ads es barato comparado
con una salida vacía, pero el anuncio necesita un aterrizaje que convierta sin
fricción: quien viene de un scroll en Instagram no crea una cuenta para opinar.

La restricción dura del repo: **no existe ni una policy de RLS para `anon`**
(0 de 80). Toda escritura anónima previa (b047, aceptación de política por
token) va por RPC `SECURITY DEFINER`. Y hCaptcha, que sí existe en el repo,
solo funciona a través de Supabase Auth — no hay `HCAPTCHA_SECRET` ni
verificación server-side propia, así que no sirve para un endpoint que no pasa
por Auth.

## Decisión

**Superficie anónima: exactamente 2 RPCs DEFINER, cero policies para `anon`.**
`submit_poll_vote` (escribe) y `get_public_poll` (lee agregados). Ambos con
`revoke all from public` + `grant execute to anon, authenticated, service_role`,
`set search_path to 'ketzal','pg_temp'`, fail-closed `return null` y tope de
payload de 4KB. Se calca `accept_policy_by_token` (b047) porque ya sobrevivió
al escrutinio. `get_public_poll` devuelve conteos por opción y por mes — nunca
votos individuales, sugerencias, contacto ni ip/ua. Un `draft` devuelve `null`:
no es enumerable desde afuera.

**Antiabuso: dedupe por `voter_hash`, sin captcha.** La server action calcula
`sha256(cookie_uuid | ip | user_agent)` y el RPC deduplica con
`unique (poll_id, voter_hash)` + `on conflict do nothing`. El repetidor recibe
`{ok:true, ya_votaste:true}` sin pisar su voto anterior ni enterarse de cuál
fue. **Techo aceptado y consciente**: borrar la cookie o rotar de IP (red móvil)
permite volver a votar. Es una encuesta de marketing, no una elección — el sesgo
que un rociador puede meter no justifica poner un captcha entre el anuncio y la
opinión. `ip`/`ua` quedan en `meta` como evidencia auditable: si aparece abuso
real, la escalada es hCaptcha con verify propio o una regla de Vercel WAF, y
esta decisión se sustituye con un ADR nuevo.

**PII de leads: la lee solo la agencia dueña.** `poll_votes.contact` (WhatsApp o
correo) e ip/ua viven bajo `poll_votes_owner_sel`, que exige que la encuesta sea
del `my_supplier_id()` del lector. La tabla es **append-only y RPC-only-write**:
`revoke insert, update, delete, truncate ... from authenticated, anon`. Ni la
agencia dueña puede editar un voto. El copy de la página promete "serás de los
primeros en apartar con el mínimo" — ese contacto se pidió para eso.

**`polls` NO es RPC-only-write.** No es dinero ni append-only, así que el CRUD
del back-office escribe directo con policies `is_agency_admin(supplier_id)` en
vez de tres RPCs de fachada. La regla de oro 3 (ADR-0006) protege tablas de
dinero; extenderla aquí sería ceremonia sin garantía extra.

**Opciones como `jsonb`, no tabla hija.** Son 4–8 filas con un solo escritor;
el conteo es `group by option_id` sobre los votos. Una tabla hija exigiría RLS,
policies y grants propios para custodiar una FK que no compra nada. Su techo:
editar `options` de una encuesta abierta invalidaría los agregados — lo bloquea
la server action (solo en `draft`), sin trigger en BD.

**Alcance v1.** Fuera a propósito: puntos por invitar viajeros (la gamificación
está excluida del v1 del proyecto), auto-notificación por WhatsApp cuando gana
un destino (carril Baileys pausado, ADR-0017), y conversión automática
encuesta→salida. El cierre del loop es **manual**: la agencia exporta los leads
y arma la salida por el flujo normal.

## Consecuencias
- Cualquier tabla o RPC de superficie anónima que se agregue después debe
  entrar a `supabase/tests/superficie_anonima.mjs` o el hueco pasa sin verse.
- El voto vive desacoplado del catálogo: un destino votado es texto libre de la
  agencia, no un `service_id`. Cuando exista la conversión automática, ese
  puente hay que construirlo (y decidirlo en su propio ADR).
- Es la primera vez que el repo guarda datos de campaña (`utm_*`, `fbclid`).
  Van en `meta jsonb` con whitelist y recorte a 200 chars, no en columnas.

## Verificación
Harness `supabase/tests/encuestas_rls.sql` (13 casos, suplantando identidad con
`set_config`: dedupe, voto no pisado, agregados sin PII, draft y cerrada
rechazadas, cross-agencia en lectura y escritura, append-only incluso para la
dueña) — 13/13 OK. `superficie_anonima.mjs` ampliado: 30 pruebas, 0 expuestas
(`polls` y `poll_votes` dan 401 al anon; `get_public_poll` y `submit_poll_vote`
con uuid inventado devuelven `null` sin crear filas; meta >4KB rechazado).
Voto real end-to-end en navegador con UTM y `fbclid` en el query string,
verificado en la fila resultante; recarga muestra "ya votaste". Datos de prueba
borrados y verificado en 0.

## Fuentes
m002 (`db/proposed/m002_investigacion_mercado.sql`), molde b047
(`accept_policy_by_token`), ADR-0004 (tenancy), ADR-0006 (append-only).
