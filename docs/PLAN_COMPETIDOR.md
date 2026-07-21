# Plan competidor — comparativo y fases de implementación

> Comparativo de Ketzal OS contra el listado de funciones de un back-office
> competidor (estilo tradicional mexicano: expedientes, foliados, mayoristas,
> grupos y bodas), verificado contra el código real (2026-07-21). Alcance
> aprobado por el fundador. Referencia viva para ambos agentes (backend y UI/UX).

## Veredicto general

De ~59 funciones del competidor, Ketzal OS ya cubre ~60% (y tiene cosas que el
competidor no: pago en línea MP validado en prod, links públicos compartibles,
PWA, marketplace B2C en construcción). Lo faltante apto se ordenó en 7 fases.
Lo no-apto se descartó con razón explícita (ver al final).

## Comparativo (resumen)

Leyenda: ✅ ya lo tiene · 🟡 parcial · ❌ falta (apto) · 🚫 descartado

| Área | Competidor vs Ketzal OS |
|---|---|
| Catálogos | Clientes ✅ · Proveedores ✅ · Mayoristas 🟡 (agencias dueñas + comisión; falta CxP) · Gastos ❌→F2 · Cuentas bancarias 🚫 (fuera de alcance) |
| Expedientes | Cotizaciones ✅ · Ventas ✅ · Pagos ✅ · Saldos ✅ (derivado) · Alarmas ✅ (Clawbot) · Pasajeros ❌→F3 · Divisas 🟡→F6 · Pagos a mayoristas ❌→F2 · Crédito corporativo 🚫 · 12 estatus 🚫 (5 estados reales bastan) |
| Reportes | Ventas/Comisiones/Por agente ✅ · CxC ✅ (/cobranza) · Pago clientes ✅ · CxP ❌→F2 · Metas ❌→F5 · Productividad 🟡→F5 · Bancos 🚫 · Créditos corp. 🚫 |
| Documentos foliados | Recibo ✅ (foliado, con letra) · Balance ✅ (/estado) · Desglose ✅ · Reembolso ✅ · Anticipo ✅ (enganche) · Cotización 🟡 sin folio→F1 · Voucher ❌→F4 · Itinerario 🟡 (vive en cotización) · Autorización cargo tarjeta 🚫 (PCI; MP procesa) |
| Grupos y Bodas | Módulo completo 🚫 (el negocio son tours con salidas, no cuartos-noche). Su esencia se cubre en versión tour: rooming list = manifiesto por salida (F3), expediente del grupo = vista de salida (F3), anticipos = plan de pagos ✅, inventario = salidas ✅ |

## Las 7 fases (orden por dependencias)

> Reparto por fase: **backend** = migraciones/RPCs/actions/dinero · **UI/UX** =
> rutas/vistas/documentos/nav. Transversal: migraciones vía `apply_migration` +
> espejo en `db/proposed/`; cero ediciones a `database.types.ts` (casts
> `as never`); tras cada fase advisors = 0 y `verificar_invariantes()` = 0;
> re-apply de RPCs desde el DDL vivo conservando keys previas (lección
> `agency.id`).

### F1 — Folio de cotización COT-n
Infra genérica de folios por serie: tabla `doc_counters (supplier_id, series,
last_folio)` (series 'cotizacion', 'voucher'; `receipt_counters` NO se toca) +
RPC `next_doc_folio` (clon de `next_receipt_folio`). `bookings.quote_folio`;
`create_booking_with_items` asigna folio al crear draft (mismo scope que
`emit_receipt` para agentes libres); el folio se conserva al convertir.
`get_quote_by_token` expone `folio`. UI: COT-n en lista, documento público y
badge "Origen: COT-n" en la venta. Invariante: `folio_cot_duplicado`.

