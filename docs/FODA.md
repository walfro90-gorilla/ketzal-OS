# FODA general — Ketzal OS

> Actualizado: **2026-07-23** · Reemplaza el FODA del 2026-07-11 (cuyo plan P0 de
> de-riesgo del motor de dinero quedó **ejecutado**). El detalle histórico de los
> FODA previos (07-09, 07-11) y de la campaña de hard-testing de dinero (P0-bis)
> vive en el historial de git y en `supabase/tests/`.

## Contexto (por qué este FODA ahora)

Desde el FODA anterior el proyecto **cruzó de "wedge B2B endurecido" a "suite
casi completa + B2C construido"**. Lo que cambió:

- **Plan competidor 7/7 ejecutado** (`docs/PLAN_COMPETIDOR.md`): folio de
  cotización (F1), gastos + CxP a mayoristas + utilidad (F2), pasajeros +
  manifiesto + vista de salida (F3), voucher de servicio foliado (F4), metas por
  agente + conversión (F5), divisas USD con TC manual (F6), Clawbot con 3 reglas
  operativas nuevas (F7). El back-office ya **empata o supera** al competidor de
  referencia.
- **Vitrina B2C pública completa e indexable**: `/explora`, `/agencias`,
  `/agencia/[id]`, `/servicio/[id]` + perfiles de agencia + logo de marca
  configurable.
- **Marketplace terreno B.0/B.1**: comprador B2C aislado (`marketplace_customers`),
  `/comprar`, órdenes, pago en línea + planes de abono, ratings post-viaje, y
  **shell del viajero** (mis-compras / mis-viajes, voucher del viajero).
- **Cobranza 100% automática**: el Clawbot ya no requiere el clic del agente — un
  **worker de WhatsApp (Baileys) corre en "la box"** (`wa-sender/`, PM2, fuera de
  Vercel) y envía los recordatorios solo (gated).
- **Dos agentes de desarrollo en paralelo** (Opus = backend/dinero, Fable =
  UI/UX/marketplace) sobre el mismo repo y la misma BD.
- **Motor de dinero endurecido** (P0/P0-bis del FODA anterior): BD versionada
  (snapshot pg_dump), webhook de MP firmado, tests SQL de invariantes,
  env vars de prod cerradas, hard-testing adversarial que cerró sobrepago /
  reembolso inflado / recibo duplicado.

Evidencia base: **168 commits** (1 solo autor humano — Walfre; "Claude" = los
agentes que dirige), **247 archivos TS/TSX**, advisors de seguridad **0 ERROR /
107 WARN** (todas baseline de funciones `SECURITY DEFINER` + 1 de contraseñas
filtradas pendiente en el dashboard). Detalle con rutas en Debilidades/Amenazas.

---

## FODA

### Fortalezas (internas)
- **Back-office competitivo y completo.** Flujo cerrado catálogo → cotización
  (folio + link/PDF) → venta con líneas → abonos (ledger) → recibo (folio
  atómico) → comisiones → cobranza, **más** gastos/CxP/utilidad, pasajeros +
  manifiesto por salida, vouchers foliados, metas + conversión, y ventas en USD.
  7/7 vs el competidor de referencia.
- **Motor de dinero correcto por diseño Y hard-testeado.** Ledger append-only
  (aplicado en la BD, no solo la app), saldo derivado, folios atómicos, planes
  con Σ=total. Probado adversarialmente bajo 2 agencias QA con JWT real:
  sobrepago, reembolso inflado, recibo duplicado y carreras de cupo/abonos
  **cerrados**; `verificar_invariantes()` = 0 sobre ventas reales.
- **Seguridad sólida y medida.** Advisors **0 ERROR**; RLS multi-agencia probada;
  superficie anónima auditada (23 pruebas de caja negra); lectura de `suppliers`
  cerrada a lo propio (migración 006 — la comisión ajena ya no se filtra);
  webhook de MP con firma HMAC verificado en prod.
- **Cobranza proactiva automática.** Clawbot (7 reglas) + **envío automático por
  WhatsApp** (ya no 1-clic) + salud/observabilidad. El motor está diseñado para
  escalar a envío 100% auto sin rehacerse.
- **B2C sembrado end-to-end.** El eslabón 🅰️ ya tiene esqueleto real: vitrina
  pública indexable + comprador aislado + órdenes + pago en línea (MP validado) +
  ratings + shell del viajero. Todo sobre el schema existente, sin cold-start.
- **Ventaja fundador-operador + ejecución rápida.** Walfre opera 3 agencias reales
  (distribución + validación de primera mano); 168 commits en semanas, monolito
  Next.js + Supabase, deploy continuo, sin sobre-ingeniería.

