# Pruebas end-to-end a mano — Ketzal OS

> Checklist para validar a mano lo que ya está implementado. Marca `[x]` lo que pase.
> Prod: **https://ketzal-os.vercel.app**. Última actualización: 2026-07-23.

## 0. Preparación e higiene (leer primero)

- **Es PROD sobre una BD compartida.** Las pruebas de dinero **crean filas reales**
  (`bookings`, `payments`, `receipts`). El ledger es **append-only**: no se borran —
  se corrigen con **cancelación / reembolso** (asiento nuevo). Planéalo.
- **Usa una agencia de prueba y un cliente de prueba** para no ensuciar datos reales.
  Ya existen agencias QA (Alfa/Beta) y la sembrada *"Agencia Prueba (P3)"*.
- **Servicios de prueba: déjalos SIN publicar** (toggle "Publicación" en OFF) para que
  no salgan en `/explora` público.
- **Roles** (lo que ves cambia según el rol):
  - **superadmin** (`wal@gorillabs.dev`): ve todo, `/salud`, `/ajustes`, selector de 3 roles.
  - **admin de agencia** (`role=admin` + `supplier_id`): gestiona SU agencia.
  - **agente** (`role=user`): vende dentro de su agencia.
  - **agente libre** (`supplier_id` null): vende todo, comisión de plataforma.
- **Orden recomendado:** primero el **camino crítico del dinero** (Suites 2→3→4), que es
  el corazón; lo demás cuelga de ahí.

---

## 1. Auth + aprobación de usuarios

- [ ] Registro nuevo (email+password) → el usuario nace **pendiente** (`active=false`),
      no puede entrar a `(ops)`.
- [ ] Superadmin/admin lo aprueba en **`/equipo`** → ahora sí entra.
- [ ] Login por **magic link**, por **contraseña** y por **Google** funcionan.
- [ ] Recuperación de contraseña.

## 2. Multi-agencia SaaS (lo más nuevo — P0→P3)

- [ ] **Superadmin → `/equipo` → "Crear agencia"**: nombre + correo del admin + comisión %.
      Se crea la agencia y se invita a su admin en un paso.
- [ ] Login con ese correo → al primer login se **auto-une como `admin`** de esa agencia
      (magic-link/Google **y** contraseña — ambos disparan el auto-join).
- [ ] **Admin → `/equipo` → "Invitar agentes"**: invita un correo como *Agente*.
      Login de ese correo → auto-join como `user` de la misma agencia.
- [ ] **Aislamiento:** el admin en `/proveedores`, `/ventas`, `/dashboard` solo ve **su**
      agencia (no las demás). El agente igual.
- [ ] **Adversarial (debe FALLAR / no aparecer):** el admin no puede invitar a otra
      agencia, no puede ponerse `superadmin`, no puede promover cross-agencia.
- [ ] Admin promueve un `user`→`admin` de su agencia (botón "Hacer admin"); no puede
      auto-degradarse (su propia fila no muestra el botón).

## 3. Venta (corazón): cotización → venta → abonos → recibo

- [ ] **`/servicios`**: crea un servicio con **opciones** (tipos de pasajero + habitación/add-ons).
      Déjalo sin publicar.
- [ ] **Cotización** (`/ventas/nueva` o desde el servicio): genera una cotización →
      aparece folio **`COT-n`** en `/cotizaciones`.
- [ ] Abre el **link público** `/cotizacion/[token]` (sin sesión) → se ve el folio + desglose.
- [ ] **Convertir a venta** → conserva el mismo folio (badge "Origen: COT-n" en la venta).
- [ ] Venta con **líneas + descuento** → el **importe** cuadra (Σ cant×precio − descuento).
- [ ] **Plan de pagos**: fija enganche % (default 20%) + frecuencia (semanal/quincenal/mensual).
      La suma de las cuotas = total (invariante).
- [ ] **Abonos**: registra un abono → el **saldo baja** (derivado: total − pagos + reembolsos).
      No deja cobrar 0/negativo ni más que el saldo.
- [ ] **Recibo** foliado por cada abono (`/recibo/[uuid]` público) con **cantidad con letra**.
      Al saldar aparece el sello **"Liquidada"**.
- [ ] **Estado de cuenta** público `/estado/[token]` (compartible por WhatsApp).
- [ ] **Reembolso / cancelación**: genera un asiento `refund` (no borra) → el saldo se ajusta
      y sale "Recibo de reembolso". (Úsalo para "limpiar" una venta de prueba.)

## 4. Divisas USD (F6)

- [ ] En `/ventas/nueva` elige **USD** + captura **TC** → los precios en USD se convierten a
      MXN en vivo. Al guardar, el motor guarda **MXN** (autoritativo).