### F2 — Gastos + CxP a mayoristas (light)
Tabla `expenses` append-only (kind egreso|reverso, corrección por
contra-asiento, categorías cortas; 'mayorista' exige `provider_supplier_id`).
RPCs: `create_expense`, `reverse_expense`, `expenses_summary`,
`payables_summary` (CxP por agencia dueña: debo = Σ(total − comisión) de
reventas confirmadas/pagadas − pagos 'mayorista'). Decisión: pagos a mayorista
= filas de `expenses` (un solo ledger de egresos ⇒ utilidad sin doble
contabilidad; NO tabla aparte). UI: ruta `/gastos` (admin) + cards
"Gastos"/"Utilidad" en `/reportes` + CSV. Invariantes:
`gasto_reverso_incoherente`, `gasto_doble_reverso`, `cxp_sobrepago`.

### F3 — Pasajeros + manifiesto + vista de salida
Tabla `booking_passengers` (nombre, tipo, doc opcional; editable — no es
dinero; captura posterior a la venta). RPC `get_departure_detail` (DEFINER con
guard: solo agencia dueña del servicio) — cross-tenant deliberado: el
manifiesto lleva TODOS los pax del camión (incl. reventas) pero el dinero SOLO
de ventas propias. RPC `list_departures`. UI: `/salidas` (lista con ocupación),
`/salidas/[id]` (vista de salida ≈ expediente de grupo: ventas, ocupación,
cobrado/saldo), `/salidas/[id]/manifiesto` (imprimible, CON sesión — PII, sin
token público), sección captura en `/ventas/[id]`. Invariante:
`pax_vs_num_pax` (warning).

### F4 — Voucher de servicio foliado
Tabla `vouchers` (uuid = token público, unique por booking, folio serie
'voucher'). `emit_voucher` idempotente (reserved/confirmed/paid);
`get_voucher_public` anon fail-closed y **sin montos** (acredita el servicio,
no el dinero). UI: ruta pública `/voucher/[id]` (calco de `/recibo/`), botón en
la venta, allowlist en `proxy.ts` (no olvidar).

### F5 — Metas por agente + productividad
Tabla `sales_goals` (meta mensual por agencia y/o agente; escritura solo vía
RPC con guard admin). RPC `goals_progress`. `reports_summary` gana `conversion`
(cotizadas = count(quote_folio), convertidas, tasa — habilitado por F1), solo
keys aditivas (es hub de dashboard/reportes/CSV). UI: card metas en `/equipo`,
avance + columnas de conversión en `/reportes`.

### F6 — Divisas: TC manual light (USD)
`bookings.exchange_rate` + checks (MXN ⇔ rate null). **El motor entero sigue
MXN**: al vender en USD el RPC convierte al registrar (original en
`booking_items.meta`); payments/reportes/cobranza intactos. Documentos muestran
"Precios en USD · TC · MXN autoritativo". UI: selector MXN/USD + TC en nueva
venta. Invariantes: `divisa_sin_tc`, `tc_fuera_de_rango` (TC USD ∉ [5,50] ⇒
warning, detecta dedazos).

### F7 — Clawbot: 3 reglas nuevas
`saldo_sin_plan` (venta de contado con saldo ≥3 días — hoy solo se persigue a
quien tiene plan), `viaje_manana_operativo` (interno al agente: pax capturados
X/Y + link al manifiesto; depende de F3), `pago_sin_recibo` (abono sin recibo
tras 24h). Descartada `cupo_por_llenarse` (sin datos para calibrar umbral).
Ampliar check de kinds + re-apply `clawbot_generar_recordatorios` y
`clawbot_resumen` (dedupe_key idempotente). El cron no cambia.

## Descartados (no implementar sin nueva decisión)

- **Autorización de cargo en tarjeta**: capturar datos de tarjeta manual = riesgo
  PCI; Mercado Pago ya procesa el cargo.
- **Créditos corporativos / línea de crédito B2B**: fuera del wedge; el plan de
  abonos cubre el crédito real del negocio.
- **12 estatus automatizados**: los 5 estados reales
  (draft/reserved/confirmed/paid/cancelled) bastan.
- **Módulo completo Bodas/cuartos-noche/venta maestra**: el negocio son tours
  con salidas; F3 cubre la esencia en versión tour.
- **Cuentas bancarias y conciliación**: fuera del alcance aprobado (los métodos
  de pago actuales bastan por ahora).
