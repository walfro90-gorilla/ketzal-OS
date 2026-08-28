# ADR-0004 — Tenancy: agencias = filas de `suppliers`; RLS por `my_supplier_id()` en todo

- Estado: aceptada · Fecha: 2026-07-08 · Sustituye: —
- Alcance: schema `ketzal` completo; toda tabla y RPC nuevos

## Contexto
El schema heredado ya tenía `suppliers` y `profiles.supplier_id`. Crear una
tabla `agencies` aparte habría duplicado el concepto y partido la RLS en dos
caminos. El riesgo #1 del producto es fuga de datos entre agencias.

## Decisión
- Las agencias NO son tabla nueva: son filas de **`suppliers`** con
  `supplier_type = 'agency'`. Proveedores operativos (hotel, transporte) son
  `suppliers` de otro tipo.
- **Toda** tabla con datos de negocio lleva RLS por `supplier_id` resuelta
  vía `ketzal.my_supplier_id()` (+ `ketzal.is_superadmin()` como bypass).
  Un agente jamás ve datos de otra agencia.
- Dos tipos de vendedor: agente de agencia (`profiles.supplier_id` set) y
  agente Ketzal libre (`supplier_id` null, comisión de plataforma).
- Los RPCs `SECURITY DEFINER` repiten el guard adentro (la RLS no aplica al
  DEFINER) y **todo guard con OR lleva `coalesce(..., false)`** — un NULL en
  un OR deja pasar (bug real cazado en b041).

## Consecuencias
- El multi-tenant SaaS salió "gratis" (capa delegada P0–P3): admin de agencia
  = rol + supplier_id, sin shell nuevo.
- Los gates de UI (`ADMIN_HREFS`, nav) son cosmética; la frontera real SIEMPRE
  es RLS + guards SQL (un JWT puede llamar PostgREST directo).
- Costo: cada feature nueva debe pensarse "¿qué ve la otra agencia?" y
  hard-testearse adversarialmente.

## Verificación
`get_advisors` (security) en 0 ERROR; hard-tests adversariales de aislamiento
en `supabase/tests/`; grep de policies nuevas debe mostrar `my_supplier_id`.

## Fuentes
`docs/DATA_MODEL.md` (decisión reconciliada), regla de oro #1, migraciones
`ketzal_os_v1_*`, hard-tests b058–b063 (endurecimiento de posiciones).