### Debilidades (internas — con evidencia)
- **Cero tests de aplicación (TS).** 0 configs de test JS/TS, 0 `*.test.ts`, sobre
  **247 archivos**. La única red es SQL (`supabase/tests/`: invariantes,
  hard-testing de dinero, superficie anónima) — excelente para la BD, pero **nada
  cubre la capa TS**: actions, RPC-wrappers, componentes, flujos de UI. Un refactor
  de `actions.ts` no tiene red.
- **Type-safety erosionándose.** `database.types.ts` sigue **a mano** (2858 líneas)
  y los `as never` crecieron de 12 → **34 archivos** en `src/app` (F5/F6/F7 +
  marketplace). Cada cast escribe/lee tablas sin tipado real → punto ciego respecto
  al schema; con 2 agentes el drift se acelera.
- **Coordinación multi-agente frágil — ya mordió.** 2 agentes sobre una sola BD y
  un solo `main`, aislados solo por **convención + worktrees** (que aíslan
  archivos, NO la BD). Esta semana: colisión de numeración en `db/proposed`
  (6 pares 011–016) y **un build de `main` roto** (import a un módulo borrado por
  un `git add` con rutas `[id]` que git trató como glob). Mitigado a medias
  (convención de prefijos `b/m` en `db/proposed/README.md`); el root cause sigue.
- **Migraciones fuera del ledger.** La migración del worker de WhatsApp
  (`wa_autosend`) **no aparece en `list_migrations`** (se aplicó por fuera de
  `apply_migration`). El "riesgo #1" que el FODA anterior dio por mitigado —BD como
  única fuente de verdad, snapshot versionado— **reabre**: hay cambios de schema
  que el `supabase/snapshots/` no captura.
- **WhatsApp no-oficial (Baileys) = superficie nueva y riesgosa.** El auto-send
  corre en "la box" (PM2), fuera de Vercel y del repo desplegado. (a) **Riesgo de
  ban** del número dedicado por Meta (integración no-oficial enviando en
  automático); (b) **nueva superficie ops sin observabilidad de primera clase** —
  si el poller/bridge cae, el envío para en silencio (mismo patrón de los 8 días de
  Clawbot muerto por una env var).
- **Un solo entorno (prod), sin staging.** Sin cambio: push a `main` → prod. MP solo
  es probable con dinero real (el sandbox nunca sirvió).
- **B2C construido pero sin validar.** Vitrina + marketplace + shell del viajero
  están hechos, pero el **experimento de distribución nunca corrió** (0 tráfico
  externo medido). Mucho código B2C apalancado sobre una hipótesis aún no probada.

### Oportunidades (externas)
- **OS-como-SaaS a otras agencias.** Con el back-office 7/7, la propuesta B2B
  recurrente es más fuerte — y cada agencia nueva **siembra más oferta** para el
  marketplace. Palanca estratégica a validar (apetito antes de construir).
- **Cobranza automática → caja.** El auto-send WhatsApp ya existe; prenderlo con
  gate reduce cartera vencida sin construir nada nuevo.
- **Decidir B2C con datos.** Vitrina + marketplace están listos; falta solo
  distribución para tener el gate objetivo (page views de `/servicio/[id]`).
- **Openpay (BBVA)** para SPEI sin fee de tarjeta cuando el volumen lo justifique
  (`payment_intents.provider` ya lo soporta); **CFDI/SAT** como producto aparte;
  **marketplace/influencers (🅰️)** con oferta ya sembrada.

### Amenazas (externas / estructurales)
- **Ban de WhatsApp (Baileys) — NUEVA y material.** El auto-send no-oficial puede
  tumbar el número dedicado de un día para otro; pega directo a la cobranza
  automatizada, que ahora depende de él.
- **La box como single point of failure ops.** El worker fuera de Vercel, sin
  monitoreo de primera clase → outage silencioso (patrón ya visto).
- **Coordinación 2-agentes sobre BD/`main` compartidos.** Colisiones, migraciones
  sin ledger y tipos que divergen del schema. Ya materializado, mitigado a medias.
- **Bus factor = 1 humano.** 168 commits, un solo autor humano. Si el fundador se
  detiene, todo se detiene.
- **BD frágil estructuralmente.** Fuente de verdad solo en Supabase remoto +
  **schema compartido con apps hermanas** (`tiendas`, war-room/crm) → blast radius
  fuera del repo. El snapshot puede quedar stale (agravado por migraciones fuera
  del ledger).
- **PII vía capability-URLs.** `/estado`, `/recibo`, `/cotizacion`, `/voucher`
  dependen de que el token uuid sea inadivinable; una fuga de link expone datos del
  cliente sin sesión.
