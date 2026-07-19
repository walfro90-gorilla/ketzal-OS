# FODA general — Ketzal OS

> Actualizado: 2026-07-11 · Reemplaza el FODA del 2026-07-09 (cuyo plan quedó 5/5 ejecutado).

## Contexto (por qué este FODA ahora)

El FODA anterior (2026-07-09) cumplió: su plan de 5 puntos está **5/5 ejecutado**
(cobranza, MP validado en prod, Clawbot, invariantes de dinero, snapshot de BD).
Desde entonces el proyecto cruzó un umbral: **el primer paso B2C está vivo en
producción** — vitrina pública `/explora` + ficha `/servicio/[id]`, navegable
(buscar/filtrar) e instrumentada con Vercel Analytics. Además se hizo un **reset
de la data de prueba** para operar desde cero.

Este documento re-evalúa el negocio COMPLETO en este nuevo estado y entrega un
plan priorizado.

Evidencia base: advisors de seguridad de Supabase (91 hallazgos, **0 ERROR**) y un
barrido técnico del repo (133 archivos TS/TSX, 41 commits, 1 autor). El detalle con
rutas concretas está en las secciones de Debilidades/Amenazas.

---

## FODA

### Fortalezas (internas)
- **Wedge B2B en producción y en uso real.** Flujo cerrado catálogo → cotización
  (link/PDF) → venta con líneas → abonos (ledger) → recibo (folio atómico) →
  comisiones → cobranza. No es demo: opera ventas reales de las agencias.
- **Invariantes de dinero correctos por diseño.** Ledger append-only, saldo
  derivado, folios atómicos, plan suma=total. `verificar_invariantes()` reporta
  **0 violaciones en prod**.
- **Seguridad sólida.** RLS multi-agencia probada adversarialmente; advisors sin
  un solo ERROR, sin RLS deshabilitado, sin PII de ventas expuesta.
- **Tesis de siembra ejecutándose.** El OS siembra oferta/proveedores/datos; el
  agente libre ya modela el marketplace; y ahora la **vitrina B2C está viva** —
  el primer eslabón de 🅰️ construido sobre el schema existente, sin cold-start.
- **Cobros y automatización más allá del v1.** MP Checkout Pro validado en prod
  (SPEI real); Clawbot (recordatorios semi-auto por WhatsApp) + salud/observabilidad.
- **Ventaja de fundador-operador.** Walfre opera 3 agencias reales → distribución
  propia + validación de producto de primera mano. No construye a ciegas.
- **Ejecución rápida, stack simple.** Monolito Next.js + Supabase, deploy continuo;
  mucho terreno cubierto en poco tiempo sin sobre-ingeniería.

### Debilidades (internas — con evidencia)
- **Cero tests. Crítico en rutas de dinero.** 0 archivos de test, 0 config, 0 deps
  de testing. `register_payment`, `emit_receipt`, planes, comisiones, wallet: sin
  cobertura. La única red es un cron que detecta violaciones *a posteriori*, no las
  previene.
- **La BD no está versionada como migraciones — y el respaldo ya quedó viejo.** La
  fuente de verdad es solo el Supabase remoto. El snapshot de respaldo committeado
  (`supabase/snapshots/`) **ya no refleja prod**: faltan ~10 funciones que el código
  llama (`salud_sistema`, `clawbot_bandeja`, `get_public_service`,
  `list_public_services`, etc.). El "riesgo #1" que se dio por mitigado sigue abierto.
- **Webhook de MP sin verificación de firma.** `src/app/api/mp/webhook/route.ts` no
  valida el HMAC `x-signature`; el endpoint es público. *Matiz honesto:* la integridad
  de fondos SÍ está protegida (re-consulta el pago a la API de MP antes de abonar, así
  que un webhook falso no fabrica un pago "approved"). Pero el endpoint sin auth
  permite abuso/enumeración y **siempre responde 200**, ocultando fallos.
- **Type-safety renunciada en flujos de pago.** `database.types.ts` se mantiene **a
  mano** (2858 líneas) y 12 usos de `as never` fuera de RPCs escriben a tablas sin
  tipado — incluido `payment_intents` en el flujo de cobro. Deriva garantizada
  respecto al schema real.
- **Validación de entrada ad-hoc + errores crudos al cliente.** Sin esquema (no zod);
  varias actions pasan fechas/strings directo al RPC. Los errores devuelven el
  mensaje crudo de Postgres al cliente (fuga de detalles internos).
- **Un solo entorno (prod), sin staging.** push a `main` → deploy directo a prod. MP
  solo es probable en producción con dinero real (el sandbox nunca sirvió).
- **La vitrina B2C aún no prueba nada.** Está viva pero **sin tráfico** y con CTA a
  WhatsApp (no checkout). Es una hipótesis instrumentada, no demanda validada.