- [ ] Ej.: USD $1,000 @ 17.50 ⇒ **$17,500 MXN**. En `/ventas/[id]` se ve "Divisa original: USD · TC".
- [ ] Documentos públicos (recibo/cotización/estado) muestran **MXN** + nota "Operación pactada en USD".
- [ ] Sin TC en USD → **debe rechazar**. Venta en MXN normal sin regresión.

## 5. Pago en línea (Mercado Pago)

- [ ] Genera link de pago de una venta → paga (SPEI / tarjeta) → el **webhook** marca `approved`
      y aparece el **abono** en el ledger (saldo baja). *(Validado en prod antes con SPEI real.)*

## 6. Gastos + Cuentas por Pagar (F2)

- [ ] **`/gastos` → nuevo gasto** (categoría; si es **mayorista** exige proveedor).
- [ ] **Reverso** de un gasto → genera **contra-asiento** (neto 0); no se puede reversar dos veces.
- [ ] KPIs del mes + sección **CxP a mayoristas** ("Registrar pago" prellenado).
- [ ] **`/reportes`**: cards **"Gastos"** y **"Utilidad"** (= vendido − gastos del rango) + en el CSV.

## 7. Pasajeros + Salidas + Manifiesto (F3)

- [ ] En **`/ventas/[id]`** captura pasajeros (nombre/tipo/doc) → contador **X/num_pax**.
- [ ] **`/salidas`**: lista con ocupación + progreso de captura.
- [ ] **`/salidas/[id]`**: KPIs de ocupación + ventas del camión. El **dinero de reventas ajenas
      es privado** (solo ves el tuyo).
- [ ] **`/salidas/[id]/manifiesto`**: pase de abordar imprimible (con sesión, PII, sin token
      público) — lista TODOS los pax del camión, incl. reventas.

## 8. Voucher de servicio (F4)

- [ ] En **`/ventas/[id]`** emite **voucher** (solo `reserved/confirmed/paid`). Emitir 2 veces =
      **mismo folio** (idempotente).
- [ ] **`/voucher/[id]`** abre **sin sesión** y **NO muestra dinero** (acredita el servicio).

## 9. Metas + Conversión (F5)

- [ ] **`/equipo` → "Metas del mes"**: fija meta de agencia y por agente → ves **% de avance**.
- [ ] **`/reportes`**: cards **"Meta del mes"** y **"Conversión (cotización→venta)"** + en el CSV.

## 10. Cobranza + Clawbot in-app

- [ ] **`/cobranza`**: a quién cobrar / quién va atrasado (cruza plan de pagos vs abonos reales).
- [ ] **`/clawbot`**: outbox de recordatorios → botón **enviar por WhatsApp a 1 clic** (abre `wa.me`
      con el mensaje). *(Esto es el envío MANUAL — el auto-envío está pausado, ver Nota WA abajo.)*

## 11. Reportes, búsqueda y listas

- [ ] **`/reportes`**: gráficas + KPIs por agente/servicio/mes + **exportar CSV**.
- [ ] **`/dashboard`**: KPIs + "Requiere atención".
- [ ] Buscador global **⌘K**. Filtros + orden por columna en las listas. Sidebar colapsable, dark mode, PWA.

## 12. Vitrina pública B2C (sin login)

- [ ] **`/explora`**: viajes publicados, filtro de precio, orden, badges de tipo, agencia enlazable.
- [ ] **`/agencias`**: directorio con rating.
- [ ] **`/agencia/[id]`**: perfil (logo, métricas reales, galería, viajes, redes, reseñas).
- [ ] **`/servicio/[id]`**: ficha con galería/carrusel + video (YouTube/Vimeo) + estrellas.

## 13. Marketplace B2C (detrás de flag)

> Solo si prendes `NEXT_PUBLIC_MARKETPLACE` en Vercel + redeploy. **Aislado de las agencias.**

- [ ] CTA "Comprar en línea" en la ficha → **`/comprar/[serviceId]`**: alta rápida de comprador
      (email+password, tabla `marketplace_customers`) → resumen + **handoff a WhatsApp**.

## 14. Salud del sistema (superadmin)

- [ ] **`/salud`**: chequeo de invariantes de dinero = **0 violaciones** + log de eventos (cron/webhook).

---

## Nota WhatsApp auto-envío — PAUSADO ⏸️

El **auto-envío** por WhatsApp está **pausado a propósito** (gate `wa_auto_enabled=OFF`,
esperando el número dedicado). El **Clawbot in-app** (Suite 10, envío manual a 1 clic) **sí
funciona** y es independiente. Para retomar el auto-envío: `wa-sender/DEPLOY_STATUS.md`.

## Cómo limpiar datos de prueba

- Dinero (`bookings`/`payments`/`receipts`): **no se borra** (ledger append-only). Cierra la
  venta de prueba con **cancelación / reembolso**, o déjala en una agencia de prueba.
- Servicios de prueba: bájalos con el toggle de **Publicación** (o bórralos si no tienen ventas).
- Invitaciones pendientes: **Revocar** desde `/equipo`.
