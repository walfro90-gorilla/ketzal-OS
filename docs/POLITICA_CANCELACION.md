# Política de cancelaciones — investigación y diseño (NO implementado)

> Documento de trabajo (2026-08-04). Objetivo: definir **cuándo se devuelve dinero, cuánto y hasta cuándo**, y blindar a las agencias ante cancelaciones de cualquier tipo. Aquí se acumula la investigación; la implementación viene después y en su propio carril.
>
> ⚠️ Nada de esto es asesoría legal. Antes de publicar la política en producción: **validar con abogado** y registrar el contrato de adhesión ante PROFECO.
>
> **Plan de implementación por fases: `docs/PLAN_CANCELACIONES.md`** (C0–C4, carril `cancelaciones`).

---

## 1. Qué existe HOY en el sistema (verificado contra la BD viva)

| Pieza | Estado | Detalle |
|---|---|---|
| `cancel_booking(id, reason)` | ✅ existe | Solo cambia `status='cancelled'` + `cancel_reason`. **No toca dinero.** El cupo se libera solo (los triggers de capacidad cuentan `reserved/confirmed/paid`). |
| `refund_payment(payment_id)` | ✅ existe | Asiento `refund` ligado al pago original (append-only), **solo reembolso TOTAL del pago** (no parcial). Guards: pago COMPLETED, no doble-reembolso, no exceder lo pagado. |
| `reembolsarPago` (server action) | ✅ existe | Si el pago fue con tarjeta/MP: primero refund vía API de MP (`X-Idempotency-Key`), luego el asiento. Efectivo/SPEI: solo asiento (devolución física a mano). |
| Saldo derivado | ✅ | `total − Σpagos + Σreembolsos` (solo COMPLETED). Regla de oro #2 — un reembolso "revive" el saldo. |
| Voucher | ✅ | `get_voucher_public` regresa null si la venta está cancelada (fail-closed). |
| Plan de abonos + cobranza | ✅ | `payment_schedule`, vencimientos, Clawbot. |
| **Política de cancelación** | ❌ NO existe | No hay plazos, tramos, penalizaciones, ni texto legal en cotización/checkout. Cancelar y reembolsar son decisiones 100% manuales del agente, sin regla que las respalde. |

**El hueco:** hoy, si un cliente exige devolución, no hay nada pactado que permita retener un peso. Sin política aceptada por escrito, PROFECO y el banco (contracargo) fallan a favor del consumidor.

## 2. Marco legal México (lo que nos acota)

1. **NOM-010-TUR-2001** (vigente; el borrador PROY-NOM-010-TUR-2021 que la reemplazaría no se ha publicado como definitiva — verificar antes de implementar). Regula los contratos prestador turístico ↔ turista:
   - La política de cancelación **debe estar en el contrato** y ser informada ANTES de contratar.
   - **Reciprocidad**: si el cliente paga pena al cancelar, el prestador debe compensar de forma equivalente cuando el que cancela es él. O sea: nuestra política define también nuestra obligación cuando cancelamos nosotros.
   - Contrato de adhesión **registrable ante PROFECO** (y la agencia inscrita en el RNT — Registro Nacional de Turismo).
2. **LFPC (Ley Federal de Protección al Consumidor)**:
   - Art. 7: el proveedor está obligado a respetar precios y condiciones **ofrecidos**. La política publicada nos obliga, para bien y para mal.
   - Art. 56: en ventas fuera de establecimiento, el consumidor puede **revocar sin responsabilidad dentro de 5 días hábiles**. Su aplicación a e-commerce es debatida, pero PROFECO tiende pro-consumidor: asumir que una compra online del marketplace puede revocarse ~5 días hábiles después de pagada **si el viaje aún está lejos** (los tramos de la §4 ya lo cubren de facto: a >30 días devolvemos casi todo).
   - Art. 76 bis (e-commerce): informar términos de forma clara antes del pago. Reforma DOF 12-dic-2025 endureció cancelaciones de cargos recurrentes — no nos pega (no hay suscripciones), pero confirma la dirección pro-consumidor.
   - Pena convencional: nunca mayor al valor de la obligación (Código Civil art. 1843) y no puede haber cláusulas abusivas/desproporcionadas (LFPC art. 90). Retener 100% solo se sostiene en no-show o muy cerca de la salida y con costos reales detrás.
3. **Cancelación de evento/viaje por el proveedor** (criterio PROFECO): devolución del 100% de lo pagado, incluidos cargos. La reprogramación es una *oferta*, no una imposición.

**Traducción práctica:** la política tiene que (a) estar escrita y aceptada ANTES de cobrar, (b) escalar por cercanía a la salida con % razonables ligados a costos reales, (c) espejo: si cancelamos nosotros, 100% de vuelta (o alternativa que el cliente acepte libremente).