### Oportunidades (externas)
- **Decidir el B2C con datos, no con fe.** Analytics ya mide vistas de `/explora` y
  clics al WhatsApp → gate objetivo para invertir (o no) en checkout self-service.
- **Cobranza proactiva → caja.** El motor ya existe (`/cobranza` + Clawbot); explotarlo
  reduce cartera vencida sin construir nada nuevo.
- **Vender el OS como SaaS a otras agencias.** El back-office es genérico; hay un
  mercado B2B recurrente más allá de las 3 agencias propias — y cada agencia nueva
  **siembra más oferta** para el marketplace. (Palanca estratégica nueva a evaluar.)
- **Openpay (BBVA) para SPEI sin fee de tarjeta** cuando el volumen lo justifique; el
  campo `payment_intents.provider` ya lo soporta sin cambio de schema.
- **CFDI/SAT como producto aparte** — desbloquea facturar formal (techo legal actual).
- **Marketplace/influencers (🅰️)** — el sueño, ya con oferta sembrada.

### Amenazas (externas / estructurales)
- **Bus factor = 1.** 41/41 commits de un solo autor. Si el fundador se detiene, todo
  se detiene.
- **BD frágil estructuralmente.** Fuente de verdad solo en Supabase remoto + **schema
  compartido con otras apps** (`tiendas`, etc.) → blast radius fuera del control del repo.
- **Dependencia de un solo PSP (MP).** Riesgo de plataforma/tarifa/estabilidad.
- **Regulación SAT/CFDI.** Facturar sin CFDI tiene techo; un cambio regulatorio aprieta.
- **PII vía capability-URLs.** `/estado`, `/recibo`, `/cotizacion` dependen de que el
  token sea inadivinable; una fuga de link expone datos del cliente sin sesión.
- **Coordinación multi-agente por convención**, no por herramienta → riesgo de colisiones
  y de tipos que divergen del schema.
- **Higiene de seguridad pendiente (menor).** Bucket `wa-media` permite listar archivos;
  funciones `clawbot_*`/`wallet_*` (dormidas) tienen grant `anon` que conviene
  confirmar o revocar. Nada urgente, ningún ERROR.

---

## Lectura estratégica (el "so what")

El instinto natural es empujar más B2C — se acaba de lanzar la vitrina y es
tentador. **Reto de CTO: no lo hagas todavía.** La vitrina ya está instrumentada y
su siguiente paso (checkout) está *correctamente en pausa hasta que Analytics hable*.

La exposición real no está en el B2C lento — está en que **el motor de dinero B2B
corre plata real sobre una base frágil**: cero tests, un webhook de pago sin firma,
un solo entorno prod sin staging, y una BD cuya única verdad vive en un Supabase
remoto compartido con respaldo desactualizado. Un solo incidente (BD perdida, deploy
malo sin red, endpoint abusado) es **existencial**, y hoy es más probable que
lastime que un lanzamiento B2C tibio. Por eso el P0 es **endurecer el motor de
dinero** — justo el trabajo poco glamoroso que es tentador saltarse. Sin caer en el
otro extremo: son pocos movimientos de alto apalancamiento, no una re-arquitectura.

---

## Plan priorizado

### P0 — De-riesgar el motor de dinero (existencial si falla)
1. **Versionar la BD de verdad. ✅ Hecho (2026-07-12, commit `4a7b454`).** Se cerró
   con un **dump fiel**, no con `db pull`. Descubrimiento clave: `db pull`/`db push`
   **no aplican aquí** — el proyecto Supabase es compartido con apps hermanas
   (war-room/crm/tiendas) y su historial `schema_migrations` es un log lineal global
   de **89 migraciones, solo 33 de Ketzal**; `pull` da `LegacyDbPullMigrationConflictError`
   y `migration repair` reescribiría bookkeeping ajeno. En su lugar:
   `supabase db dump --schema ketzal -f supabase/snapshots/ketzal_schema.sql`
   (pg_dump fiel: 25 tablas/25 RLS, 49 funcs con cuerpo, 58 policies, 28 índices,
   148 grants). Superó y reemplazó los 2 snapshots parciales stale. **Workflow going
   forward:** re-correr el dump tras cada cambio de BD y commitear; el `git diff` del
   dump es el historial de schema. Detalle en `supabase/README.md`.
