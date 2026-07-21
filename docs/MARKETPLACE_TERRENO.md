# Terreno del Marketplace (Fase B)

> Plan acordado con el fundador. La Fase B abre el camino B2C (🅰️) sobre el
> catálogo público que ya existe, **sin** romper el alcance del OS (🅱️).
> Cada paso es reversible y verificable.

## Objetivo

Que un visitante del catálogo público que quiera **comprar en línea** pueda
**crear una cuenta rápido** y **adquirir el servicio**, sin depender de WhatsApp.

## Decisiones (confirmadas)

1. **Identidad del comprador** — tabla nueva **`ketzal.marketplace_customers`**
   (uid de Supabase Auth → nombre/teléfono/email), **aislada** de `profiles`
   (agentes). Auto-registro, sin aprobación. No toca la RLS por agencia.
2. **Lanzamiento oscuro** — feature flag `NEXT_PUBLIC_MARKETPLACE` (`off` por
   default). El CTA y las rutas nuevas quedan invisibles hasta prenderlo.
3. **Pago** — reusar **MP Checkout Pro** (ya validado en prod); Openpay después.

## Pasos

### B.0 — Terreno mínimo ✅ APLICADO

Abre el camino y la cuenta de comprador, **sin tocar dinero**:

- Flag `NEXT_PUBLIC_MARKETPLACE` (`src/lib/marketplace.ts`), off por default.
- Tabla `marketplace_customers` + RLS **solo-dueño** (`id = auth.uid()`), aislada
  de `profiles`. Migración `ketzal_marketplace_customers`; snapshot re-sincronizado.
- Registro de comprador (`/comprar/actions.ts`): `signUp` con **email+password**
  (NO magic link/OAuth, para no pasar por `/auth/callback` → el comprador nunca
  nace como agente en `profiles`). La fila se crea con service role (idempotente).
- Ruta `/comprar/[serviceId]` (detrás del flag): sin sesión → alta rápida; con
  cuenta → resumen del viaje + **handoff a WhatsApp** para coordinar la compra
  (el pago en línea llega en B.2).
- CTA **"Comprar en línea"** en la ficha (`/servicio/[id]`), detrás del flag,
  como acción primaria; WhatsApp pasa a secundaria.

**Aislación verificada:** `ensure_profile` solo corre en `/auth/callback`; el
comprador (email+password) no lo dispara. `marketplace_customers` no tiene policy
de agente/superadmin. Advisors: 0 errores.

**Hard testing B.0 (2026-07-20):**
- **Grants** — la migración concede `SELECT/INSERT/UPDATE` solo a `authenticated`
  (sin `PUBLIC`/`anon`) ⇒ un anónimo no lee ni escribe la tabla.
- **Policies** — las 3 son `id = auth.uid()` (SELECT/INSERT/UPDATE); ninguna
  referencia helpers de agente ⇒ un comprador solo ve/edita su fila; un agente
  no ve filas de compradores.
- **No-forge** — `registrarComprador` inserta con el `id` que devuelve `signUp`
  (no forjable); `guardarComprador` va por RLS (`id = auth.uid()`); el `INSERT`
  con check `id = auth.uid()` bloquea crear la fila de otro por PostgREST.
- **Escalada** — aun si el caso email-confirm creara un `profiles`, nace
  `active=false` sin `supplier_id` ⇒ cero acceso al lado de agentes
  (`is_active()` lo corta). Cierre en B.1-0.
- **Inyección** — las acciones usan el cliente Supabase parametrizado (sin SQL
  por concatenación).
- *Pendiente por tooling:* la simulación viva de RLS entre dos compradores
  (`set role` + jwt claims) no se pudo correr por abortos del MCP en esta
  sesión; la aislación se sostiene en la estructura de arriba. Repetir en B.1
  con `set local request.jwt.claims` cuando el tooling coopere.

### B.1 — Pedido de marketplace + endurecer confirmación (pendiente)

> **Se continúa en Claude console** (esta sesión sigue con UI/UX).

**B.1-0 ✅ APLICADO (2026-07-20) — `ensure_profile` buyer-aware.**
Se cerró por la opción (c): un guard en la **función compartida** en vez de una
ruta nueva + config de dashboard. Cierra el hoyo por **todos** los caminos a
`ensure_profile`, no solo el link de correo. Migración `ensure_profile_buyer_aware`:
```sql
where u.id = auth.uid()
  and not exists (select 1 from ketzal.marketplace_customers m where m.id = auth.uid())
```
Así, aunque el link de confirmación caiga en `/auth/callback`, un comprador
(fila en `marketplace_customers`) **nunca** nace como `profiles`/agente pendiente.
Verificado: self-check del predicado (no-comprador→inserta, comprador→salta) OK;
advisors de seguridad **0 errores**. Migración no versionada en repo (Supabase es
la fuente, per convención). Descartadas (a) ruta `/comprar/confirmado` y (b)
Redirect URLs por más diff y menos cobertura.

**B.1-1:** `/comprar/[serviceId]` crea un **pedido** (booking en estado nuevo,
`selling_supplier_id` = plataforma / agencia dueña) ligado al comprador,
respetando **cupo** (`service_departures`, transaccional).

### B.2 — Pago en línea (pendiente)

MP Checkout Pro para el pedido → webhook `approved` → confirma, baja el cupo,
registra el **abono en el ledger** y la **comisión de plataforma**, y **avisa a
la agencia** (Clawbot/WhatsApp).

### B.3 — Post-venta (pendiente)

Área "Mis compras" del comprador + bandeja de pedidos de marketplace para la
agencia.

## Reglas de oro que respeta

- **Aislamiento RLS:** comprador ≠ agente; la RLS por agencia no se toca.
- **Cupo transaccional** y **ledger append-only** (desde B.1/B.2).
- **Comisión** por reventa / plataforma con los campos ya existentes.
- **Sin sobre-ingeniería:** monolito Next + Supabase + MP; flag para lanzamiento
  oscuro.