## 3. Riesgo por método de pago (dónde nos pueden quitar el dinero aunque digamos que no)

| Método | ¿Reversible por el cliente? | Riesgo | Defensa |
|---|---|---|---|
| Efectivo | No | Bajo | Recibo foliado ya lo cubre |
| SPEI / transferencia | **No hay contracargo** (irreversible) | Bajo | Preferirlo para montos grandes |
| Tarjeta vía Mercado Pago | **Sí — contracargo** hasta ~120 días después | **ALTO**: el Programa de Protección al Vendedor de MP **NO cubre servicios** (solo producto físico con guía de envío). Turismo = servicio ⇒ ante contracargo, MP retiene el dinero y hay que pelearlo con evidencia | Kit de evidencia (§7) |

Regla operativa a adoptar: el dinero cobrado por tarjeta **no está "seguro" hasta ~4 meses después del viaje**. Los tramos de retención existen precisamente para que, si hay pleito, la evidencia diga "el cliente aceptó esto".

## 4. Política propuesta (BORRADOR — Walfre decide los números)

Basado en estándar de la industria MX (GDL Tours, Tours Calypso, PriceTravel, operadores de Chiapas: 15–35% en tramos medios, 100% no-show):

| Cuándo cancela el viajero | Retención (pena) | Devolución |
|---|---|---|
| ≥ 30 días antes de la salida | 10% (gastos administrativos) | 90% |
| 15–29 días | 25% | 75% |
| 7–14 días | 50% | 50% |
| 2–6 días | 75% | 25% |
| ≤ 48 h o **no-show** | 100% | 0% |

**✅ DECIDIDO (2026-08-04):** tramos aprobados tal cual, con **piso = enganche**. Fórmula única:

> **pena = max(tramo% × total, enganche pactado)**, con tope el total.
> Con enganche default 20% ⇒ retención efectiva: **20 / 25 / 50 / 75 / 100**.

Reglas transversales:

- **Base de cálculo**: % sobre el TOTAL de la venta, no sobre lo abonado. Si lo abonado < pena, el cliente ya no debe el resto pero no recibe nada; si abonó de más, se devuelve la diferencia.
- **Anticipo/enganche NO reembolsable** una vez confirmado el cupo — implementado como el piso de la fórmula de arriba (no como regla aparte).
- **Componentes de terceros no recuperables** (vuelos, hoteles con depósito no reembolsable) se retienen al 100% en cualquier tramo, siempre que estén desglosados en la venta. Hay que poder marcarlos.
- **Cambio de titular** (el cliente manda a otra persona): gratis hasta 48 h antes. Mata la mayoría de las cancelaciones de facto.
- **Cambio de fecha** (✅ decidido): el 1º es **gratis con ≥20 días de aviso**; cambios posteriores o con <20 días ⇒ se resuelve como crédito o tramos.
- **USD (F6)**: el reembolso se calcula y paga en **MXN autoritativo** (lo que entró al ledger), no al TC del día del reembolso. Decirlo explícito en la política evita pelear el diferencial cambiario.
- **Momento del reloj**: los "días antes" se cuentan contra `travel_date` a partir de la fecha en que el cliente **notifica por escrito** (WhatsApp cuenta, y queda de evidencia).

### Crédito ANTES que devolución (✅ decidido 2026-08-04)

La primera oferta ante cualquier cancelación del viajero es **crédito, no efectivo**:

- **Crédito por el 100% de lo pagado, SIN pena**, válido **12 meses** desde su emisión, aplicable a **cualquier viaje en Ketzal** (crédito UNIVERSAL — decidido 2026-08-04; entre agencias, la emisora que retuvo el efectivo le debe el monto canjeado a la vendedora — derivable del ledger vía `payments.credit_id`, reporte pendiente).
- La devolución en efectivo (con los tramos) sigue siempre disponible — el crédito se **ofrece**, no se impone (PROFECO). El incentivo es el diferencial: crédito = 100%, efectivo = 100% − pena.
- Personal e intransferible (v1). **No canjeable por efectivo** después. Si el viaje nuevo cuesta menos, el remanente sigue como crédito; si cuesta más, el cliente paga la diferencia.
- **Expira a los 12 meses y se pierde** — dicho explícito en el texto legal.
- Si cancela **la agencia**: el cliente elige libremente 100% en efectivo o crédito (nunca crédito forzado).
- Reventas: el crédito lo emite la agencia **vendedora** (la que retuvo el dinero); se canjea en cualquier agencia y la cuenta entre agencias se deriva del ledger.

Racional: retiene caja, convierte cancelaciones en ventas futuras, y hace defendible el piso del enganche ("siempre tuviste la opción de no perder nada").

### Cuando cancela la AGENCIA (espejo obligatorio — NOM reciprocidad)

