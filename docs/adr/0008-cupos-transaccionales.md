# ADR-0008 — Cupos e inventario: transaccionales en la BD, por salida

- Estado: aceptada · Fecha: 2026-07-10 (inventario) / 2026-08-04 (asientos b041) · Sustituye: —
- Alcance: `service_departures`, `seat_assignments`, `tg_booking_capacity`

## Contexto
Dos ventas simultáneas del último lugar no se resuelven en JavaScript. El
inventario vive por salida (`service_departures`), y las ventas se ligan a la
salida por `(service_id, travel_date = departs_on)` — no hay FK
booking→departure a propósito.

## Decisión
- El cupo se valida DENTRO de la transacción de la venta
  (`current_bookings` vs `max_capacity`, trigger `tg_booking_capacity`).
  Aparta al pasar a `reserved`, libera al `cancelled`; `draft` no cuenta.
- Asientos: `unique(salida, asiento)` en la BD resuelve la carrera — el que
  pierde recibe error accionable, no doble asignación.
- Opt-in por servicio: servicios sin salidas definidas no llevan control de
  cupo.

## Consecuencias
- Cero overbooking por diseño, sin locks manuales en la app.
- La junta ventas↔salida por fecha implica que cambiar la fecha de una
  salida es una operación delicada (mueve qué ventas le cuentan).

## Verificación
Hard-test de carrera (dos inserts concurrentes al último lugar: uno falla);
`verificar_invariantes()` 0.

## Fuentes
Regla de oro #5, `ketzal_os_v1_inventory_per_departure`, b041 (seat map +
guard dual con coalesce), F3 pasajeros/salidas (`011_pasajeros_salidas.sql`).
