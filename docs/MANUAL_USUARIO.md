# Manual de usuario — Ketzal OS

> Qué hace cada pantalla y quién puede entrar a ella. Estado al **2026-08-10**.
> Este manual describe lo que existe HOY; para el porqué y la cronología de
> cada pieza ver el log en `CLAUDE.md`.

## 1. Las 4 personas de Ketzal

Todo el que entra a Ketzal tiene un solo login (`auth.users` de Supabase), pero
la app le muestra una superficie distinta según su **persona**
(`profiles.type`). Sin fila en `profiles`, por defecto es viajero.

| Persona | Quién es | A dónde llega al entrar | Qué ve |
|---|---|---|---|
| **Agente** | Vendedor de una agencia, o agente libre de Ketzal | `/dashboard` | El back-office completo (según su rol, ver §2) |
| **Viajero** | Comprador B2C, se registra al comprar un viaje | `/mis-compras` | Sus viajes, plan de pagos, voucher |
| **Embajador** | Afiliado que refiere viajeros por link | `/embajador` | Sus ganancias y su link de referido |
| **Proveedor** | Proveedor operativo (transporte, hospedaje) | `/proveedor` | Los viajes donde participa, solo lectura |

Cada persona vive en su propio "shell" (menú/cabecera). Un viajero nunca ve el
back-office; un agente nunca ve el portal de embajador. El alta de cada una:

- **Agente**: lo invita un admin o el superadmin desde `/equipo` (o se crea
  junto con su agencia desde `/equipo` si es superadmin). Nace **pendiente**
  (`active=false`) hasta que un admin lo aprueba.
- **Viajero**: se auto-registra en `/entrar` o al comprar en `/comprar/[id]`.
- **Embajador**: lo da de alta un superadmin desde `/comisiones` (nombre +
  código de referido, correo opcional). Entra por magic-link.
- **Proveedor**: se le da acceso desde la ficha de su proveedor en
  `/proveedores/[id]` ("Acceso del proveedor"). Entra por magic-link.

## 2. Roles dentro del back-office (solo aplica a la persona Agente)

| Rol | Quién | Alcance |
|---|---|---|
| **user** (agente) | Vendedor | Panel, Ventas, Clientes, Cotizaciones, Cobranza, Salidas, Abordaje, Clawbot — todo acotado a su agencia (o a lo suyo si es libre) |
| **admin** | Admin de agencia | + Cuentas, Gastos, Comisiones, Reportes, Equipo, Servicios, Proveedores — de SU agencia |
| **superadmin** | El fundador / plataforma | Todo lo anterior de TODAS las agencias, + Viajeros, Salud, Ajustes (exclusivos de plataforma) |

El aislamiento entre agencias es por Row Level Security en la base de datos
(`my_supplier_id()`): un agente o admin **nunca** ve datos de otra agencia,
sin importar lo que muestre o esconda la interfaz.

## 3. Back-office — sección por sección

Todas estas rutas viven bajo el shell `(ops)` y requieren sesión de agente
activo.

| Sección | Ruta | Acceso | Qué hace |
|---|---|---|---|
| **Panel** | `/dashboard` | todos | KPIs del negocio + tarjeta "Requiere atención" (saldos vencidos, cobros pendientes de aprobar, etc.) |
| **Ventas** | `/ventas`, `/ventas/nueva`, `/ventas/[id]` | todos | Cerrar una venta con líneas (tipo de pasajero, habitación/add-ons), registrar abonos, ver saldo derivado, capturar pasajeros, emitir voucher, elegir asientos, ver plan de pagos |
| **Clientes** | `/clientes`, `/clientes/nuevo`, `/clientes/[id]` | todos | Alta y ficha de cliente, historial de compras |
| **Cotizaciones** | `/cotizaciones` (+ público `/cotizacion/[token]`) | todos | Cotizar antes de vender, folio `COT-n` por agencia, compartir por link/PDF, convertir a venta |
| **Cobranza** | `/cobranza` | todos | Cruza el plan de pagos contra los abonos reales: a quién cobrar y quién va atrasado; aprobar/rechazar comprobantes de SPEI/efectivo subidos por el viajero |
| **Cuentas** | `/cuentas` | **admin** | Ledger balance-0 de la plataforma: saldo por actor (plataforma/agencia/embajador/viajero), movimientos, botón Liquidar (solo superadmin) |
| **Salidas** | `/salidas`, `/salidas/[id]`, `/manifiesto`, `/roomlist` | todos | Salidas por fecha con ocupación, manifiesto imprimible para el camión, buslist (asientos) y roomlist (hotel) |
| **Abordaje** | `/abordaje`, `/abordaje/[voucherId]` | todos | Escáner del QR del voucher para hacer check-in de cada pasajero con su asiento |
| **Gastos** | `/gastos`, `/gastos/nuevo` | **admin** | Egresos operativos (ledger append-only), cuentas por pagar a mayoristas y a embajadores, KPIs de utilidad |
| **Clawbot** | `/clawbot` | todos | Bandeja de recordatorios automáticos (abono por vencer, cotización sin cerrar, viaje próximo) para enviar por WhatsApp con 1 clic |
| **Comisiones** | `/comisiones` | **admin** | Tarifa de Ketzal por servicio, alta de embajadores + su tarifa por servicio, resumen de comisión ganada/costo |
| **Reportes** | `/reportes` | **admin** | Gráficas, exportar CSV, conversión cotización→venta, meta del mes vs vendido |
| **Equipo** | `/equipo` | **admin** | Invitar agentes, delegar rol (user↔admin), metas de venta del mes; superadmin además crea agencias nuevas + invita a su admin |
| **Viajeros** | `/viajeros`, `/viajeros/[id]`, `/nuevo` | **superadmin** | Lista global de compradores B2C de toda la plataforma |
| **Servicios** | `/servicios`, `/nuevo`, `/[id]` | **admin** | Catálogo de viajes: precio con opciones, galería (≤20 fotos), video, temporadas (ajuste % por salida), publicar/despublicar a la vitrina |
| **Proveedores** | `/proveedores`, `/nuevo`, `/[id]` | **admin** | Agencias y proveedores operativos (transporte, hospedaje): perfil público, dar acceso de login, conectar Mercado Pago (split) |
| **Salud** | `/salud` | **superadmin** | Invariantes de dinero (debe dar 0 siempre) + log de eventos del sistema (cron, webhooks) |
| **Ajustes** | `/ajustes` | **superadmin** | Logo oficial de la marca (header, login, documentos) |