- **Regulación SAT/CFDI** (techo para facturar formal) y **dependencia de un solo
  PSP (MP)** — sin cambio.

---

## Lectura estratégica (el "so what")

El P0 del FODA anterior —de-riesgar el motor de dinero B2B— **está ejecutado**, y
eso bajó la exposición existencial #1. Pero corriendo rápido se abrieron **dos
frentes nuevos de riesgo operativo** y **una deuda que crece con cada feature**:

1. **Automatización de WhatsApp por Baileys**: ban del número + box sin monitoreo.
   Puede tumbar la cobranza automatizada sin aviso.
2. **Coordinación de 2 agentes sobre una BD/`main` sin aislamiento real**: ya rompió
   el build una vez y mete migraciones fuera del ledger (el snapshot vuelve a poder
   mentir).
3. **Deuda de calidad**: cero tests de app + `as never` ×34 + tipos a mano. La
   velocidad de shipping se está pagando en type-safety y en ausencia de red.

**Reto de CTO:** el P0 nuevo **no es más features**. El back-office ya es
competitivo y el B2C ya está construido (pero sin probar). El trabajo de mayor
apalancamiento es **consolidar lo que se corrió rápido** — monitorear/gating el
worker, cerrar las migraciones sueltas, y poner la primera red de tests en las
rutas de dinero — **más** el experimento B2C que cuesta $0 en código. Son pocos
movimientos, no una re-arquitectura.

---

## Plan priorizado

### P0 — Consolidar el riesgo operativo nuevo
1. **Gating + monitoreo del worker de WhatsApp.** Confirmar que `wa_auto_enabled`
   nace **off** y que límite diario + ventana hábil + opt-out están activos;
   agregar un health-check de la box al panel `/salud` (que alerte si el
   poller/bridge cae, como el cron de Clawbot); documentar el plan si banean el
   número (fallback a envío 1-clic, que sigue existiendo).
2. **Cerrar las migraciones fuera del ledger + re-dump del snapshot.** Reaplicar
   `wa_autosend` (y cualquier cambio hecho por `execute_sql`) vía `apply_migration`,
   y re-correr `supabase db dump --schema ketzal` para que el snapshot vuelva a
   reflejar prod. Cierra la reapertura del "riesgo #1".
3. **Primera red de tests de app en rutas de dinero.** Aunque sea un smoke test de
   las actions críticas (`createBooking`, `register_payment`, `refund`,
   `emit_receipt`): hoy la capa TS tiene **0 cobertura**. El hard-testing SQL cubre
   la BD, no el camino app→RPC.

### P1 — Deuda de coordinación + medición B2C
4. **Frenar el drift de tipos.** Regenerar `database.types.ts` (o al menos tipar las
   tablas nuevas: `expenses`, `booking_passengers`, `vouchers`, `sales_goals`,
   `marketplace_customers`, `doc_counters`) para bajar los 34 `as never`. Dueño
   único de tipos, como manda `docs/WORKTREES.md`.
5. **B2C: correr el experimento de distribución** (acordado 2026-07-18, sin código).
   Link de `/servicio/[id]` por WhatsApp a clientes + bio de IG de Wanderlust;
   re-medir page views de `/servicio/[id]`. Si sigue en cero con distribución real,
   ahí sí el veredicto es del mercado.
6. **Toggles del fundador (dashboard, sin código).** Activar protección de
   contraseñas filtradas (HaveIBeenPwned) en Supabase Auth; decidir sobre el bucket
   `gorilla-assets` (es del org).

### P2 — Cuando el equipo/volumen lo justifiquen (no ahora — YAGNI)
7. Entorno de **staging** (Supabase branch) para no probar en prod.
8. Validación con esquema (**zod**) en las actions de dinero.
9. Explorar **OS-como-SaaS a otras agencias** (validar apetito antes de construir).
10. Roadmap conocido: CFDI/SAT, checkout self-service (*gated* por señal B2C),
    Openpay, marketplace/influencers.

---

## Historial

- **2026-07-23 (este doc):** re-FODA al estado post plan-competidor 7/7 + B2C
  construido + auto-send WhatsApp + 2 agentes. P0 = consolidar riesgo operativo.
- **2026-07-11:** wedge B2B endurecido; P0 de-riesgo del motor de dinero →
  ejecutado (BD versionada, webhook firmado, tests de invariantes, env vars,
  hard-testing adversarial). Detalle en git.
- **2026-07-09:** primer FODA; plan 5/5 (cobranza, MP en prod, Clawbot,
  invariantes, snapshot). Detalle en git.
