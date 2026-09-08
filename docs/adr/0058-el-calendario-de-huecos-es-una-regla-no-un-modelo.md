# ADR-0058 — El calendario de huecos es una regla, no un modelo: temporadas fijas menos salidas, y la IA solo redacta

- **Estado:** aceptada · **construida el 2026-09-07** (decidida y construida el
  mismo día; el ADR se escribió antes del código)
- **Fecha:** 2026-09-07
- **Migración:** `b099_calendario_huecos` — `services.duration_days` (int 1-365,
  opcional) · `services.meses_ideales` (int[] ⊂ 1..12, opcional) ·
  `suppliers.alcances_temporada` (text[] ⊂ {nacional, frontera}, al menos uno,
  default nacional) · tabla `ketzal.oportunidades_fecha` (RLS por agencia,
  sin delete)
- **Sustituye a:** ninguno
- **Toca:** `src/lib/domain/temporadas-mx.ts` y `oportunidades.ts` (nuevos,
  puros) · `/salidas` (sección `#huecos`, `huecos-list.tsx`,
  `huecos-actions.ts`) · formulario de servicios (duración y meses) ·
  `/servicios/[id]?salida=&hueco=` precarga la salida · `/ajustes` (alcances) ·
  `src/lib/clawbot/huecos.ts` desde el tick · la campana (evento
  `hueco_temporada`) · `src/lib/agente/llm.ts` para el texto al clic
- **Relacionadas:** [ADR-0057](0057-la-ubicacion-se-captura-para-poder-agrupar.md)
  (sin destino estructurado no hay "destino" que sugerir),
  [ADR-0008](0008-cupos-transaccionales.md) (las salidas son la fuente de lo
  cubierto), [ADR-0044](0044-el-asistente-del-os-reusa-las-herramientas-del-mcp.md)
  (el LLM ya está cableado y con fallback), [ADR-0002](0002-estrategia-dos-tiempos.md)

## Contexto

El fundador propuso un "calendario inteligente, receptor del cerebro central IA"
por organizador: que Ketzal OS viera las fechas cubiertas por sus salidas y, al
encontrar un puente, vacaciones o temporada sin cubrir, sugiriera el día, el
porqué y qué ofrecer. Un experto que ve oportunidades de fecha + destino.

Medido contra lo que hay:

- Las fechas cubiertas ya existen: `service_departures.departs_on`. Pero es
  **solo la fecha de salida**; no hay fin ni duración. Un tour de tres días que
  sale el viernes cubre el puente; uno de un día con el mismo `departs_on`, no.
- El destino ya se puede agrupar desde ayer (ADR-0057). Antes de eso, "destino"
  era texto libre con países dentro del campo de estado.
- El Clawbot ya corre diario por Vercel Cron y ya emite "reglas operativas".
- La campana ya distingue eventos por `metadata.evento`.
- El LLM (Groq → Gemini → DeepSeek) ya está cableado para el asistente.
- `services.seasonal_prices` existe en la BD y **nadie la lee** en `src/`:
  alguien ya pensó en temporadas y lo abandonó.
- La BD se limpió el 2026-08-19. **No hay historial** de "el año pasado
  vendiste tanto en este puente" y no lo habrá hasta 2027.

Y el hecho que ordena todo: **el calendario de fechas altas de México es
determinista.** Festivos de ley, los lunes de puente de la LFT, Semana Santa
(se calcula desde Pascua), vacaciones SEP, Día de Muertos, Navidad, quincenas.
Son unas 25 filas por año. No hay nada que aprender.

## Decisión

**El "cerebro" es una consulta: `temporadas próximas − salidas que las cubren
= huecos`. Eso ya es funcional sin IA. La IA solo redacta, y solo al clic.**

