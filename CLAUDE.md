# Ketzal — Guía del proyecto

> Documento de contexto para cualquier sesión de desarrollo (humana o con Claude Code).
> Si vas a construir, **lee esto primero**, luego `docs/`.

## Qué es Ketzal

Visión de largo plazo: **"uberizar" los servicios turísticos** de Chihuahua → México → LATAM.
Una red social + marketplace donde viajeros, proveedores e influencers comparten y se unen a viajes.

**Pero no se construye así.** La estrategia acordada es en dos tiempos:

- 🅰️ **Ketzal Marketplace** (el sueño): red social B2C, planners públicos, reseñas, wallet, monedas "Axo", influencers. → **fases 3–4**.
- 🅱️ **Ketzal OS** (el foco actual): herramienta interna de ventas para las agencias del fundador. → **fase 1, lo que se construye ahora**.

**Tesis:** construir 🅱️ primero. Al operar las ventas reales de las agencias, Ketzal siembra la oferta, los proveedores y los datos que luego encienden 🅰️ **sin el arranque en frío** que mata a los marketplaces.

## Contexto de negocio

El fundador (Walfre) opera tres agencias reales:
- **Wanderlust Travels** — ecoturismo, fundada 2017 (Samalayuca, Creel, Casas Grandes/Paquimé, Trepachangas).
- **Border Travels** y **Snapshot** — agencias con viajes propios que se revenden **por comisión**.

Monetización hipótesis: **comisión por reserva** + **afiliación de influencers** (fase posterior).

## Alcance v1 (decidido — no expandir sin acuerdo explícito)

Back-office multi-agencia: un agente cierra la venta de un tour, controla abonos y emite recibo.

| Decisión | v1 |
|---|---|
| Wedge | **Venta + abonos + recibo** |
| Pagos | **Ledger** (registrar dinero), NO procesar en línea |
| Recibo | **Interno, no fiscal** (folio propio; CFDI/SAT es fase aparte) |
| Precio | **Con opciones** (tipos de pasajero + habitación/add-ons) ⇒ la venta lleva líneas |
| Comisión | Campos `owner_supplier_id` + `selling_supplier_id` **listos**, sin calcular aún |
| Base de datos | **Evolucionar** el schema `ketzal` existente (está vacío) |

> **Tenancy (reconciliado con la BD real):** las agencias NO son una tabla nueva. Son filas en **`suppliers`** con `supplier_type = 'agency'`. Se reutiliza `profiles.supplier_id` y las funciones existentes `ketzal.my_supplier_id()` e `ketzal.is_superadmin()` para el RLS. Los proveedores operativos (transporte, hotel) también son `suppliers`, de otro tipo.

**Fuera de v1 a propósito:** cobro en línea, factura fiscal, cálculo de comisiones, auto-registro de clientes, cualquier cosa social/gamificada.

## Stack

- **Next.js** (App Router) + **TypeScript**
- **Supabase** (Postgres 17, Auth, Storage, RLS) — proyecto **Gorilla-Labs** (`wnujoyzdpdyxblgdtxjw`), schema **`ketzal`**
- **shadcn/ui** + Tailwind
- Despliegue: Vercel

## Base de datos — estado actual

Schema `ketzal` ya existe con 14 tablas y RLS activo, pero **casi vacío** (2 services, 1 supplier). Es un scaffold del sueño 🅰️. Reutilizamos lo útil (`services`, `suppliers`, `payments`, `profiles`) y dejamos **dormidas** las tablas B2C (`wallets`, `wallet_transactions`, `wishlists`, `travel_planners`, etc.).
Detalle completo del modelo objetivo en **`docs/DATA_MODEL.md`**. SQL propuesto en **`db/proposed/`**.

## Reglas de oro (no negociables)

1. **RLS por `supplier_id` (la agencia) en todo.** Un agente jamás ve datos de otra agencia. Riesgo #1.
2. **Saldo derivado**, nunca campo mutable suelto: `total − Σ(pagos) + Σ(reembolsos)`.
3. **Ledger append-only**: cancelaciones/correcciones son asientos nuevos (`payment` tipo `refund`), no updates/deletes. **Desde 2026-07-19 se aplica en la BD, no sólo en la app**: trigger `no_mutar` (BEFORE DELETE OR TRUNCATE) + `REVOKE DELETE,TRUNCATE` sobre `payments`, `receipts`, `receipt_counters`, `system_log`. `bookings` queda fuera a propósito (se actualiza legítimamente). Ver `db/proposed/002_ledger_inmutable.sql`.
4. **Folio de recibo atómico**: secuencia por agencia, sin `count(*)+1`.
5. **Cupos transaccionales**: `current_bookings` vs `max_capacity` dentro de transacción.
6. **No sobre-ingeniería.** Monolito Next.js + Supabase. Nada de microservicios/Kafka/sharding.

## Estado

- [x] Estrategia, alcance y modelo de datos v1 definidos
- [x] Documentos base y SQL escritos
- [x] **Migración v1 APLICADA a `ketzal`** (2026-07-08): `ketzal_os_v1_sales_core` + `ketzal_os_v1_security_hardening`. Advisors de seguridad: **0 errores**.
- [x] Semilla: crear Wanderlust/Border/Snapshot como `suppliers` type='agency' y ligar `profiles.supplier_id`
- [x] Scaffolding de la app Next.js
- [x] Primera pantalla: flujo del agente al cerrar una venta

## Construido — estado real (actualizado 2026-07-09)

