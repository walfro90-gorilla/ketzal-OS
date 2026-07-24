# Refactor de identidad bajo `profiles` — plan aprobado (retomar aquí)

> Estado: **plan aprobado 2026-07-24, sin ejecutar aún.** Retomar por Fase 0.
> Contexto de negocio en la memoria `modelo-usuarios`. Motor de comisiones ya en
> main (b019–b023); este refactor lo re-toca en la Fase 2.

## Por qué

Principio del fundador: **todo usuario de Ketzal tiene UN perfil de usuario**; se
diferencian por **tipo** — proveedor, embajador o viajero (+ agente/admin internos).
Hoy la identidad está fragmentada en 3 tablas:

| Persona | Hoy vive en | Login |
|---|---|---|
| Agente / admin | `profiles` (role user/admin/superadmin, `supplier_id`) | sí |
| Viajero (comprador) | `marketplace_customers` (aislada, sin profile) | sí |
| Embajador | `suppliers` (`supplier_type='embajador'`) | no |
| Proveedor operativo | `suppliers` | no |

Discriminador de persona actual = **"¿existe fila en `profiles`?"** (`src/lib/persona.ts`,
`src/proxy.ts`, `ensure_profile`). Rompe en cuanto un viajero tenga profile ⇒ hay que
cambiar el discriminador a un `type` explícito.

## Decisiones (cerradas con el fundador)

- Unificar **los tres** (viajero + embajador + proveedor).
- Discriminador = **columna `profiles.type` nueva** (enum). `role` (user/admin/superadmin)
  queda como **permiso**, ortogonal al tipo.
- Embajador **full**: mover el payee de comisiones de `suppliers` a `profiles`.

## Habilitadores / riesgo

- **Prod balance 0** (0 marketplace_customers, 0 suppliers, 1 profile) ⇒ **cero backfill**;
  se migra el modelo gratis.
- `profiles` ya trae `referral_code` y `axo_coins_earned` del scaffold B2C original — el
  sueño 🅰️ siempre pensó profiles = viajeros; `marketplace_customers` fue el atajo de B.0.
- **Riesgo alto sólo en Fase 2** (embajador full re-toca el motor validado) ⇒ su hard-test es
  la re-validación completa de los 12 checks del motor.

## Modelo objetivo

- **`profiles` = capa de PERSONA** (todo el que se loguea; keyed por `auth.uid`).
  Nueva columna `type` (enum `ketzal.profile_type`): `agente | proveedor | embajador | viajero`.
- **`suppliers` = capa de NEGOCIO/tenant** (agencias + proveedores operativos). Persona
  `proveedor`/`agente` se liga a su suppliers vía `profiles.supplier_id` (ya existe).
- **Embajador** = persona pura: su profile ES el payee de comisión (sin fila en suppliers).
  **Viajero** = persona pura (sin suppliers, sin marketplace_customers).

## Radio de impacto (verificado)

- **BD**: **17 funciones** referencian `marketplace_customer` — `ensure_profile`,
  `create_marketplace_order`, `confirm_online_payment`, `list_my_marketplace_orders`,
  `get_my_trip`, `submit_rating`, `list_travelers`, `list_traveler_purchases`,
  `get_service_reviews`, `emit_my_voucher`, `alertas_anomalias_dinero`,
  `create_marketplace_payment_intent`, `generate_marketplace_payment_plan`, y las 4 del motor
  (`attribute_booking_by_ref`, `set_booking_ambassador`, `tg_commission_snapshot`,
  `commissions_summary`). Policies: `marketplace_customers` (mc_*), `profiles` (own).
- **App**: `src/lib/persona.ts`, `src/proxy.ts`, `src/app/auth/callback/route.ts`,
  `src/app/comprar/actions.ts` + `[serviceId]/{page,comprador-forms}.tsx`,
  `src/app/entrar/page.tsx`, `src/app/(travel)/**` (layout, mis-compras, perfil, descubre),
  `src/app/(ops)/viajeros/**`, y los editores del motor (`(ops)/comisiones/*`, `(ops)/gastos/*`)
  donde el selector de embajador pasa de `suppliers` a `profiles`.
- **b017 lockdown**: `authenticated` NO puede escribir `profiles` ⇒ **toda** creación/cambio de
  profile (alta de viajero, set de `type`) va por **RPC `SECURITY DEFINER` con guard**.

## Plan por fases (cada una shippable + hard-test propio)

### Fase 0 — Fundación: `profiles.type` + discriminador (sin cambio de comportamiento)
- **BD** (`b024_profile_type.sql`): enum `ketzal.profile_type`; `profiles.type` (default `'agente'`
  NOT NULL); backfill `update profiles set type='agente'`. Helper `ketzal.my_profile_type()`
  (DEFINER). `ensure_profile` setea `type='agente'`.
- **App**: `persona.ts`/`proxy.ts` — `getPersona` lee `profiles.type` (`viajero`→traveler, resto→agent)
  en vez de "existe profile". Comportamiento idéntico hoy (todos agente); sólo cambia el mecanismo.