1. **Catálogo de temporadas: función pura en git**, `temporadas(año)`, con
   fechas fijas y las derivadas de Pascua. Nunca una tabla en la BD: cambia una
   vez al año y se revisa en un diff. Cada fila trae `alcance`:
   - `nacional`: festivos de ley y sus puentes, Semana Santa, vacaciones SEP,
     Día de Muertos, Navidad y Año Nuevo, 14 de febrero, 10 de mayo.
   - `frontera`: **Thanksgiving, Labor Day, Memorial Day, 4 de julio, Spring
     Break de El Paso.** Border vende a fronterizos; esas fechas mueven más
     gente que el 5 de febrero.
   - Cada agencia elige qué alcances ve. Las fechas **locales** (Santa Rita,
     Expogan, Fiestas de Octubre) **no entran al catálogo**: nadie del
     proyecto las puede mantener honestamente. "Agregar mi fecha" es v2.
2. **Cobertura por función pura**, `oportunidades(temporadas, salidas,
   servicios, hoy, horizonte)`. Una temporada está cubierta si alguna salida
   de la agencia la toca contando `departs_on + duration_days`. Por eso
   **`services.duration_days` se agrega** (int, opcional; sin él se asume 1).
   La misma columna sirve a vouchers y manifiesto.
3. **`services.meses_ideales int[]`** (12 casillas, opcional) filtra qué
   servicios se sugieren para un hueco. Sugerir Huasteca en septiembre
   (crecidas) o Barrancas en junio (calor) quema la confianza en la primera
   semana. Es un filtro **determinista**: no depende de que el modelo lo sepa.
   Un servicio sin meses marcados se sugiere siempre.
4. **Horizonte y anticipación fijos, como constantes nombradas:** 120 días de
   horizonte, aviso a partir de 4 semanas antes. Se dejan como parámetros de
   la función pura (`horizonteDias`, `anticipacionDias`) para que pasar a
   anticipación por tipo de temporada sea cambiar la llamada, no la función.
5. **La UI es una lista, no un grid mensual.** Sección "Huecos en el
   calendario" en `/salidas#huecos` (una sección con ancla, no una pestaña: la
   campana enlaza al ancla y una pestaña escondería las salidas detrás de un
   clic): "Fiestas Patrias · 16 sep · en 9 días · Sin salida · Sacar Creel,
   Sacar Samalayuca", con **Sacar X** que abre el servicio con `departs_on`
   precargado, **Descartar** y **¿Qué ofrezco?**. La ven **admins y agentes**
   de la agencia; el **superadmin sin agencia ve las de todas**, agrupadas por
   agencia, igual que la lista de salidas (las acciones reciben la agencia
   explícita y la RLS decide, no la acción). Lista plana y botones grandes:
   Meny opera Border con movilidad reducida.
6. **El aviso lo emite el Clawbot** en su tick diario, **una sola vez por
   hueco**: al entrar a la ventana de anticipación se inserta la fila en
   `oportunidades_fecha` y se notifica a admins y agentes con
   `evento = 'hueco_temporada'`; la unicidad `(agencia, clave, año)` frena
   cualquier repetición. Descartar apaga esa temporada para esa agencia ese
   año (y se puede reactivar).
7. **La IA entra solo al clic** ("¿Qué ofrezco?"): catálogo de la agencia +
   temporada + ventas previas a `llm.ts`; el texto se guarda por
   `(agencia, temporada, año)` para no pagar dos veces. Sin clic, sin costo.
8. **Nunca crea salidas sola.** Sugiere; la persona decide.
9. **El historial se guarda desde el día uno.** Cada sugerencia emitida, y qué
   pasó con ella (descartada, o tomada con el `departure_id` que se creó
   desde ella), vive en `ketzal.oportunidades_fecha`. Las ventas por temporada
   **no** se guardan: se derivan cruzando `bookings` con `departs_on`, igual
   que todo el dinero (ADR-0005). El objetivo es que en 2027 se pueda medir
   qué sugerencias produjeron salidas y qué salidas produjeron ventas.

## Por qué así

- **La regla de decisión del plan comercial** es: ante dos tareas, gana la que
  mete más transacciones reales al ledger. Un puente sin salida es una
  transacción que no ocurrió. Esta función existe para eso, no para lucir IA.
- **Determinista antes que modelo.** Un LLM alucina puentes y no sabe si la
  Huasteca está crecida. El catálogo y los meses ideales lo saben siempre.
- **Sin historial, la v1 debe sostenerse sola.** Con solo el catálogo y las
  salidas ya produce huecos correctos. El historial la enriquece; no la
  bloquea.
