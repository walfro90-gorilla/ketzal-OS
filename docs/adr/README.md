# ADRs — Registros de Decisiones de Arquitectura

Las **reglas del juego** de Ketzal, una decisión por archivo. Formato y
proceso en [ADR-0001](0001-registro-de-decisiones.md). Historia narrativa en
`docs/BITACORA.md`. **Decisión estructural nueva ⇒ ADR antes de mergear, y
este índice se actualiza en el mismo diff.**

| # | Decisión | Estado |
|---|---|---|
| [0001](0001-registro-de-decisiones.md) | Las decisiones viven en `docs/adr/` del repo (formato, proceso, gate) | aceptada |
| [0002](0002-estrategia-dos-tiempos.md) | Estrategia dos tiempos: OS interno primero, marketplace después | aceptada |
| [0003](0003-monolito-sin-sobreingenieria.md) | Monolito Next.js+Supabase; sin microservicios; descartados del plan competidor | aceptada |
| [0004](0004-tenancy-rls-por-agencia.md) | Tenancy: agencias = `suppliers` type='agency'; RLS por `my_supplier_id()` en todo | aceptada |
| [0005](0005-dinero-derivado.md) | El dinero SIEMPRE se deriva; nunca columna mutable | aceptada |
| [0006](0006-ledger-append-only-rpc-only.md) | Ledger append-only con enforcement en BD; tablas de dinero RPC-only-write | aceptada |
| [0007](0007-folios-atomicos.md) | Folios atómicos por contador (agencia, serie); nunca `count(*)+1` | aceptada |
| [0008](0008-cupos-transaccionales.md) | Cupos e inventario transaccionales en la BD, por salida | aceptada |
| [0009](0009-mxn-autoritativo.md) | MXN autoritativo; USD solo se anota y deriva | aceptada |
| [0010](0010-cancelacion-politica-congelada-credito.md) | Cancelación: política congelada con evidencia; crédito antes que devolución | aceptada |
| [0011](0011-ledger-espeja-no-recrea.md) | Ledger balance-0 espeja hechos; registro ≠ custodia; settle jamás a viajero | aceptada |
| [0012](0012-identidad-unica-profiles-type.md) | Identidad única: `profiles.type` sobre un solo `auth.users` | aceptada |
| [0013](0013-mcp-usuario-real.md) | MCP como usuario real: la RLS decide, nunca service key | aceptada |
| [0014](0014-migraciones-bd-fuente.md) | Migraciones: BD fuente de verdad + espejos `db/proposed/` + snapshot pg_dump | aceptada |
| [0015](0015-proyecto-supabase-dedicado.md) | Proyecto Supabase dedicado (org ECS) + bucket `ketzal-assets` | aceptada |
| [0016](0016-pagos-solo-mp.md) | Pagos: solo Mercado Pago; SPEI/efectivo manual con comprobante | aceptada |
| [0017](0017-whatsapp-baileys-box.md) | WhatsApp: Baileys en box + buzón `wa_session`; gate OFF por default | aceptada |
| [0018](0018-investigacion-de-mercado.md) | Investigación de mercado: encuesta pública anónima (2 RPCs DEFINER), dedupe sin captcha, lead opcional | aceptada |
| [0020](0020-security-review-diferida.md) | La revisión de seguridad automática se difiere hasta producción; el workflow se elimina, no se deja fallando | aceptada |