2. **Firmar el webhook de MP. ✅ Cerrado y VERIFICADO EN PROD (2026-07-19).**
   `src/lib/mp-signature.ts` valida el HMAC `x-signature`/`x-request-id`; el webhook rechaza
   con **401** si falta o no cuadra, en vez de responder 200 a ciegas. (La integridad de
   fondos ya estaba protegida por re-consulta a la API de MP; esto cierra el
   abuso/enumeración del endpoint.)
   Código: commit `842bca6`. **Estuvo INERTE del 2026-07-11 al 2026-07-19** porque el
   enforcement es **fail-open por diseño** (`route.ts:41-56`, rollout no-rompedor) y
   `MP_WEBHOOK_SECRET` nunca se había agregado a Vercel. Ver P0 #3-bis.
   **Verificación (no basta con desplegar):** sonda `POST /api/mp/webhook?type=payment&data.id=999999999`
   sin header `x-signature` → **401 `invalid_signature`** + fila en `system_log`
   (`mp_webhook / error / "firma inválida" / {hasSignature: false}`). Antes del deploy ese
   mismo POST daba 200.
   **Cabo suelto menor:** la sonda prueba que el enforcement corre y que el secret está en el
   deployment, no que el *valor* sea el del panel de MP (el fundador confirma que sí lo es).
   La prueba definitiva es el próximo cobro real: si sale `pago confirmado` y no
   `firma inválida`, cerrado del todo.
3. **Tests mínimos de invariantes de dinero. ✅ Hecho (commit `d0a2391`).** Harness ligero
   en SQL `supabase/tests/money_invariants.sql` (sin framework) sobre las invariantes de
   dinero (saldo derivado, plan suma=total, folio). Red que falla si la lógica se rompe.