- **Reusar antes que construir.** Cron, campana, LLM, RLS, formulario de
  salidas: todo existe. Lo nuevo son dos funciones puras, dos columnas, una
  tabla y una pestaña.

## Alternativas descartadas

- **Un "cerebro central" que aprende fechas altas.** El calendario es
  determinista; un modelo aporta ruido donde hay una tabla de 25 filas.
- **Google Trends o APIs externas de demanda.** Dependencia nueva, señal
  ruidosa para Chihuahua, y otra cosa que se cae.
- **Grid mensual tipo Google Calendar.** Bonito y pesado; la decisión es una
  lista de huecos, y arrastrar no es accesible para quien dicta.
- **Tabla `temporadas` en la BD.** Cambia una vez al año; en git se revisa en
  un diff y se prueba en un unit test.
- **Revivir `services.seasonal_prices`.** Es precio, no cobertura; mezclarlos
  vuelve a acoplar. Se borra o se ignora en su propio cambio.
- **Sugerencias automáticas que crean salidas.** Una salida es cupo real y
  precio real; la crea una persona.

## Verificación

- `src/lib/domain/temporadas-mx.test.ts` (11 casos): Pascua 2026-04-05,
  2027-03-28 y 2028-04-16; el 5 de febrero, el 21 de marzo y el 20 de noviembre
  caen en el lunes que dice la LFT (2026: 02-02, 03-16, 11-16) y el 16 de
  septiembre no se mueve; Thanksgiving 2026-11-26..29; las cinco filas
  `frontera` llevan su alcance y las doce `nacional` el suyo; cada fila es
  válida, única y viene ordenada.
- `src/lib/domain/oportunidades.test.ts` (14 casos): una salida de 3 días el
  viernes 13 **cubre** el puente del 14-16 de noviembre y la misma con
  `duration_days = 1` **no**; sin duración se asume 1; Huasteca sin septiembre
  en sus meses **no** se sugiere para el 16; una descartada no vuelve como
  hueco y cubierta gana a descartada; la agencia que solo ve `nacional` no
  recibe Labor Day; el horizonte es parámetro; el invierno del año anterior
  sigue vivo en enero; `paraAvisar` solo a 28 días; `temporadaPorId` rechaza
  basura.
- `supabase/tests/oportunidades.sql` (16 aserciones, `pnpm hard-test
  oportunidades`): los CHECK de b099 (duración 0, mes 13, alcance inventado,
  agencia sin alcance, inicio > fin) rechazan; el default es `nacional`; el
  **agente** (role `user`) de A escribe y lee el historial de A y **no lo
  borra** (sin policy de delete la fila se queda); el admin de B no lo ve, no
  escribe a nombre de A ni lo actualiza; `(agencia, clave, año)` es único;
  la salida ligada por `departure_id` se suelta con `set null` al borrarla sin
  perder la fila; borrar la agencia se lleva su historial. Fixtures efímeras y
  `raise exception` al final (ADR-0035).
- `src/lib/notificaciones.test.ts` recorre `EVENTOS`, que ahora incluye
  `hueco_temporada`; el ícono vive en `ICONOS` de la campana, tipado sobre el
  mismo arreglo, así que un evento sin ícono no compila.
- **Probado en vivo el 2026-09-07:** el tick real (`/api/clawbot/tick` en la
  app construida, contra la BD real) emitió `independencia:2026` a las dos
  agencias reales (`emitidas: 2, avisos: 3` en `system_log`), las
  notificaciones quedaron con `evento = 'hueco_temporada'` y
  `action_url = /salidas#huecos`, y el segundo tick dio `emitidas: 0` con el
  conteo intacto (idempotente). La consulta con embed que usa `/salidas`
  (`services!inner(supplier_id)`) se validó contra PostgREST real. El primer
  tick había emitido 0: `lista.filter(paraAvisar)` pasaba el índice como
  anticipación; por eso el segundo parámetro es un objeto y hay un test que
  usa `.filter(paraAvisar)` tal cual. **No probado con sesión en pantalla:** la
  sección y las acciones (`Descartar`, `¿Qué ofrezco?`) se verifican al abrir
  `/salidas` con una cuenta real.
