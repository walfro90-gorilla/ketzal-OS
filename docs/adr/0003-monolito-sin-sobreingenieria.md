# ADR-0003 — Monolito Next.js + Supabase; sin sobre-ingeniería

- Estado: aceptada · Fecha: 2026-07-08 · Sustituye: —
- Alcance: arquitectura completa; evaluación de toda propuesta técnica nueva

## Contexto
Un solo fundador-operador, tres agencias, volumen de decenas de ventas al
mes. El riesgo real es complejidad que nadie mantiene, no escala que nadie
alcanza. Al comparar contra un back-office competidor (~59 funciones) se
descartaron explícitamente varias de sus piezas.

## Decisión
- **Monolito modular**: Next.js (App Router) + Supabase (Postgres, Auth,
  Storage, RLS) en Vercel. Sin microservicios, sin colas distribuidas, sin
  Kafka, sin sharding, sin multi-región. Aburrido = estable.
- Escalera antes de escribir código: ¿necesita existir? → ¿ya está en el
  repo? → ¿lo hace la plataforma (constraint de BD, RLS, CSS)? → ¿dependencia
  ya instalada? → recién entonces código propio mínimo.
- **Descartados del plan competidor (no implementar sin nueva decisión):**
  cargo directo a tarjeta/PCI, crédito corporativo B2B, 12 estatus de venta,
  módulo de bodas completo, conciliación de cuentas bancarias.

## Consecuencias
- Deploy = push a main; una sola base de datos; debugging lineal.
- Techo conocido: si algún día hay decenas de agencias concurrentes, se
  re-evalúa con datos (ADR nuevo), no antes.
- Toda dependencia nueva se justifica en su PR; "para después" no es
  justificación.

## Verificación
`package.json` sin colas/brokers; un solo proyecto Vercel; los descartados no
aparecen en el código.

## Fuentes
`docs/ARCHITECTURE.md` (principio rector), `docs/PLAN_COMPETIDOR.md`
§Descartados.