| Causa | Obligación |
|---|---|
| No se llenó el mínimo de pax del camión | Avisar con ≥ N días (definir, sugerido 7) + opción: fecha alternativa / otro tour / **100% de devolución** |
| Fuerza mayor (clima, cierre de acceso a Samalayuca/Creel, orden de autoridad) | Reprogramación prioritaria; si el cliente no acepta, **100% de devolución** (sin "gastos administrativos") |
| Causa imputable a la agencia (sobreventa, error) | 100% + criterio PROFECO puede exigir compensación (hasta 20% como bonificación, LFPC art. 92 bis — verificar aplicación a servicios) |

**Ojo con fuerza mayor:** NO permite retener dinero del cliente; solo permite no pagar daños extra. El costo hundido con proveedores en un evento de fuerza mayor lo absorbe la agencia (o su contrato con el proveedor operativo — negociar espejo con transportistas/hoteles).

## 5. Matriz de casos (quién × cuándo × qué pasa)

| # | Caso | Qué pasa con el dinero |
|---|---|---|
| 1 | Viajero cancela en tramo X | Primero se ofrece **crédito 100% (12 meses)**; si prefiere efectivo: tabla §4 — retener pena, reembolsar resto (asiento(s) `refund`) |
| 2 | Viajero con plan de abonos **deja de pagar** | NO es cancelación automática. Tras N días de atraso (sugerido 15) y avisos de cobranza/Clawbot: la agencia puede cancelar por incumplimiento aplicando el tramo vigente **a la fecha de la cancelación**. El enganche no se devuelve. Debe decirlo el contrato. |
| 3 | No-show | Retención 100%, cero reembolso. El manifiesto (F3) es la evidencia de que el asiento se reservó y salió. |
| 4 | Viajero pide cambio de fecha | No es cancelación: 1º cambio gratis con ≥20 días de aviso; después o con <20 días ⇒ crédito o tramos. |
| 5 | Agencia cancela (mínimo de pax) | 100% o alternativa aceptada. Aviso con anticipación pactada. |
| 6 | Fuerza mayor | Reprogramar; si no, 100%. |
| 7 | Contracargo MP (el cliente no pide, QUITA) | Pelear con kit de evidencia (§7). Si se pierde, asiento `refund` para que el ledger refleje la realidad. |
| 8 | Revocación LFPC art. 56 (compra online, ≤5 días hábiles) | Si el viaje está lejos, devolver 100% sin pelear (el tramo ≥30 días casi lo iguala y no vale el pleito). Si compró de último minuto (viaje ≤ tramo alto), la pena del tramo aplica — zona gris legal, documentar aceptación expresa. |
| 9 | Reventa entre agencias (owner ≠ selling) | **La política del OWNER manda** (es su viaje y su cupo). La selling la muestra tal cual al cliente. La pena retenida se reparte igual que la comisión (misma proporción) — decidir y dejarlo en el acuerdo entre agencias. CxP (F2): un reembolso ajusta el "debo" a la owner. |
| 10 | Cancelación parcial (1 de 4 pax) | Aplicar tramos al precio de ese pasajero (la venta tiene líneas — se puede). Recalcular total con asiento, no editando historia. |

## 6. Diseño técnico futuro (bosquejo — NO construir aún)

Principio rector: **la política se congela en la venta** (snapshot), igual que el precio. Cambiar la política mañana no cambia lo pactado ayer.

1. **Definición**: `cancellation_policy` jsonb — default por agencia (`suppliers.info` ya es jsonb) + override por servicio (`services`). Estructura: `{tramos: [{dias_min, retencion_pct}], no_show_pct, enganche_no_reembolsable, cuota_cambio_fecha, min_pax_aviso_dias}`.
2. **Snapshot**: al crear la venta, copiar la política vigente a `bookings` (columna jsonb). La cotización pública (`/cotizacion/[token]`) y el checkout del marketplace la **muestran y exigen aceptación** (checkbox + timestamp + para online: IP). Esa aceptación ES la defensa legal y anti-contracargo.
3. **Cálculo**: RPC `preview_cancellation(booking_id)` → días a `travel_date`, tramo aplicable, pena, pagado, a devolver. Solo lectura; el agente ve el desglose antes de confirmar.
4. **Ejecución**: `cancel_booking_v2(booking_id, reason)` — cancela + registra la pena aplicada (para reporte) ; el reembolso sale por el flujo existente. **Falta pieza**: `refund_payment` hoy solo reembolsa pagos completos ⇒ se necesita **reembolso parcial** (asiento `refund` por monto arbitrario ≤ pagado, ligado a la cancelación, con los mismos guards). Ledger intacto: pena retenida = simplemente NO se reembolsa; no es asiento nuevo.
5. **Crédito/reprogramación**: formal desde el arranque (decisión 2026-08-04) — tabla `credits` con saldo derivado + canje como asiento `payment` método `credito` en la venta nueva. Detalle en `docs/PLAN_CANCELACIONES.md` fase C5.
6. **Texto legal**: página pública `/politica-cancelacion` + inclusión en cotización, checkout y voucher. Contrato de adhesión → abogado → registro PROFECO.