- **Hard-test**: backfill ok; persona resuelve igual; advisors 0 ERROR.

### Fase 1 — Viajero: `marketplace_customers` → `profiles(type='viajero')`
- **BD** (`b025_viajero_profiles.sql`): RPC `register_traveler(full_name,phone)` (DEFINER, crea
  `profiles(id=auth.uid, type='viajero', active=true)` — reemplaza el insert a marketplace_customers).
  Re-aplicar las 17 funciones: `exists(marketplace_customers where id=uid)` →
  `exists(profiles where id=uid and type='viajero')` (o `my_profile_type()='viajero'`).
  `customers.marketplace_customer_id` / `bookings.marketplace_customer_id` conservan nombre y
  semántica (= uid del viajero). **Drop `marketplace_customers`** al final (balance 0).
- **App**: `registrarComprador`→`register_traveler`; `auth/callback` rutea por type; `(travel)/**`
  y `(ops)/viajeros` leen de `profiles(type='viajero')`; `entrar/page.tsx`.
- **Aislamiento preservado**: viajero tiene `supplier_id=null` ⇒ `my_supplier_id()` null ⇒ cero
  acceso a datos de agencia (misma garantía que hoy).
- **Hard-test**: alta viajero = profile type=viajero (no agente); pedido marketplace end-to-end;
  aislamiento; persona→`/mis-compras`. Rollback.

### Fase 2 — Embajador FULL: payee a `profiles` (re-toca el motor) ⚠️ riesgo alto
- **BD** (`b026_embajador_profiles.sql`): embajador = `profiles(type='embajador')` con `referral_code`
  (columna ya existe). Rewire (0 filas ⇒ migrable):
  - `commission_lines`: +`payee_profile_id` (→profiles) junto a `payee_supplier_id`; CHECK
    "exactamente uno según payee_type" (plataforma=ambos null, agencia=supplier, embajador=profile).
  - `bookings.ambassador_id` → **profiles(id)**.
  - `commission_rules`: scope embajador = profile (`scope_profile_id` o polimórfico). Ajustar
    `resolve_commission_rule` y `set_commission_rule`.
  - `attribute_booking_by_ref`: lookup por `profiles.referral_code` + `type='embajador'`.
  - `set_booking_ambassador`: valida `profiles.type='embajador'`; estampa `payee_profile_id`.
  - `tg_commission_snapshot`, `commissions_summary`: `payee_profile_id` para embajador.
  - `expenses`: +`provider_profile_id` (pago a embajador); `provider_supplier_id` queda para
    mayorista; CHECK por categoría. Ajustar `create_expense` y `ambassador_payables_summary`.
- **App**: alta de embajador pasa de `/proveedores` a alta de **profile** type=embajador; selectores
  de embajador en `(ops)/comisiones/reglas-servicio.tsx` y `(ops)/gastos` leen `profiles(type='embajador')`;
  `?ref` intacto (resuelve por `profiles.referral_code`).
- **Hard-test**: **re-correr la validación consolidada de 12 checks del motor** con embajador=profile
  (tarifa por servicio, atribución manual + `?ref`, devengo, CxP+pago, `commissions_summary`,
  `verificar_invariantes`=0, congelado). Rollback. Advisors 0 ERROR.

### Fase 3 — Proveedor: persona ligada a su suppliers (thin)
- **BD** (`b027_proveedor_type.sql`): `profiles(type='proveedor')` ligado por `supplier_id` a su
  `suppliers`. RPC de alta/invitación (reusa patrón `b018`). Sin mover `suppliers`.
- **App**: gating de shell para `type='proveedor'` (ve solo su suppliers/servicios; RLS por
  `my_supplier_id` ya lo acota). **Sin self-service UI nueva** salvo pedido explícito.
- **Hard-test**: proveedor loguea y ve solo lo suyo; no ve otras agencias; no accede a `/gastos`
  de plataforma. Rollback.

## Convenciones / coordinación
- Espejos `db/proposed/b024`–`b027`. RPCs nuevos con cast `as never`; no tocar `database.types.ts`.
  Toda escritura de `profiles` por RPC DEFINER (b017). Cada fase: `tsc`+`build` limpios, advisors
  0 ERROR, hard-test SQL en rollback (prod balance 0), push a main tras rebase.

## Verificación (por fase, en prod, rollback)
- SQL hard-test por fase, todo `begin; … rollback;` — cero residuo, sin tocar el balance.
- Tras Fase 2: re-correr la validación consolidada de 12 checks con embajador=profile.
- `tsc --noEmit`, `./node_modules/.bin/next build`, `npx vitest run` (57 tests de dominio).
- `get_advisors security` = 0 ERROR tras cada migración; confirmar prod limpia tras cada rollback.
- Opcional para ver datos QA persistentes en la app sin ensuciar prod (ledgers inmutables):
  usar una **Supabase branch**, no la BD de prod.