## 4. Portales fuera del back-office

| Portal | Ruta | Qué hace |
|---|---|---|
| **Embajador** | `/embajador` | Su link de referido para copiar/compartir (`/explora?ref=código`), cuánto ha devengado, cuánto se le ha pagado, su saldo, lista de ventas atribuidas. No vende dentro del OS (solo refiere) — eso es intencional, no una limitación por resolver |
| **Proveedor** | `/proveedor` | Lista de los viajes donde participa (como dueño, transporte u hospedaje), solo lectura — no ve ventas ni dinero |
| **Viajero** | `/mis-compras`, `/mis-compras/[id]`, `/descubre`, `/perfil` | Sus viajes comprados, plan de pagos con checklist de abonos, registrar a sus acompañantes, elegir asiento, ver/descargar su voucher; `/descubre` es el catálogo dentro de su shell |

## 5. Vitrina pública (sin login, indexable)

| Ruta | Qué es |
|---|---|
| `/explora` | Catálogo de viajes publicados, con filtros, precio y agencia enlazada |
| `/agencias` | Directorio de agencias |
| `/agencia/[id]` | Perfil público de una agencia: logo, métricas, galería, viajes, reseñas |
| `/servicio/[id]` | Ficha de un viaje: precio "desde", calendario de salidas (con nota de cada salida), temporadas, precio por persona (packs), descripción, video, incluye / no incluye, itinerario, FAQs, reseñas, CTA de compra |
| `/comprar/[serviceId]` | Flujo de compra del viajero (alta rápida + resumen + pago). Vive detrás del flag `NEXT_PUBLIC_MARKETPLACE` |
| `/entrar` | Login/registro del comprador (email + contraseña, nunca nace como agente) |
| `/politica-cancelacion` | Política de cancelación vigente (crédito, plazos, penalizaciones) |

## 6. Documentos compartibles por link (sin login, por token)

Estos no requieren sesión — cualquiera con el link los ve, pero cada uno
expone solo lo que le corresponde a su rol (el voucher, por ejemplo, nunca
muestra dinero):

| Documento | Ruta |
|---|---|
| Cotización | `/cotizacion/[token]` |
| Recibo | `/recibo/[receiptId]` |
| Estado de cuenta | `/estado/[token]` |
| Voucher de servicio (con QR de abordaje) | `/voucher/[voucherId]` |

## 7. Cómo se cobra una venta

- **Ledger interno**: registrar abonos en efectivo/transferencia manual desde
  `/ventas/[id]`. Es la forma base, siempre disponible.
- **Mercado Pago (Checkout Pro)**: el viajero paga en línea.
  - **Sin la agencia conectada**: el dinero cae a la cuenta de Ketzal;
    el pago se le liquida a la agencia con **payout a 7 días**.
  - **Con la agencia conectada** (botón "Conectar mi Mercado Pago" en
    `/proveedores/[id]`, requiere que el fundador tenga configurado
    `MP_CLIENT_ID`/`MP_CLIENT_SECRET`): el dinero cae **directo** a la
    cuenta de la agencia y la comisión de Ketzal se separa sola al
    momento del cobro.
- **SPEI directo / efectivo en cajero**: el viajero sube un comprobante,
  un admin lo aprueba desde `/cobranza`.
- **Plan de pagos**: enganche % configurable + abonos programados hasta la
  fecha del viaje; checklist verde/ámbar/rojo contra lo realmente pagado.

En todos los casos el saldo de una venta se **deriva** siempre
(total − pagos + reembolsos) — nunca es un campo que se edite a mano.

## 8. Automatización

- **Clawbot** (`/clawbot`): reglas diarias que generan recordatorios
  (abono por vencer/vencido, cotización sin cerrar, viaje próximo, saldo sin
  plan, viaje mañana, pago sin recibo). El agente los envía por WhatsApp con
  1 clic; el envío 100% automático por WhatsApp existe en código
  (`wa-sender/`) pero está **pausado** a propósito hasta tener un número
  dedicado.
- **Notificaciones**: campana in-app + Web Push (aviso cuando el viajero
  sube su lista de pasajeros, cuando se aprueba un pago, etc.).
- **Cron** (`/api/clawbot/tick`, protegido por `CRON_SECRET`): corre las
  reglas de Clawbot y el chequeo de salud a diario.
