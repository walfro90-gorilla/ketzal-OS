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
| [0019](0019-comision-plataforma-obligatoria-para-publicar.md) | Comisión de plataforma: default general 20% + gate que prohíbe publicar sin comisión | aceptada |
| [0020](0020-security-review-diferida.md) | La revisión de seguridad automática se difiere hasta producción; el workflow se elimina, no se deja fallando | aceptada |
| [0021](0021-embajadores-los-paga-quien-recluta.md) | Embajadores sin límite de catálogo; paga la agencia dueña del viaje con la tarifa que ella fijó | aceptada |
| [0022](0022-referir-lo-decide-el-codigo-no-el-tipo.md) | Quién cobra por referir lo decide el `referral_code`, no `profiles.type`; auto-referido bloqueado | aceptada |
| [0023](0023-fixtures-efimeras-en-los-hard-tests.md) | Los hard-tests crean sus cuentas y las borran; se acaban las cuentas QA permanentes y `KETZAL_QA_PASS` | aceptada |
| [0024](0024-rotacion-de-credenciales-de-terceros.md) | Rotar credenciales de terceros se hace desde la app (Reconectar); revocar en MP es el paso que sí mata las viejas | aceptada |
| [0025](0025-medicion-server-first.md) | Medición server-first: Purchase desde donde se confirma el dinero; pixel solo PageView; funnel propio | aceptada |
| [0026](0026-seo-aeo-tecnico.md) | SEO/AEO técnico: crawlers de IA permitidos, JSON-LD TouristTrip, code-first sin Cloudflare/GTM | aceptada |
| [0027](0027-acceso-por-contrasena-provisional.md) | El acceso de quien no se registra solo se entrega con contraseña provisional; el magic-link nunca funcionó (fragmento + un solo uso) | aceptada |
| [0028](0028-la-invitacion-materializa-la-cuenta.md) | La invitación de agente crea el perfil (b078) y «Enviar acceso» la cumple; el RPC deja de depender del camino de login | aceptada |
| [0029](0029-el-embajador-devenga-cuando-la-venta-es-real.md) | El embajador devenga en `tg_commission_snapshot` como los otros tres, no en la atribución; auto-referido cubre al comprador del portal (b079) | aceptada |
| [0030](0030-un-solo-riel-de-pago-a-personas.md) | A una persona se le paga registrando el gasto y el ledger lo espeja; `settle_ledger` deja de aceptar embajador/agente (b081) | aceptada |
| [0031](0031-atribucion-del-embajador-last-touch-en-cookie.md) | El `?ref` se captura en cookie desde el proxy en el primer aterrizaje; last-touch, 30 días, se consume al crear el pedido (b082) | aceptada |
| [0032](0032-corte-quincenal-derivado.md) | El corte de comisiones es derivado (devengado − pagado a una fecha), acumulativo, y solo paga ventas con dinero cobrado (b086) | aceptada |
| [0033](0033-el-cliente-se-convierte-sin-perder-nada.md) | Un correo que ya tiene cuenta de viajero se CONVIERTE en embajador (sin contraseña nueva) y conserva sus compras; cada portal enseña la salida al otro (b087) | aceptada |
| [0034](0034-la-verificacion-nombra-su-prueba.md) | Un ADR que afirma un invariante nombra el archivo y la aserción que lo prueban; `pnpm hard-test` corre los 21 harness y `NO CORRIÓ` es rojo | aceptada |
| [0035](0035-un-hard-test-nunca-commitea.md) | Un hard-test `.sql` termina en `rollback`; el corredor se niega a correr uno con `commit`. Nunca borra por predicado ni toca filas reales (incidente de pérdida de datos 2026-09-01) | aceptada |
| [0036](0036-el-bucket-publico-no-guarda-documentos.md) | Los documentos con datos de una persona salen del bucket público a `ketzal-privado` (lectura firmada); ninguna policy de storage scopea solo por `bucket_id`; el guard del folio vive dentro del RPC (b088) | aceptada |
| [0037](0037-el-admin-de-agencia-ve-a-sus-embajadores.md) | `list_ambassadors` acota por tenencia (los suyos + los que le vendieron) en vez de negar con `[]` a todo el que no sea superadmin (b089) | aceptada |
| [0038](0038-la-policy-de-storage-reusa-el-criterio-de-la-fila.md) | Una policy de Storage llama al guard que gobierna la fila en vez de inventar su criterio; `suppliers/` = `suppliers_update`, `brand/` = superadmin (b090) | aceptada |
