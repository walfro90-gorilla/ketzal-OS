# Operación de viaje — pagos, viajeros, asientos y abordaje

> Construido y validado en prod el 2026-08-03/04 (migraciones b034–b046).
> Todo probado manualmente por el fundador + hard-tests SQL en rollback por capa.
> Complementa `MARKETPLACE_TERRENO.md` (compra/pago) con la operación del viaje.

## El ciclo completo

```
COMPRADOR                                AGENCIA
─────────                                ───────
Explora → ficha (calendario de           Notificación push "Nueva cotización"
salidas + precios por temporada)         (+ badge "cliente nuevo")
    ↓
Crea pedido → paga:
 · Mercado Pago (tarjeta/SPEI MP)        Webhook → notificación "Pago recibido"
 · SPEI directo a CLABE de la agencia    "Transferencia por confirmar" →
 · Efectivo en cajero BBVA (tarjeta)       admin revisa COMPROBANTE en /cobranza
   — comprobante OBLIGATORIO               → Confirmar / Rechazar / Reabrir
    ↓
Plan de pagos checklist (verde/          Mismo checklist en /ventas +
ámbar/rojo, colapsable)                  plan CONGELADO con pagos
    ↓
Registra a sus VIAJEROS (tope num_pax)   Notificación "Lista de viajeros completa"
Elige ASIENTOS (layout del transporte)   Los ve en la venta y el manifiesto
    ↓
Recibe VOUCHER: asientos + QR firmado
                    ═══ DÍA DEL VIAJE ═══
Muestra el QR                            /abordaje: escanea → certificado ✓
                                         → check-in por viajero (asiento+hora)
                                         Buslist (por asiento) + Roomlist (hotel)
```

## Pagos SPEI directo (b034/b035/b037/b038)

- **CLABE por agencia** en `suppliers.info` (`spei_clabe/banco/titular/cuenta/tarjeta`),
  capturada en el form de proveedor con validadores de **dígito de control** (CLABE)
  y **Luhn** (tarjeta) — `src/lib/domain/clabe.ts`. Datos reales SOLO en BD (repo público).
- El pendiente vive en `payment_intents` (`provider='spei'`, `status='pending'`) — sin
  status nuevo de booking. **Comprobante obligatorio** (captura/ticket del cajero →
  `gorilla-assets/spei/{booking}/` → `receipt_url`; el RPC rechaza sin él).
- **Un solo camino de dinero**: aprobar reusa `confirm_online_payment` (+`p_method`,
  firma del webhook MP intacta). Rechazadas: visibles 14 días en /cobranza y
  **reabribles** (`reopen_spei_payment`); venta cancelada sugiere abono manual.
- Variante **efectivo en cajero BBVA**: sección con tarjeta de débito + instrucciones
  plegables; el ticket del cajero es el comprobante.
- Superficies: panel SPEI compartido (`spei-panel.tsx`) en /comprar y /mis-compras;
  bandeja en /cobranza + card en /ventas/[id] + KPI "Pagos por confirmar" en el Panel.

## Notificaciones (b036)

- **In-app**: campana en el header (tabla `notifications` — REUSA la del scaffold B2C,
  shape `message`/`action_url`; INSERT solo server; feed propio con RLS). Casi tiempo
  real: SW postMessage al llegar push + refetch on focus + polling 60s.
- **Push** (PWA instalada, app cerrada): `push_subscriptions` + `public/sw.js` +
  VAPID (`NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` en
  Vercel). Envío: `src/lib/push/send.ts` (`notificar`/`adminsDeAgencia`/`superadmins`).
