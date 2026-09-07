# ADR-0058 — El calendario de huecos es una regla, no un modelo: temporadas fijas menos salidas, y la IA solo redacta

- **Estado:** aceptada · **implementación pendiente** (la decisión gobierna la
  función cuando se construya)
- **Fecha:** 2026-09-07
- **Migración:** ninguna todavía. Cuando se construya: `services.duration_days`
  (int, opcional) · `services.meses_ideales` (int[], opcional) · tabla
  `ketzal.oportunidades_fecha` (RLS por agencia) · una columna de alcances
  vistos por agencia
- **Sustituye a:** ninguno
- **Toca (cuando se implemente):** `src/lib/domain/temporadas-mx.ts` (nuevo,
  puro) · `src/lib/domain/oportunidades.ts` (nuevo, puro) · pestaña en
  `/salidas` · el tick del Clawbot (`/api/clawbot/tick`) · la campana
  (`src/lib/notificaciones.ts`, evento nuevo) · `src/lib/agente/llm.ts` para el
  texto al clic
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
5. **La UI es una lista, no un grid mensual.** Pestaña "Huecos" en `/salidas`:
   "Puente 16 sep · en 9 días · sin salida · podrías sacar: Creel, Samalayuca",
   con **Crear salida** que precarga `departs_on`, y **Descartar**. La ven
   **admins y agentes** de la agencia. Lista plana y botones grandes: Meny
   opera Border con movilidad reducida.
6. **El aviso lo emite el Clawbot** una vez por semana, a la campana, con
   `evento = 'hueco_temporada'`, para huecos dentro de la ventana de
   anticipación. Descartar apaga esa temporada para esa agencia ese año.
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

**Pendiente: la función no está construida.** Cuando se implemente, este ADR
exige que su verificación nombre (ADR-0034):

- `src/lib/domain/temporadas-mx.test.ts`: Pascua correcta para años conocidos
  (2026-04-05, 2027-03-28, 2028-04-16), el 5 de febrero, el 21 de marzo y el 20 de noviembre
  se recorren al lunes que dice la LFT (primer, tercer y tercer lunes) y el 16
  de septiembre no se mueve, y una fila `frontera` no aparece para una agencia
  que solo ve `nacional`.
- `src/lib/domain/oportunidades.test.ts`: una salida de 3 días el viernes
  **cubre** el puente del lunes; la misma salida con `duration_days = 1` **no**;
  un servicio con `meses_ideales` sin septiembre **no** se sugiere para el 16;
  una temporada descartada no vuelve a salir ese año.
- Hard-test `oportunidades.sql`: una fila de `oportunidades_fecha` de la
  agencia A **no** es visible para la agencia B; descartar deja
  `descartada_at`; tomar deja `departure_id`. Con fixtures efímeras y
  `raise exception` al final (ADR-0035).
- El evento `hueco_temporada` tiene ícono propio en la campana (el test de
  `notificaciones.test.ts` que ya cubre `eventoDe`).

Mientras no exista, la medición es manual: cuántos puentes de los próximos
120 días tienen salida en cada agencia, contados a mano en `/salidas`.