Nada de esto toca `create_booking_with_items` de entrada (snapshot puede hacerse con RPC aparte post-creación o en el action) — coordinar con el carril backend cuando se implemente.

## 7. Kit de evidencia anti-contracargo (operativo desde ya, sin código)

MP no protege servicios; ante contracargo solo gana la evidencia. Por venta con tarjeta, poder presentar:

1. Política de cancelación **aceptada** (checkbox con timestamp; mientras no exista: mensaje de WhatsApp donde el cliente confirma haber leído la política enlazada).
2. Cotización/estado de cuenta público enviado (links `/cotizacion`, `/estado` — ya existen).
3. Recibo foliado de cada abono (ya existe).
4. Voucher emitido (ya existe) y, si viajó, **manifiesto F3 con el pax listado** — prueba de servicio prestado, mata el "no recibí el servicio".
5. Conversación de WhatsApp de confirmación.

Mitigación adicional: para liquidaciones grandes, empujar SPEI (sin contracargo, sin fee de tarjeta). Ya alineado con el plan Openpay del roadmap.

## 8. Decisiones — CERRADAS por Walfre (2026-08-04)

- [x] Tramos: **10 / 25 / 50 / 75 / 100** (≥30 · 15–29 · 7–14 · 2–6 · ≤48h/no-show), % sobre el total.
- [x] Enganche NO reembolsable — como **piso de la pena**: `pena = max(tramo × total, enganche)` ⇒ retención efectiva 20/25/50/75/100 con enganche default 20%.
- [x] **Crédito antes que devolución**: siempre se ofrece primero crédito 100% sin pena, vigencia 12 meses, **universal (cualquier viaje en Ketzal)**, no forzado (§4).
- [x] Cambio de fecha: 1º gratis con **≥20 días** de aviso; después o <20 días ⇒ crédito o tramos.
- [x] Aviso cuando cancelamos por mínimo de pax: **7 días**.
- [x] Atraso del plan de abonos: **15 días** de atraso (tras avisos de cobranza/Clawbot) ⇒ cancelable por incumplimiento aplicando el tramo vigente a esa fecha.
- [x] Reparto de la pena en reventas: **proporcional a la comisión** (misma proporción que la venta).
- [x] Política **única default + override por agencia** (jsonb en cascada).
- [ ] Abogado + contrato de adhesión + registro PROFECO — único pendiente, externo al código (corre en paralelo, no bloquea C0–C5).

## Fuentes

- [NOM-010-TUR-2001 (texto oficial, gob.mx)](https://www.gob.mx/cms/uploads/attachment/file/12894/NOM-010-TUR-2001.pdf) · [PROY-NOM-010-TUR-2021 (DOF)](https://sidof.segob.gob.mx/notas/docFuente/5638002) · [estado en Economía](https://platiica.economia.gob.mx/normalizacion/nom-010-tur-2001/)
- [LFPC vigente (Diputados, PDF)](https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPC.pdf) · [Reforma LFPC dic-2025 (Greenberg Traurig)](https://www.gtlaw.com/en/insights/2025/12/reformas-a-la-ley-federal-de-proteccion-al-consumidor) · [DOF 12-12-2025](https://www.dof.gob.mx/nota_detalle.php?codigo=5775999&fecha=12%2F12%2F2025)
- [PROFECO — cancelación de paquete vacacional](https://www.gob.mx/profeco/articulos/cancelaron-tu-paquete-vacacional?idiom=es) · [PROFECO — derechos ante cancelación de eventos](https://www.gob.mx/profeco/prensa/recuerda-profeco-a-que-tiene-derecho-la-poblacion-consumidora-en-caso-de-cancelacion-de-eventos)
- [MP — Protección al Vendedor: requisitos (no cubre servicios)](https://www.mercadopago.com.mx/ayuda/requisitos-programa-proteccion-vendedor_294) · [MP/ML — evitar reclamos y contracargos](https://vendedores.mercadolibre.com.mx/nota/buenas-practicas-de-ventas-como-evitar-reclamos-y-contracargos)
- Industria (tramos de referencia): [GDL Tours](https://www.gdltours.com/politicas/politicas-de-cancelacion.php) · [Tours Calypso](https://viajestourscalypso.com/reembolso_devoluciones/) · [PriceTravel](https://www.pricetravel.com.mx/ayuda/cancelacion-tours) · [Apasionado x Chiapas](https://apasionadoxchiapas.com/cancelacion)