- **6 eventos** (best-effort, jamás rompen el flujo): cotización recibida (+"cliente
  nuevo" si su ficha es de <5 min) · viajero nuevo · embajador nuevo · SPEI por
  confirmar · pago MP aprobado · lista de viajeros completa (N/N, no por alta).

## Plan de pagos checklist (b039 + admin)

- Renglón contra el pagado REAL del ledger: verde = acumulado cubierto, rojo =
  vencido, ámbar = próximo. En /mis-compras (`<details>` colapsado, "N/M pagados")
  y en /ventas (misma regla + saldo corrido).
- **Plan congelado** con ≥1 pago (sin "Quitar plan"; guard server-side espejo).
  Venta liquidada sin plan no ofrece crear plan (guard espejo).
- **Fecha límite automática** = última fecha del plan (ambos caminos de creación +
  backfill); sin plan la etiqueta es "Fecha límite para el 1er pago" (editable).

## Viajeros y asientos (b040/b041)

- **Acompañantes** (b040): el comprador registra a sus viajeros tras el 1er pago
  (nombre obligatorio, tipo, doc opcional; tope = num_pax; draft bloqueado). RPCs
  `list/add/remove_my_passenger` sobre `booking_passengers` (LA MISMA tabla de F3:
  el agente y el manifiesto los ven gratis).
- **Asientos** (b041): `services.transport_type` (autobús 2+2 · sprinter/van 1+2 ·
  avión 3+3; presets en `domain/seats`); TOTAL = `max_capacity` de la salida (sin
  campo duplicado). `seat_assignments`: unique(service,fecha,asiento) = candado
  anti-carrera; unique(passenger) = upsert; CASCADE al quitar pasajero; deny-all +
  RPCs DEFINER (`seat_map_for_booking`/`assign_seat`/`release_seat`) con guard dual
  comprador/staff (`puede_operar_booking`). UI compartida `seat-map`/`seat-picker`
  (teal disponible · azul seleccionado · rojo ocupado) en /mis-compras y /ventas.
- **⚠ Lección de seguridad (cazada por hard-test)**: un guard SQL sin `coalesce`
  evalúa NULL con ajenos (comparación vs supplier null) y `if not null` NO dispara.
  SIEMPRE `coalesce(guard, false)`.

## Voucher QR + abordaje (b042/b043)

- Voucher público: asiento por pasajero + bloque "Pase de abordaje" con **QR firmado**
  (`?c=` = HMAC-SHA256 del uuid; llave derivada del service key en
  `src/lib/voucher-cert.ts` — sin env nueva; verificación timing-safe; badge
  verde/rojo al escanear).
- **/abordaje** (nav): escáner con cámara (BarcodeDetector nativo + fallback link)
  → panel de check-in: cert verificado, aviso de saldo, viajeros por asiento,
  "Abordar" registra `boarded_at`/`boarded_by` (idempotente — conserva la hora),
  "Deshacer" corrige. Guard `es_staff_de_booking` STAFF-only (el comprador no se
  auto-aborda; agencia ajena denegada). El voucher muestra "Modo abordaje →" solo
  a staff logueado.

## Vitrina y precios (b044/b045/b046)

- Ficha: sección **"Fechas de salida"** (próximas con lugares, agotadas en rojo,
  pasadas 180 días tachadas en gris) — `get_public_service.all_departures`.
- **Temporadas** (b045): `service_departures.price_pct` (+25 alta / -10 promo;
  CHECK -99..500) escala TODOS los packs proporcional. Autoritativo en
  `create_marketplace_order` (snapshot de líneas ya ajustado ⇒ ventas pasadas
  intactas); editor de salidas con campo %; ficha "desde $X" ámbar; /comprar
  ajusta en vivo. Helper `precioAjustado` (domain/pricing).
- **Precio "desde" DERIVADO** (b046): min(packs) al guardar; el campo manual
  "Precio (MXN)" se eliminó del form (corrigió inconsistencia real: Basaseachi
  $2,000 vs pack de $1,800).

## Buslist y Roomlist (b046)

- RPC nuevo `departure_lists` (patrón F7: cero re-apply de `get_departure_detail`).
  Guard F3: agencia DUEÑA del servicio o superadmin (la revendedora NO las ve);
  cross-tenant sin dinero; solo ventas reserved/confirmed/paid.
- **Buslist** = manifiesto ordenado por ASIENTO + columnas Asiento y Abordó (✓+hora).
- **Roomlist** (`/salidas/[id]/roomlist`): por reservación — cliente, folio,
  ocupación (líneas de la venta: "2× Habitación doble"), nombres, aviso si faltan.

## Coordinación (re-applies)

- `get_public_service`: conservar `agency.id`, `departures`, `all_departures`
  (+`price_pct` en ambas).
- `list_my_marketplace_orders`: conservar `spei{...}`, `spei_pending`, `plan`.
- `get_voucher_public`: conservar `seat` en pasajeros.
- `confirm_online_payment`: firma con `p_method default 'mercadopago'` (webhook 3 args).
- NO tocados: `get_departure_detail`, `verificar_invariantes`, `reports_summary`,
  `database.types.ts` (casts `as never`).

## Estado contable

Sigue **fase de pruebas**. Ventas de prueba activas al cierre de esta etapa
(pendientes de reversar con el fundador: devolución + cancelar → neto $0):
las de Jimmy/QA en Basaseachi (11-sep y 30-oct). `verificar_invariantes` = 0.