3-bis. **✅ Cerrado y VERIFICADO EN PROD (2026-07-19) — dos env vars que nunca se agregaron
   a Vercel (detectado 2026-07-18).** Auditoría `process.env` del código vs
   `vercel env ls production`: en Vercel solo existían `MP_ACCESS_TOKEN`,
   `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_URL`.
   Faltaban dos, con consecuencias opuestas:
   - **`CRON_SECRET` — outage silencioso.** `api/clawbot/tick/route.ts:10-14` es
     **fail-closed**: sin el secret devuelve **401 siempre**. `vercel.json` agenda el cron
     `0 14 * * *` desde el 2026-07-10. **Confirmado en `ketzal.system_log`: cero filas
     `clawbot_tick`, nunca.** ⇒ Clawbot estuvo **8 días muerto**: ningún recordatorio de
     cobranza generado y ningún chequeo diario de invariantes de dinero corrido. El panel
     de `/salud` reportaba "0 violaciones" porque **nadie estaba midiendo**, no porque
     estuviera sano.
   - **`MP_WEBHOOK_SECRET` — seguridad inerte.** Fail-open (ver P0 #2): el webhook aceptaba
     sin firma. 7 días así.
   `NEXT_PUBLIC_APP_URL` y `NEXT_PUBLIC_SITE_URL` también faltan pero **tienen fallback**
   (`?? https://${host}` y `VERCEL_PROJECT_PRODUCTION_URL`): no se agregan, YAGNI.

   **Cierre (2026-07-19).** Ambas agregadas a Production + **redeploy** (las env vars se
   congelan en el snapshot del deployment: agregarlas sin redesplegar no hace nada — el
   deploy vigente seguía sin ellas). Verificado con evidencia, no por inspección:
   - Webhook: sonda sin firma → 401 + `firma inválida` en `system_log` (ver P0 #2).
   - Clawbot: **primer tick de la historia**, `2026-07-19 02:35:04Z` →
     `clawbot_tick / info / "recordatorios generados" {pendientes: 0}` +
     `invariantes / info / "invariantes OK" {violaciones: 0}`. Ese `violaciones: 0` es el
     **primero medido de verdad**.
   **Gotcha operativo:** ambos secrets se guardaron como `--sensitive`, así que
   `vercel env pull` los devuelve **vacíos** (longitud 0) y no se pueden leer de vuelta.
   No importa y **no hay que rotarlos**: Vercel inyecta el `Authorization: Bearer` solo.
   Para disparar el cron a mano sin conocer el valor: **`vercel crons run /api/clawbot/tick`**
   (`vercel crons ls` para listarlos). Si el secret no estuviera en el deployment, el
   trigger daría 401 y no habría filas — o sea, el trigger exitoso *es* la verificación.
   **Lección:** un item marcado ✅ por código commiteado no está hecho hasta que su
   configuración vive en prod **y algo en prod lo demuestra**. Verificar env vars al cerrar,
   no al escribirlo.

3-ter. **⏳ ABIERTO (pendiente de confirmación, 2026-07-19) — validar `clawbot_generar_recordatorios`
   contra `/cobranza`.** El primer tick devolvió `{pendientes: 0}`. Es plausible (puede que
   nada venza hoy), pero **no está confirmado**: nunca se ha visto a Clawbot generar un
   recordatorio real, porque nunca había corrido. **Cómo cerrarlo:** abrir `/cobranza` y
   comparar. Si ahí hay abonos atrasados/por vencer y el tick sigue devolviendo
   `pendientes: 0`, el bug está en el RPC `clawbot_generar_recordatorios`, **no** en la
   infra (que ya quedó probada). Si `/cobranza` también sale vacío, no hay nada que cobrar
   y el 0 es correcto.

### P1 — De-riesgo estructural + el loop de medición B2C
4. **Higiene de seguridad de advisors** (barato). Advisor: 91 hallazgos, **0 ERROR**.
   **✅ Hecho (2026-07-12, migraciones `ketzal_p1_security_hygiene` + `_2`):**
   (a) quitado el listado del bucket público `wa-media` (drop de la policy SELECT
   anon/authenticated; los reads siguen por el CDN público);
   (b) revocado `EXECUTE` de PUBLIC en `clawbot_*` y `notification_create_self` (la app
   las llama como `authenticated`, grant intacto) y de PUBLIC+`authenticated` en
   `wallet_*` (DEFINER, B2C dormido, 0 usos; se conserva `service_role`);
   (c) pinado `search_path` de `ketzal.set_updated_at` (era la única función ketzal con
   search_path mutable).
   **Aceptado por diseño (no se toca):** `is_superadmin()`/`my_supplier_id()` quedan
   anon-ejecutables — la RLS las evalúa como el rol que consulta y **no** tienen grant
   explícito a `authenticated` (lo heredan de PUBLIC), así que revocar PUBLIC tumbaría
   toda la RLS; para anon devuelven `false`/`null` (inofensivo). Los 26 DEFINER
   ejecutables por `authenticated` son la superficie legítima de RPCs (guardas internas
   vía RLS/`is_superadmin`). `ketzal.receipt_counters` con RLS sin policy es correcto
   (solo se toca vía el RPC atómico `next_receipt_folio`).
   **Pendiente del fundador (dashboard, no hay SQL):** (i) activar *protección de
   contraseñas filtradas* (HaveIBeenPwned) en Supabase Auth; (ii) el bucket público
   `gorilla-assets` también permite listar, pero es del org (otra app) — decidir aparte.
5. **No propagar errores crudos de Postgres al cliente.** **✅ Hecho (2026-07-12):**
   helper `src/lib/errors.ts` (`safeError`) — los RPCs de negocio lanzan con
   `raise exception` (SQLSTATE `P0001`, mensaje autoral) y se muestran tal cual; cualquier
   otro código (constraint/permiso/tipo/RLS) se registra en el servidor y al cliente solo
   le llega un genérico. Cableado en los 8 `actions.ts` (los ~30 `return { error:
   error.message }`). Check runnable de 7 casos + typecheck OK.
6. **B2C: dejar correr Analytics y decidir con datos. ✅ Cerrado (2026-07-18) — veredicto
   NO-GO al checkout self-service.** Lectura de Vercel Analytics, 7 días (11–18 jul, prod):
   **8 visitantes, 62 page views, 0 referrers, 100% MX**. Top pages son **todas internas**
   (`/servicios` 7, `/dashboard` 6, `/servicios/nuevo` 5, `/cotizaciones` 4, `/proveedores` 4,
   `/clientes` 3, `/salud` 3). **`/explora` no aparece: cero.** Esos 8 visitantes son el
   fundador y sus agentes operando el OS (desktop Linux + Android, sin un solo referrer).
   **Matiz que importa:** el resultado NO es "el mercado rechazó B2C", es **"el experimento
   nunca corrió"** — la vitrina no tuvo distribución (ni link en bio, ni WhatsApp a clientes).
   Una página a la que nadie es enviado marca cero para siempre. La hipótesis B2C **no queda
   archivada, queda sin probar**.
   **Además:** los clics a WhatsApp **nunca se midieron** — los custom events de Vercel
   Analytics son **Pro-only** y el proyecto está en Hobby. La mitad de la métrica del gate
   era inmedible desde el día uno.
   **Siguiente corrida (acordada 2026-07-18):** el fundador le da distribución esta semana
   (link de `/explora` por WhatsApp a clientes que ya compraron + bio de Instagram de
   Wanderlust). Métrica sustituta gratis: **page views de `/servicio/[id]`** (llegar a una
   ficha ya es intención; el plan Hobby sí las cuenta). Si con distribución real sigue en
   cero, ahí sí el veredicto es del mercado y B2C se archiva con datos.

### P2 — Cuando el equipo/volumen lo justifiquen (no ahora — YAGNI)
7. Validación con esquema (zod) en las actions de dinero.
8. Entorno de staging (Supabase branch) para no probar en prod.
9. Explorar **OS-como-SaaS a otras agencias** (validar apetito antes de construir).
10. Roadmap conocido: CFDI/SAT, checkout self-service (*gated* por señal B2C),
    Openpay, marketplace/influencers.