> El checklist de arriba quedó corto. Resumen aditivo de lo construido. Detalle vivo en la memoria del proyecto (`ketzal-project`).
>
> **Estado real (corregido 2026-07-19):** el OS está **desplegado en producción y en fase de pruebas — todavía NO hay operación real**. Verificado contra la BD: `bookings`, `payments`, `customers`, `receipts` en **cero**. Sigue en pruebas hasta que esté 100% probado. No confundir "desplegado y funcional" con "en uso": el FODA pesa distinto según cuál sea (ej. los 8 días de Clawbot caído tuvieron daño real cero porque no había nada que cobrar).
>
> **Catálogo público — primer slice vivo (2026-07-20):** el flag `services.published` ya se prende/apaga desde la UI (toggle en la lista de servicios **y** en el formulario de edición, tarjeta "Publicación"). Las rutas públicas `/explora` (`ketzal.list_public_services`) y `/servicio/[id]` (`ketzal.get_public_service`, fail-closed) sirven solo lo publicado. El fundador publicó **2 servicios** (Brasil, Dunas Mágicas Samalayuca) — verificado end-to-end, 0 errores de advisors. Sigue siendo **fase de pruebas** (sin ventas ni operación real); es el primer paso hacia el marketplace B2C 🅰️. Además ya tienen **galería (hasta 20 fotos) + carrusel** en la ficha y **video opcional** (YouTube/Vimeo, `yt_link` en `get_public_service`); `/explora` ordena por precio.
>
> **Marketplace — terreno B.0 aplicado (2026-07-20, dark-launched):** primer paso B2C detrás del flag **`NEXT_PUBLIC_MARKETPLACE`** (off por default; se prende en Vercel + redeploy). Tabla nueva **`ketzal.marketplace_customers`** (comprador B2C, RLS solo-dueño `id = auth.uid()`, **aislada de `profiles`** para no tocar la RLS por agencia). Registro con **email+password** (evita `/auth/callback` → el comprador nunca nace como agente). Ruta **`/comprar/[serviceId]`** (gated): alta rápida → resumen + handoff WhatsApp (sin pago aún). CTA "Comprar en línea" en la ficha. Plan y estado por fases en **`docs/MARKETPLACE_TERRENO.md`**. **B.1 (pedido + endurecer confirmación de comprador) se continúa en Claude console; esta rama sigue con UI/UX.**
>
> **Vitrina pública B2C — construida (2026-07-21, rama UI/UX):** circuito público navegable, indexable, sin login: **`/explora`** (viajes) ↔ **`/agencias`** (directorio) → **`/agencia/[id]`** (perfil) → **`/servicio/[id]`** (ficha) → **`/comprar`** (tras flag). **RPCs nuevos** (SECURITY DEFINER, anon): `get_public_supplier` (perfil fail-closed: logo, métricas reales —viajes activos/destinos/años operando—, km seed del fundador, galería, viajes clicables, redes), `list_public_suppliers` (directorio), `get_supplier_rating` (rating agregado que **reusa `get_service_reviews`** → misma visibilidad, sin N+1). `get_public_service` extendido con `agency.id` para enlazar la ficha al perfil. **Reseñas/rating** (badge + recientes en perfil, estrellas en directorio y ficha) tras el flag `NEXT_PUBLIC_MARKETPLACE`. **`/explora` pulido**: agencia enlazable (mapeo nombre→id, sin tocar `list_public_services`), filtro de precio, badges de tipo, "limpiar filtros", conteo N de M. **Header/footer público compartido** (`src/components/public/`) en las 5 rutas. **Fix**: `/agencia` y `/agencias` faltaban en la allowlist de `proxy.ts` (pedían login) → corregido. **Form de proveedor enriquecido** (Fase A): logo, fotos (≤12), perfil público (`suppliers.info` jsonb: acerca de, ciudad, año, redes, especialidades, km) — reusa columnas existentes, **sin migración**; **botones inteligentes** por proveedor en `/proveedores/[id]`. **Sistema de logo oficial** configurable (`/ajustes`, `app_settings.logo_url`, RPC `get_brand_logo`) en header/login/documentos/OG (wordmark; favicon se queda con el quetzal). **Modo demo** `?preview=reviews` (andamiaje de previsualización de reseñas/rating) — **eliminado 2026-07-22** (`src/lib/demo/reviews.ts` borrado + sus 3 usos en la vitrina; las reseñas reales quedan intactas tras el flag del marketplace). Migraciones aplicadas: `ketzal_public_supplier_profile`, `ketzal_list_public_suppliers`, `ketzal_get_supplier_rating`, `ketzal_app_settings_logo`; 0 errores de advisors. Sigue **fase de pruebas** (sin operación real). Nota de coordinación: si se re-aplica `get_public_service`, conservar `agency.id`.
>
> **Plan vs competidor + F1 UI (2026-07-21):** comparativo de Ketzal OS contra un back-office competidor + plan de 7 fases en **`docs/PLAN_COMPETIDOR.md`** (F1 folio cotización, F2 gastos+CxP, F3 pasajeros/manifiesto/salidas, F4 voucher, F5 metas, F6 divisas TC manual, F7 clawbot; descartados: cargo-tarjeta/PCI, créditos corp, 12 estatus, módulo bodas completo, cuentas bancarias). **F1 — COMPLETA + hard-testeada (2026-07-21).** UI: folio `COT-n` en la lista de cotizaciones, en el documento público y badge "Origen: COT-n" en la venta (null-safe). BD (migración aplicada, espejo en `db/proposed/007_folio_cotizacion.sql`): tabla **`doc_counters`** (counter genérico por (scope, serie); RLS deny-all + `no_mutar` + REVOKE; scope = agencia o `auth.uid` del agente libre, **sin FK**), RPC **`next_doc_folio`** (clon de `next_receipt_folio`, atómico sin huecos por serie), `bookings.quote_folio`, y re-apply **aditivo desde el DDL vivo** de `create_booking_with_items` (asigna folio al crear `draft`, se conserva al convertir; sigue INVOKER), `get_quote_by_token` (+`folio`) y `verificar_invariantes` (+check `folio_cot_duplicado`, agrupado por scope). Hard-test end-to-end (revertido, bajo agencias QA): COT consecutivos por agencia, venta directa sin folio, convertir conserva el folio, aislamiento entre agencias, invariantes=0, advisors 0 ERROR. **Coordinación:** `create_booking_with_items`/`get_quote_by_token`/`verificar_invariantes` se re-aplicaron aditivamente — si el otro agente los re-aplica desde su fuente, conservar `quote_folio` / la key `folio` / el check `folio_cot_duplicado`.
>
> **F2 — Gastos + CxP a mayoristas (light) — COMPLETA + hard-testeada (2026-07-21, rama UI/UX).** Ledger de egresos append-only para sacar **utilidad** real y **cuentas por pagar** a las agencias dueñas cuyos viajes se revenden. BD (migración aplicada `ketzal_expenses_v1`, espejo en `db/proposed/008_gastos.sql`): tabla **`ketzal.expenses`** (`kind` egreso|reverso + `reverses_expense_id`; categoría corta operacion/transporte/hospedaje/alimentos/**mayorista**/marketing/otro con CHECK `mayorista ⇒ provider_supplier_id not null`; `amount_mxn>0`; `booking_id` opcional; `spent_at`; RLS **calco de payments** `my_supplier_id()` + `is_active`; `no_mutar` trigger + REVOKE update/delete/truncate ⇒ **corrección = contra-asiento**, nunca UPDATE/DELETE). RPCs (INVOKER salvo resúmenes): **`create_expense`**, **`reverse_expense`** (falla si no existe / ya es reverso / ya revertido; inserta espejo kind='reverso'), **`expenses_summary(from,to)`** DEFINER (total neto egreso−reverso, por_categoria, por_mes), **`payables_summary()`** DEFINER (CxP por agencia dueña: `debo = Σ(total−comisión)` de reventas confirmed/paid, `comisión = round(total*owner.commission_rate/100,2)`, `pagado = Σ` gastos category='mayorista' egreso−reverso, `saldo = debo−pagado`). Decisión: **pagos a mayorista = filas de `expenses`** (un solo ledger ⇒ utilidad sin doble contabilidad); NO tabla `supplier_payments`. `verificar_invariantes` re-aplicado con **+2 checks**: `gasto_reverso_incoherente`, `gasto_doble_reverso` (cxp_sobrepago omitido a propósito). Hard-test en vivo (revertido, agencias QA): gasto→reverso neto 0, doble-reverso bloqueado, mayorista-sin-proveedor bloqueado, DELETE directo bloqueado por trigger, payables corre, invariantes=0 (7 checks), advisors 0 ERROR. **App** (rama UI/UX): ruta **`/gastos`** (admin) — lista con reverso (`window.prompt` motivo, solo egresos no revertidos), form de nuevo gasto (proveedor requerido si mayorista), KPIs del mes + sección **CxP** con "Registrar pago" prellenado (`?category=mayorista&provider=<owner_id>`); nav "Gastos" (adminOnly) + `/gastos` en `ADMIN_HREFS`; `/reportes` gana cards **"Gastos"** y **"Utilidad"** (= vendido − gastos del rango, siempre derivada) + esos campos en el CSV. Casts `as never` para los RPCs nuevos; `database.types.ts` intacto; tsc+build limpios. **Coordinación:** `verificar_invariantes` se re-aplicó aditivamente (ahora 7 checks) — conservar `gasto_reverso_incoherente` / `gasto_doble_reverso` (además de los de F1) si el otro agente lo re-aplica. **Siguiente:** F3 (pasajeros + manifiesto + vista de salida) según `docs/PLAN_COMPETIDOR.md`.
>
> **F3 — Pasajeros + manifiesto + vista de salida — COMPLETA + hard-testeada (2026-07-22, worktree `worktree-f3-pasajeros-salidas`).** Saber quién va en cada salida y sacar el manifiesto del camión (equivalente "tour" del expediente de grupo). Junta ventas↔salida por `(service_id, travel_date = departs_on)` (igual que `tg_booking_capacity`; NO hay FK booking→departure). BD (migración aplicada `ketzal_pasajeros_salidas` + `_filtro`, espejo `db/proposed/011_pasajeros_salidas.sql`): tabla **`ketzal.booking_passengers`** (`full_name`, `passenger_type`, `doc_id` opc.; **EDITABLE** — no es dinero, sin ledger/no_mutar; RLS `bp_sel/ins/upd/del` vía **EXISTS a bookings** = misma visibilidad que la venta + `is_active` en escritura). RPCs **`list_departures(from)`** y **`get_departure_detail(id)`** DEFINER con **guard por agencia dueña del servicio** (`services.supplier_id`) o superadmin (raise si no). **Manifiesto cross-tenant a propósito**: lista TODOS los pax del camión (incl. reventas de otras agencias), pero el **dinero** (total/cobrado/saldo) SOLO de las ventas propias del que llama (`is_own` = selling=mío ∨ sold_by=uid ∨ superadmin; ajeno ⇒ null). Asientos tomados = `status in (reserved,confirmed,paid)` (draft = cotización, no cuenta). Dinero derivado (regla de oro #2: cobrado = Σ payment−refund COMPLETED). **App**: sección **Pasajeros** en `/ventas/[id]` (captura rápida nombre/tipo/doc, contador X/num_pax; acciones en `pasajeros-actions.ts` aparte para no chocar con `ventas/[id]/actions.ts`); **`/salidas`** (lista con ocupación + progreso de captura), **`/salidas/[id]`** (KPIs ocupación/pax/vendido-saldo propio + ventas del camión con reventas visibles y dinero ajeno privado), **`/salidas/[id]/manifiesto`** (documento interno imprimible **con sesión** — PII, SIN token público — lista plana pase de abordar + aviso de ventas sin pax); nav **"Salidas"** (ruta general; `list_departures` ya la acota). Hard-test adversarial en vivo (rollback, agencias QA + reventa sintética): guard bloquea agencia no-dueña, dinero aislado (vendido_propio excluye reventa, reventa total=null), manifiesto completo (pax_capturados), `list_departures` scope (Beta no ve salida de Alfa), RLS pax entre agencias, draft/cancelled excluidos, salida vacía, agente libre → []. `tsc`+`build` limpios, advisors **0 ERROR**. **Coordinación:** todo en worktree aislado; solo edición mínima/localizada en `ventas/[id]/page.tsx` (fetch pasajeros + `<PasajerosSection>`) y `nav-items.ts` (item Salidas + flag `superadminOnly` ya existía). **NO** se tocó `verificar_invariantes` (el check opcional `pax_vs_num_pax` queda como follow-up para no re-aplicar la función compartida). **Siguiente:** F4 (voucher de servicio foliado) según `docs/PLAN_COMPETIDOR.md`.
>
> **F4 — Voucher de servicio foliado — COMPLETA + hard-testeada (2026-07-22, worktree `f4-voucher`).** Comprobante que **acredita el servicio** (para presentar al operador/hotel), foliado por agencia; **NO expone dinero**. BD (migración aplicada `ketzal_vouchers_v1`, espejo `db/proposed/012_vouchers.sql`): tabla **`ketzal.vouchers`** (`id` = token público, **un voucher por venta** `booking_id unique`, `folio` único por agencia `unique(supplier_id,folio)`; **append-only desde la app** = REVOKE update/delete/truncate; RLS `vouchers_sel/ins` = visibilidad de la venta). RPCs: **`emit_voucher(booking)`** INVOKER **idempotente** (si ya existe lo regresa; maneja carrera con `unique_violation`), solo `reserved/confirmed/paid`, folio vía `next_doc_folio(coalesce(selling,auth.uid),'voucher')` (reusa la infra atómica de F1); **`get_voucher_public(id)`** DEFINER anon **fail-closed** (null si cancelada o no existe), **sin montos** — devuelve agencia/logo/contacto (de `suppliers` como `get_receipt_public`), folio, cliente, servicio, fecha de viaje, pax y lista de pasajeros. **App**: ruta pública **`/voucher/[voucherId]`** (documento imprimible calco de `/recibo`, sin dinero; + `loading`), card **"Voucher de servicio"** en `/ventas/[id]` (emitir idempotente / ver / copiar link; solo ventas `reserved/confirmed/paid`; acción en `voucher-actions.ts` aparte), **`/voucher/` en la allowlist de `proxy.ts`** (público sin login). Hard-test en vivo (rollback): idempotente (emitir 2× = mismo voucher), folios consecutivos por agencia (1,2), draft bloqueado (raise), público sin dinero (0 keys de montos), trae servicio/pax/pasajeros, cancelada ⇒ `get_voucher_public` = null. `tsc`+`build` limpios, advisors **0 ERROR**. **Coordinación:** worktree aislado; solo edición mínima en `ventas/[id]/page.tsx` (fetch voucher + `<VoucherBoton>`) y `proxy.ts` (1 línea). Sin tocar `database.types.ts` ni `verificar_invariantes`. **Siguiente:** F5 (metas por agente + conversión) según `docs/PLAN_COMPETIDOR.md`.
>
> **F5 — Metas por agente + conversión — COMPLETA + hard-testeada (2026-07-22, worktree `f5-metas`).** Meta de venta mensual (agencia + por agente) con avance, y tasa de conversión cotización→venta (habilitada por el `quote_folio` de F1). BD (migración aplicada `ketzal_sales_goals_v1`, espejo `db/proposed/013_sales_goals.sql`): tabla **`ketzal.sales_goals`** (meta mensual por `agent_id` o por agencia `agent_id null`; uniques parciales por (supplier,agent,month) y (supplier,month); **escritura solo vía RPC** = RLS deny insert/upd/del + guard admin en el RPC; lectura por agencia `sg_sel`). RPCs DEFINER: **`upsert_sales_goal(agent,month,amount)`** / **`delete_sales_goal(agent,month)`** (guard `is_superadmin() or role='admin'`; el admin solo su agencia), **`goals_progress(month)`** (meta vs vendido real del mes = Σ total de bookings reserved/confirmed/paid creados en el mes, por agente + agregado agencia), **`conversion_summary(from,to)`** (cotizadas = bookings con `quote_folio` creados en rango, convertidas = las que están reserved/confirmed/paid, tasa; global + por agente). **Decisión de coordinación clave: NO se re-aplicó el hub compartido `reports_summary`** — la conversión va en un RPC nuevo e independiente (cero mutación del hub ⇒ cero colisión con el otro agente; el read del DDL vivo de reports_summary fue rechazado y se rodeó así). **App**: sección **"Metas del mes"** en `/equipo` (fija meta de agencia y de cada agente con avance; `metas-actions.ts` + `metas-section.tsx`); cards **"Conversión (cotización→venta)"** y **"Meta del mes"** en `/reportes` (`conversion-meta.tsx`). Hard-test en vivo (rollback): upsert pisa, agente (role user) denegado por guard, RLS aislada entre agencias (A no ve metas de B), goals_progress OK, conversión 2 cot / 1 conv = 50%. `tsc`+`build` limpios, advisors **0 ERROR**. **Coordinación:** worktree aislado; edición localizada en `equipo/page.tsx` y `reportes/page.tsx`; sin tocar `database.types.ts`/`reports_summary`/`verificar_invariantes`. **Follow-up cerrado (2026-07-22):** conversión + meta del mes también en el CSV de `/reportes` (secciones "Conversión (cotización→venta)" y "Meta del mes", global + por agente; cambio de presentación, sin DDL). **Siguiente:** F6 (divisas USD, TC manual) según `docs/PLAN_COMPETIDOR.md`.
>
> **F6 — Divisas USD (TC manual light) — COMPLETA + hard-testeada (2026-07-22, worktree `f6-divisas`).** Vender en USD con tipo de cambio manual; **el motor sigue 100% MXN (autoritativo)**: al vender en USD el FORM convierte a MXN con el TC y manda MXN al RPC de venta EXISTENTE — **NO se toca `create_booking_with_items`** (decisión clave: evita re-aplicar el RPC core compartido + su read en vivo). BD (migración aplicada `ketzal_currency_usd`, espejo `db/proposed/014_currency_usd.sql`): **`bookings.exchange_rate numeric(12,4)`** + **CHECK `bookings_currency_rate_chk`** (`currency='MXN'⇒rate null`; `'USD'⇒rate not null and >0` — cubre `divisa_sin_tc` en la BD); RPC **`set_booking_currency(booking,cur,rate)`** INVOKER (anota divisa+TC en la propia venta vía RLS `bookings_upd`; bloquea si la venta ya tiene abonos COMPLETED). El USD se **deriva** para mostrar (usd = mxn/tc); payments/reportes/cobranza/invariantes **intactos** (todo MXN). **App**: `/ventas/nueva` gana selector **MXN/USD** + input **TC** (precios en USD con conversión a MXN en vivo + validación TC; al guardar convierte líneas+descuento × TC); **`createBooking` aditivo** (acepta `currency`+`exchangeRate`, tras crear la venta MXN llama `set_booking_currency`); `/ventas/[id]` muestra "Divisa original: USD · TC · (≈ US$ · MXN autoritativo)". Hard-test en vivo (rollback): USD $1000 @17.50 ⇒ 17500 MXN y derivado 1000; USD sin TC denegado, divisa inválida (EUR) denegada, RLS entre agencias, CHECK bloquea `USD+rate null`; venta MXN sin regresión. `tsc`+`build` limpios, advisors **0 ERROR**. **Coordinación:** edición aditiva/quirúrgica al form de venta + `createBooking` (compartidos) — rebase limpio; sin tocar `create_booking_with_items`/`database.types.ts`/`verificar_invariantes`. **Follow-up cerrado (2026-07-22, worktree `f6-usd-docs`):** nota "USD · TC" en documentos públicos. Los importes se muestran SIEMPRE en MXN (autoritativo) en recibo/cotización/estado + sus OG (antes una venta USD formateaba el monto MXN con símbolo USD = mislabel; el recibo ahora muestra la cantidad con letra siempre); cuando la venta se pactó en USD se agrega `<NotaDivisa>` ("Operación pactada en USD al TC $X MXN/USD, total ≈ US$Y; los importes están en MXN, la moneda autoritativa"). BD: RPC **NUEVO e independiente** `get_public_doc_currency(kind,id)` (DEFINER, anon, **LANGUAGE sql** para que `check_function_bodies` valide al aplicar; devuelve divisa+TC solo si USD, resolviendo por el mismo token de cada documento) — **NO re-aplica** `get_receipt_public`/`get_quote_by_token`/`get_statement_by_token` (evita el riesgo del re-apply compartido; anon-safe: expone menos que los hermanos). Espejo `db/proposed/016`. El voucher no lleva montos ⇒ no aplica. tsc+build limpios, advisors 0 ERROR. **Siguiente:** F7 (Clawbot: 3 reglas nuevas) según `docs/PLAN_COMPETIDOR.md`.
>
> **F7 — Clawbot: 3 reglas operativas — COMPLETA + hard-testeada (2026-07-22, worktree `f7-clawbot`). Con esto el plan competidor de 7 fases queda 7/7.** Amplía el motor de recordatorios sin re-escribirlo. BD (migración aplicada `ketzal_clawbot_reglas_v2`, espejo `db/proposed/015_clawbot_reglas_v2.sql`): extiende el CHECK de `kind` (4 → 7) y crea una función **NUEVA e independiente** **`clawbot_reglas_operativas()`** (DEFINER, `search_path` fijo, REVOKE public/anon + GRANT authenticated/service_role) con 3 reglas — **decisión de coordinación clave: NO se tocó** `clawbot_generar_recordatorios`/`clawbot_resumen`/`clawbot_bandeja` (cero colisión con el otro agente). Reglas: **`saldo_sin_plan`** (venta de **contado** con saldo ≥3 días — hueco real: hoy solo se persigue a quien tiene plan; nudge al cliente por WhatsApp, dedupe semanal `IYYY-IW`), **`viaje_manana_operativo`** (viaje mañana, **interno** al agente: pax capturados X/Y + revisa manifiesto; depende de F3; `channel='interno'`, sin teléfono), **`pago_sin_recibo`** (abono `COMPLETED` sin recibo tras 24h, **interno**, dedupe por id de pago). Descartada `cupo_por_llenarse` (sin datos para calibrar umbral). Todas **idempotentes** por `dedupe_key`; reusa la columna `clawbot_reminders.channel` (ya existía, default `whatsapp`). **App**: cron `/api/clawbot/tick` llama `clawbot_reglas_operativas` **además** del motor (log aparte, idempotente; contrato del cron intacto); `clawbot/data.ts` gana los 3 `kind` en `ClawbotKind`; `clawbot/clawbot-list.tsx` gana chips de los 3 tipos y para los **internos** (viaje_manana_operativo, pago_sin_recibo) muestra la nota como texto de lectura + botón **"Ver venta"** (link a `/ventas/[id]`) en vez del envío por WhatsApp (`saldo_sin_plan` sigue el flujo WhatsApp). Hard-test en vivo (rollback, agencias QA): 1er tick 1 recordatorio por regla, 2º tick idempotente (mismos conteos, sin duplicados). `tsc`+`build` limpios, advisors **0 ERROR**. **Coordinación:** worktree aislado; sin tocar `database.types.ts` (casts `as never`), `verificar_invariantes`, ni el motor Clawbot existente. **Plan competidor COMPLETO (7/7).** Follow-ups menores **todos cerrados (2026-07-22)**: conversión/meta en el CSV de `/reportes` (F5) ✅; nota "USD · TC" en documentos públicos (F6) ✅ — recibo/cotización/estado muestran MXN autoritativo + nota USD vía RPC nuevo `get_public_doc_currency` (LANGUAGE sql, DEFINER anon; **sin re-aplicar** los RPCs públicos compartidos; espejo `db/proposed/016`); modo demo `?preview=reviews` eliminado ✅ (se borró `src/lib/demo/reviews.ts` y sus 3 usos en la vitrina; reseñas reales intactas tras el flag).
>
> **SaaS — capa delegada de agencias (2026-07-23).** El OS se vuelve multi-tenant operable por las propias agencias, sin shell nuevo: el shell `(ops)` YA es el shell del admin de agencia (admin de agencia = `role='admin'` + `supplier_id`; las 4 capas —RLS por `my_supplier_id()`, rol, gating nav/proxy, guards en RPCs— ya modelan el multi-tenant). Modelo elegido: **"Delegado"** — el superadmin crea la agencia + invita a su admin; ese admin invita a sus propios agentes; al primer login (email verificado por el proveedor OAuth/magic-link) el invitado se **auto-une** a su agencia con el rol invitado. **P0 (ya en main):** escalación de auto-UPDATE de `profiles` cerrada (`b017_profiles_lockdown`, REVOKE insert/update/delete de `authenticated`; toda escritura de profiles va por RPC DEFINER) + `/salud` y `/ajustes` movidos a `superadminOnly` en el nav (plataforma, no agencia; PRs #53/#56). **P1 — Invitaciones + delegación de rol — COMPLETA + hard-testeada (2026-07-23, rama `saas-p1-invitations`).** BD (migración aplicada `ketzal_agency_invitations`, espejo `db/proposed/b018_agency_invitations.sql`): tabla **`ketzal.agency_invitations`** (`email`, `supplier_id`→suppliers, `role` CHECK in(user,admin), `status` pending/accepted/revoked; unique parcial `(lower(email),supplier_id) where pending`; RLS `agency_invitations_sel` = superadmin ∨ `supplier_id=my_supplier_id()`; **escritura solo vía RPC** = REVOKE insert/update/delete). RPCs DEFINER (search_path fijo, REVOKE public/anon): **`is_agency_admin(supplier)`** (¿caller es admin ACTIVO de esa agencia?), **`invite_agent(email,role,supplier)`** (superadmin→cualquier agencia; admin→SOLO la suya, rol user|admin, nunca superadmin/cross-agencia; upsert de pendiente), **`accept_pending_invitation()`** (auto-une al primer login por email verificado, **SOLO si `supplier_id` es null** — no arrebata a un ya-asignado), **`list_agency_invitations()`** / **`revoke_invitation(id)`** (scope agencia o superadmin), **`set_agency_member_role(user,role)`** (delega user↔admin DENTRO de la agencia; nunca superadmin, nunca cross-agencia). **App**: `/auth/callback` llama `accept_pending_invitation()` tras `ensure_profile` (no-op para compradores del marketplace y para quien ya tiene agencia; RPC nuevo ⇒ cast `as never`). Hard-test adversarial en vivo (rollback, agencias QA Alfa/Beta, 10 checks): admin invita a su agencia ✓, admin→otra agencia denegado ✓, admin invita superadmin denegado ✓, superadmin invita a cualquiera ✓, accept auto-une (user activo) ✓, accept NO arrebata a un ya-asignado ✓, admin promueve user→admin en su agencia ✓, promover cross-agencia denegado ✓, poner superadmin denegado ✓, RLS: agencia B no ve invitaciones de A ✓; advisors **0 ERROR** (WARN 107→113 = 6 funciones DEFINER nuevas, baseline). **Coordinación:** todo objetos nuevos + grants aditivos; sin tocar `database.types.ts`/`verificar_invariantes`/RPCs compartidos. **P2 — UI de gestión delegada en `/equipo` — COMPLETA (2026-07-23, rama `saas-p2-equipo`).** Sin BD nueva (consume los RPCs de P1). Card **"Invitar agentes"** (`invitaciones-section.tsx`): form email + rol (Agente/Admin) + —solo superadmin— selector de agencia destino (obligatorio); lista de **invitaciones pendientes** con **Revocar** (`list_agency_invitations`/`revoke_invitation`). **Delegación de rol para el admin de agencia** en `miembro-acciones.tsx`: botón **"Hacer admin"/"Hacer agente"** (`set_agency_member_role`, user↔admin) visible solo para admins (el superadmin ya tiene el selector de 3 roles), oculto en la fila propia (anti auto-degradación), en libres y en superadmins; `viewerId` fluye page→`equipo-list`→`miembro-acciones`. Server actions en `invitaciones-actions.ts` (casts `as never`; el guard vive en los RPCs). `tsc`+`build` limpios. **P3 — Onboarding de agencia en un paso (superadmin) — COMPLETA (2026-07-23, rama `saas-p3-onboarding`).** Sin BD nueva. Card **"Crear agencia"** en `/equipo` (superadmin; `crear-agencia-section.tsx`): nombre + correo del admin + comisión % → acción **`crearAgenciaEInvitarAdmin`** (en `invitaciones-actions.ts`) que **inserta la agencia** (`suppliers` type='agency', RLS solo-superadmin; contact_email = correo del admin si no se da otro) y de inmediato **`invite_agent(admin, 'admin', nuevaAgencia)`**. Cierra el funnel Delegado: crear agencia + invitar a su admin que antes eran dos pantallas (`/proveedores/nuevo` + selector en `/equipo`). Parcial resiliente: si la agencia se crea pero la invitación falla, no revierte (la agencia ya existe, se invita después) y se avisa como `warning`. `tsc`+`build` limpios. **Dashboard del admin de agencia:** NO se construye — `/dashboard` ya está scopeado por RLS (`my_supplier_id`), así que el admin de agencia ya ve solo lo suyo; un dashboard aparte sería redundante. **Capa SaaS delegada COMPLETA (P0→P3).** Un superadmin da de alta una agencia + su admin en un paso; el admin gestiona su equipo, sus ventas y su dinero, aislado por agencia a nivel BD. **Siguiente:** lo que el fundador priorice (pruebas en prod del flujo de invitación, o back al plan competidor/roadmap).

**Infra/deploy:** Next.js 16 (App Router) · React 19 · TS · Tailwind 4 · shadcn base-nova (sobre `@base-ui/react`, no radix) · pnpm. Repo `walfro90-gorilla/ketzal-OS` (SSH) → Vercel `ketzal-os` (push a `main` auto-despliega). Prod: **https://ketzal-os.vercel.app**. Migraciones NO versionadas en el repo (Supabase es la fuente, vía `apply_migration`). `middleware.ts`→`proxy.ts` en Next 16; `next build` no falla por lint.

**Auth + tenancy:** magic link / contraseña / Google OAuth / recuperación. Dos tipos de vendedor: **agente de agencia** (`profiles.supplier_id`) y **agente Ketzal libre** (`supplier_id` null, vende todo, comisión de plataforma). Nuevos usuarios nacen **pendientes** (`active=false`) → aprobación de admin. RLS reescrito y probado adversarialmente (spoof/fugas cross-tenant/anon cubiertos). **Escalación de auto-UPDATE — encontrada y cerrada (2026-07-23, `b017_profiles_lockdown`):** `authenticated` tenía GRANT UPDATE de tabla completa sobre `profiles` y `profiles_update_own` no restringía columnas ⇒ un autenticado podía PATCH su propia fila y ponerse `role='superadmin'`/`active=true` por PostgREST, saltándose los RPCs con guard. Se **revocó insert/update/delete de `authenticated`** sobre `profiles` (la app nunca escribe profiles desde el cliente; todas las mutaciones van por RPCs `SECURITY DEFINER` que corren como owner). Hard-testeado (rolled back) + advisors 0 ERROR. Helpers: `my_supplier_id`, `is_superadmin`, `is_active`, `ensure_profile`. **Escritura de profiles = solo vía RPC DEFINER** (`set_user_active`/`set_user_role`/`assign_user_agency`/`ensure_profile`).

**Flujo de venta (RPCs atómicos):** catálogo de servicios → **cotización** (link público `/cotizacion/[token]` + PDF + convertir) → **venta** con líneas (opciones de pasajero + habitación/add-ons) → **abonos** (ledger append-only, saldo derivado) → **recibo** interno (folio atómico por agencia) → **comisiones** (reventa entre agencias / plataforma para libres). Cancelaciones, vencimientos, editor de itinerario.

**Pagos — más allá del v1 original (ampliado con acuerdo del fundador):**
- **Cobro en línea (Mercado Pago Checkout Pro)**: **VALIDADO en producción (2026-07-10)** — pago SPEI real de $20 confirmado end-to-end (webhook `approved` → abono en el ledger). El bloqueo era el token en TEST; con `APP_USR-` de prod cobra bien. (El sandbox de MP nunca sirvió; se validó directo en prod, como se acordó.)
- **Estado de cuenta del cliente** compartible por WhatsApp (link público `/estado/[token]`).
- **Recibo** rediseñado + público/compartible (`/recibo/[uuid]`, cantidad con letra, sello "Liquidada").
- **Plan de pagos (abonos)**: enganche % configurable (default 20%) + abonos semanal/quincenal/mensual hasta la fecha final; invariante suma=total. Tabla `payment_schedule` + RPCs `preview/generate/clear_payment_plan`; `bookings.payment_type`.

**Operación / institucional:** Panel (KPIs + "Requiere atención") · **Reportes** (`/reportes`, gráficas + exportar CSV) · **búsqueda + filtros + ordenar por columna** en todas las listas · **buscador global ⌘K** · **sidebar de escritorio colapsable** · PWA · dark mode · toasts · mobile-first (campo-primero) · borrados con confirmación + guardas de integridad.

**Automatización / cobranza / salud (2026-07-10):**
- **Cobranza** (`/cobranza`): a quién cobrar / quién va atrasado (cruza el plan de pagos con los abonos reales).
- **Clawbot** — motor de automatización: reglas diarias (abono por vencer/vencido, cotización sin cerrar, viaje próximo) → outbox de recordatorios que el agente **envía por WhatsApp con 1 clic** (`/clawbot`) + digest en el Panel. Cron `/api/clawbot/tick` (`vercel.json`, protegido `CRON_SECRET`). Diseñado para subir a envío 100% automático (WhatsApp Business API) sin rehacer el motor.
- **Salud del sistema** (`/salud`, superadmin): chequeo de invariantes de dinero (0 violaciones) + log de eventos (cron, webhook). El cron corre el chequeo a diario.

> **Env vars nuevas:** `CRON_SECRET` (cron de Clawbot). Ya existentes: `MP_ACCESS_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`.
> **Multi-agente:** varios agentes editan el árbol en paralelo. Convención: RPCs nuevos se llaman con cast `supabase.rpc('nombre' as never)` para NO tocar `database.types.ts` (un solo dueño); cada quien commitea SOLO sus archivos (`git add` explícito — ojo: rutas con brackets `app/x/[id]/` son glob en pathspecs de git, stagea por directorio y revisa `git status`). **Espejos de migraciones en `db/proposed/` usan prefijo por carril: `bNNN_` (backend/dinero) y `mNNN_` (marketplace/viajero), cada uno con su propio contador — ambos van en 016, el siguiente es `b017_`/`m017_`.** Ver `docs/WORKTREES.md` y `db/proposed/README.md`.

**Modelo de 2 agentes (dev):** UI/UX (Fable) dueño de la capa presentacional; backend (Opus) dueño de `actions.ts`, RPCs, RLS, dinero. Ver `docs/UI_UX_PLAN.md` §7.

**Roadmap pendiente (v2+):** notificaciones (WhatsApp/email), facturación CFDI/SAT, catálogo público/marketplace (primer paso B2C). **Pagos:** MP ya validado en prod; a futuro **Openpay** (es de BBVA) para cobrar SPEI conciliable a la cuenta BBVA sin el fee de tarjeta de MP — el campo ya está listo (`payment_intents.provider`, sin cambio de schema). **Por lo pronto: solo MP** (nada de scaffolding de Openpay hasta decidirlo, YAGNI). Detalle en `docs/ROADMAP.md`.

## Docs

- `docs/ARCHITECTURE.md` — stack, principios, seguridad, qué NO hacer
- `docs/DATA_MODEL.md` — modelo de datos v1 completo
- `docs/ROADMAP.md` — fases v1 → v4
- `db/proposed/001_ketzal_os_v1.sql` — migración propuesta (revisar antes de aplicar)

---

# PROTOCOLO codebase-memory-mcp — KETZAL APP

Aplica a toda esta sesión. No lo resumas de vuelta, solo síguelo.

```
=== 0. CONTEXTO FIJO (no re-descubrir, no preguntar) ===
Repo path absoluto: /home/walfro90/Desktop/codes/ketzal-app
project (literal, en TODA llamada): home-walfro90-Desktop-codes-ketzal-app
Grafo: 1,590 nodos / 3,717 edges | 191 TS, 11 SQL, 2 YAML, 1 CSS
Excluido del grafo: node_modules, .next, .git, .vercel, public, docs/

CRÍTICO: docs/ NO está indexado. Si preguntas al grafo por documentación vas a
recibir vacío — eso NO significa que no exista. docs/ es trabajo de Read/Grep.

CRÍTICO: el parámetro project es obligatorio en cada llamada. Si lo omites, el
servidor puede devolver datos de otro repo del mismo store. Es la causa #1 de
resultados fantasma.

=== 1. REGLA DE ORO ===
Antes de cualquier Grep, Glob o barrido de Read: consulta el grafo.
Una query estructural reemplaza decenas de ciclos grep/read.
Grep/Read siguen siendo correctos SOLO para: contenido de docs/, strings
literales, comentarios, configs no indexados, y leer un archivo completo una vez
que el grafo ya te dijo cuál.

=== 2. PROTOCOLO DE 6 FASES (en orden, sin saltarse) ===

FASE 1 — index_repository (solo si hace falta)
  { "repo_path": "/home/walfro90/Desktop/codes/ketzal-app" }
  - Path ABSOLUTO siempre. Relativo falla.
  - NO lo corras por default: ya está indexado. Solo tras detect_changes con
    drift real, o si yo lo pido.
  - El índice es SNAPSHOT, no live. No se actualiza solo por commit.
  - Si la respuesta trae status:"degraded" → avísame. Los nodos persistidos
    quedaron bajo el umbral vs los de memoria; el grafo no es confiable.

FASE 2 — list_projects
  {}
  - Devuelve el "name" de cada proyecto. Ese string exacto es tu parámetro project.
  - Ya lo sé: home-walfro90-Desktop-codes-ketzal-app
  - Córrelo solo si una query falla por proyecto no encontrado.
  - Nunca inventes ni "normalices" el nombre: se deriva del path, lleva guiones.

FASE 3 — get_graph_schema (PRIMERA de las queries, siempre)
  { "project": "home-walfro90-Desktop-codes-ketzal-app" }
  - Te da conteos por label, patrones de relación reales y propiedades por label.
  - Sin esto escribes Cypher contra edges que no existen AQUÍ y filtras por
    propiedades no pobladas.
  - Labels: Project, Package, Folder, File, Module, Class, Function, Method,
    Interface, Enum, Type, Route, Resource
  - Edges: CALLS, IMPORTS, DEFINES, DEFINES_METHOD, IMPLEMENTS, HANDLES,
    HTTP_CALLS, ASYNC_CALLS, USES_TYPE, USAGE, TESTS, FILE_CHANGES_WITH,
    CONTAINS_FILE, CONTAINS_FOLDER, CONTAINS_PACKAGE, MEMBER_OF, WRITES, CONFIGURES

FASE 4 — get_architecture (overview de un solo call)
  { "project": "home-walfro90-Desktop-codes-ketzal-app" }
  - Devuelve lenguajes, packages, entry points, routes, hotspots, boundaries,
    layers y clusters (Louvain) en una llamada.
  - Úsalo para orientarte antes de arquitectura, refactor o "dónde vive X".
  - UNA VEZ por sesión. El baseline ya está en la sección 4 de abajo.

FASE 5 — search_graph (descubre el nombre EXACTO) — NO ES OPCIONAL
  {
    "project": "home-walfro90-Desktop-codes-ketzal-app",
    "name_pattern": ".*Booking.*",
    "label": "Function"
  }
  - Es el puente entre "cómo le dice el humano" y "cómo se llama en el grafo".
  - Params: label, name_pattern (regex), file_pattern, min_degree/max_degree
    (hubs o dead code), limit/offset.
  - De AQUÍ sale el qualified name de la Fase 6.
    Formato: <project>.<path_parts>.<name>
  - NUNCA construyas un qualified name a mano. Cópialo del resultado.

FASE 6 — trace_path / get_code_snippet (recién ahora)
  trace_path:
  {
    "project": "home-walfro90-Desktop-codes-ketzal-app",
    "function_name": "createBooking",
    "direction": "inbound",
    "depth": 3
  }
  - direction: inbound (quién me llama = blast radius) | outbound (dependencias)
    | both. depth 1-5. No pongas "both" por default: duplica el ruido.

  get_code_snippet:
  {
    "project": "home-walfro90-Desktop-codes-ketzal-app",
    "qualified_name": "<pégalo tal cual desde search_graph>"
  }

=== 3. ANTI-PATRONES — si haces esto, párate ===
- trace_path con nombre adivinado → 0 resultados y concluyes que no existe.
  Correcto: search_graph con .*Parcial.* primero.
- Omitir project → resultados de otro repo o vacío. Siempre pásalo.
- get_code_snippet con nombre armado a mano → falla. Cópialo de search_graph.
- Grep antes del grafo → quemas contexto por lo que una query resuelve.
- index_repository "por si acaso" → costo sin beneficio.
- Buscar docs/ en el grafo → vacío → conclusión falsa. No está indexado.
- Re-derivar la arquitectura cada sesión → el baseline ya está abajo.

=== 4. BASELINE CONOCIDO (úsalo, no lo re-derives) ===
Punto de partida del índice inicial. Verifica contra el grafo si algo depende de esto.

Capa core: lib → 168 llamadas inbound, CERO outbound. Infraestructura pura:
todo depende de ella, ella no depende de nada. Blast radius máximo.

Hubs (el orden cn↔server.createClient y el split del cliente de browser varían
por corrida — resolución LSP; NO re-sincronizar por ±pocos callers):
- src/lib/supabase/server.createClient → ~52–75 callers. Acceso único a Supabase
  server-side. Blast radius máximo.
- src/lib/utils.cn → ~61 callers. Merge de clases Tailwind, en casi todo componente.
- safeError → ~36 callers. Infraestructura compartida (fix P1 del commit 7a202f2).
- src/lib/supabase/client.createClient → hub aparte del cliente de browser (~7–29).

Clusters (Louvain sobre edges CALLS):
- Ventas: NuevaVentaForm / createBooking / updateLine
- Recibos: montoConLetra / centenasALetras — cohesión 1.0 (hermético)
- Reportes/Panel: DashboardPage / GraficaMensual / ReportesPage — cohesión 0.89
- WhatsApp reader: leerProductoWhatsApp / extraerConGroq — cohesión 0.89
- Marketplace/comprador: ComprarPage / ServicioPublicoPage / PedidoForm (B.1-1)
- Servicios/OG/imágenes: ServicioForm / ogCardResponse / setServicioImagen
Nota: Louvain reordena qué módulo hermético (Recibos/Webhook MP) sale al tope
por corrida; ambos son reales a cohesión 1.0.
Los de cohesión 1.0 son módulos herméticos: candidatos a extraer, y zonas donde
un cambio interno no se propaga afuera.

=== 5. MANTENIMIENTO ===
detect_changes → { "project": "home-walfro90-Desktop-codes-ketzal-app" }
  Mapea el git diff a símbolos afectados + blast radius + clasificación de riesgo.
  CÓRRELO ANTES de tocar lib/ o cualquier hub de la sección 4.
  Córrelo tras un batch de edits para decidir si vale re-indexar.

query_graph → Cypher READ-ONLY, subset de openCypher.
  Dead code: MATCH (f:Function) WHERE NOT EXISTS { (f)<-[:CALLS]-() } RETURN f.name LIMIT 50
  Soporta: MATCH, OPTIONAL MATCH, WHERE, WITH, RETURN, ORDER BY, SKIP, LIMIT,
  DISTINCT, UNWIND, UNION, CASE, paths variables [*1..3], EXISTS{} de un salto,
  agregados (count/sum/avg/min/max/collect).
  NO soporta: escritura, MERGE, CALL, list/map literals, comprehensions, params.
  Lo no soportado falla con error "unsupported ..." — si ves eso, el grafo NO
  está vacío: tu query salió del subset.

search_code → grep aumentado por grafo, solo sobre archivos indexados. No alcanza docs/.

=== 6. PENDIENTES ABIERTOS A PROPÓSITO (no ejecutar sin que yo lo pida) ===
- manage_adr: vale solo cuando una decisión de arquitectura merezca congelarse
  por escrito en vez de re-derivarse. Propónmelo ante una decisión estructural
  real (extraer el cluster de recibos, cambiar el contrato del webhook de MP).
- persistence: true → escribe .codebase-memory/graph.db.zst, snapshot zstd
  commiteable para que otra máquina/agente use el grafo sin re-indexar.
  Propónmelo cuando entre un segundo agente o máquina. Antes es peso muerto.

=== 7. CÓMO QUIERO LAS RESPUESTAS ===
- Español, directo, nivel senior. Sin preámbulo ni "voy a hacer X".
- Si una query devuelve vacío, DILO y di por qué crees que fue: nombre
  incorrecto, fuera del subset, o fuera del índice. No rellenes con suposiciones.
- Al citar un símbolo, dame el qualified name real del grafo, no una aproximación.
- Si el grafo y el disco se contradicen, GANA EL DISCO y avísame que hay drift.
```
