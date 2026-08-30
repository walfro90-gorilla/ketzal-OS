# ADR-0019 — Comisión de plataforma: default general + gate de publicación

- Estado: aceptada · Fecha: 2026-08-29 · Sustituye: —
- Alcance: `commission_rules`, `services.published`, `resolve_commission_rule`, publicación de catálogo (web + MCP)
- Implementado en: b076 (siembra + trigger) y **b077** (el gate real; b076 quedó inerte)

## Contexto
Prueba en vivo del circuito de comisión (b072–b075) descubrió que
`commission_rules` estaba **VACÍA** en producción: los hard-tests sembraban la
regla dentro del rollback, así que nunca quedó una en la BD real. El motor
resolvía null ⇒ `commission_amount` 0 ⇒ una venta del portal devengaba **$0**
sin fallar — cobraba de menos en silencio. Regla de negocio del fundador:
Ketzal comisiona SOLO ventas del portal; la manual (SaaS) no (ADR-0006/b072).

## Decisión
- **Existe una regla GENERAL de plataforma** (`payee_type='plataforma'`,
  `service_id=null`), sembrada en **20% percent** (banda sana de marketplaces
  de tours/actividades: Airbnb Experiences ~20, GetYourGuide/Klook 20–25; 30%
  es techo agresivo, se deja como override por servicio, no como default).
- **Ningún servicio se publica sin comisión de plataforma EFECTIVA.** Un
  trigger `before insert or update of published on services` bloquea
  `published=true` cuando la comisión resuelta vale cero — no cuando "no
  resuelve". La primera versión (b076) preguntaba `if r.basis is null`, y eso
  **nunca se cumple** para `payee_type='plataforma'`: `resolve_commission_rule`
  cae a un último recurso que siempre devuelve
  `('percent', coalesce(app_settings.platform_commission_rate, 0), null)`.
  El gate quedó inerte y el agujero que motivó el carril siguió abierto justo
  en su caso peor (0% ⇒ servicio en vitrina devengando $0). Corregido en
  **b077**: se mide el valor (`rate > 0` o `unit_amount > 0`), lo que además
  cubre cualquier basis — percent, fijo_venta, fijo_pax e híbrido.
- El gate vive **en BD**, no por-llamador: cubre el UPDATE de la web
  (`servicios/actions.ts`), del MCP (`tools/catalogo.ts`) y cualquier
  escritura por PostgREST. Editar un servicio ya publicado NO re-valida (sólo
  la transición a publicado).
- El override por servicio o por agencia se administra en /comisiones
  (`set_commission_rule`, solo superadmin) — ADR-0006, motor b019/b054.

## Consecuencias
- Imposible tener un servicio en la vitrina que no le devengue a Ketzal.
- El default general aplica a servicios nuevos y a los ya publicados sin
  override; subirlo/bajarlo es cambiar la regla general (una fila), no tocar
  código.
- El gate es un invariante, no una decisión de precio: el precio (el %) se
  decide aparte y se puede mover sin re-desplegar.

## Verificación
Hard-test en vivo contra la BD real (2026-08-30), **7/7 OK**, con los dos
caminos en la misma corrida y restauración verificada al final:
publicar con regla general 20% ✔ · sin regla pero con el último recurso en 10%
✔ (hay comisión, debe dejar) · **publicar con todo en 0% ⇒ bloqueado** (el caso
que b076 dejaba pasar) · INSERT con `published=true` y 0% ⇒ bloqueado ·
publicar con `fijo_pax $150` ⇒ permitido (basis sin `rate`) · editar un
servicio ya publicado ⇒ no re-valida. Prueba previa del circuito
(2026-08-29): viaje $1,800 → devengo $180 (10% override) / $360 (20% general),
venta manual $0.

**Trampa medida, no corregida aquí**: hay DOS fuentes del % de plataforma —
`commission_rules` (regla general, gana) y `app_settings.platform_commission_rate`
(último recurso). Hoy valen **20 y 10**. Mientras la regla general esté activa
se cobra 20; si alguien la desactiva, baja a 10 en silencio. Unificarlas es
decisión de negocio y va en su propio ADR.

## Fuentes
b076 + b077, b072–b075 (circuito de comisión), b019/b054 (motor), ADR-0006 (ledger/
comisión append-only), memoria `ketzal-comision-portal`, prueba en vivo MCP.
