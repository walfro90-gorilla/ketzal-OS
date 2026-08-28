# ADR-0015 — Proyecto Supabase dedicado para Ketzal + bucket `ketzal-assets`

- Estado: aceptada · Fecha: 2026-08-26 · Sustituye: proyecto compartido Gorilla-Labs

## Contexto
Ketzal compartía el proyecto Supabase "Gorilla-Labs" (`wnujoyzdpdyxblgdtxjw`)
con un CRM/swarm y un producto de tiendas: mismo Auth (un magic link de
Ketzal aterrizó en hub.gorillabs.dev porque el Site URL es un dial único),
mismo Storage (bucket `gorilla-assets` mezclado con archivos del CRM y con
policies de escritura `{public}` por accidente), mismo historial de
migraciones. A punto de arrancar operación real, el blast radius compartido
era inaceptable — y con la BD casi en cero, migrar era casi gratis.

## Decisión
- Ketzal vive en su **propio proyecto**: `uznqmmeqwbbjkotbxwsw`
  ("Ketzal-OS", **organización ECS separada**, us-east-1, PG 17).
- Storage en bucket **dedicado `ketzal-assets`** (público en lectura;
  INSERT/UPDATE solo `authenticated`, scoped al bucket). Prefijos:
  `services/`, `suppliers/`, `spei/`, `brand/`.
- Las 6 cuentas se recrearon con **mismo UUID y mismo hash de contraseña**
  (copia DB-a-DB) — los ids referenciados por FKs/datos no cambiaron.
- El schema `ketzal` del proyecto viejo queda dormido unos días como red de
  seguridad y luego se borra (junto con sus objetos en `gorilla-assets`).
- Config que NO viaja con el schema y se rehace a mano en el dashboard:
  exposed schemas (Data API: `ketzal`), Site URL/redirects, Google OAuth,
  templates de correo, hCaptcha, y la membresía Realtime de `notifications`.

## Consecuencias
- Cambios de Auth/config de Ketzal ya no pueden romper (ni ser rotos por)
  los otros productos; `db pull/push` de la CLI por fin es viable.
- `next.config.ts` permite ambos hosts durante la ventana de corte — quitar
  el viejo al cerrar el cutover.
- Rotar el service role key invalida HMACs derivados (QR de voucher, state
  de MP OAuth) — sin operación real al migrar, impacto cero.

## Verificación
Hashes de schema idénticos viejo↔nuevo (registrados en la sesión de
migración); `verificar_invariantes()` 0; advisors 0 ERROR; login aterriza en
ketzal-os.vercel.app.

## Fuentes
Bitácora 2026-08-26/27, commit `a6ca662`, migración `ketzal_baseline` en el
proyecto nuevo, memoria `ketzal-migracion-supabase`.
