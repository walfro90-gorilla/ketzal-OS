# ADR-0050 — El viaje a la medida es un lead con cotización, no una subasta entre agencias

- **Estado:** aceptada · **implementación pendiente** (la decisión gobierna la
  función cuando se construya)
- **Fecha:** 2026-09-05
- **Migración:** ninguna todavía
- **Sustituye a:** ninguno
- **Toca (cuando se implemente):** formulario público de solicitud · una tabla
  de solicitudes con RLS por agencia · el flujo de cotización que ya existe
  (`/cotizacion/[token]`) como respuesta
- **Relacionadas:** [ADR-0002](0002-estrategia-dos-tiempos.md) (los marketplaces
  mueren por arranque en frío), [ADR-0039](0039-la-cotizacion-se-guarda-con-su-token.md)
  (la cotización pública ya es la "propuesta" y crea la cuenta del viajero),
  [ADR-0016](0016-pagos-solo-mp.md)

## Contexto

En un grupo de Facebook de agencias de Ciudad Juárez, una persona publicó que
buscaba quién le organizara un viaje a Cancún para septiembre de 2027, con
vuelos, tours y todo incluido. En dos horas juntó catorce comentarios, y la
respuesta de cada agencia fue del tipo "con gusto te puedo ayudar", con su
nombre y sin precio, sin itinerario y sin nada comparable.

La demanda de *viaje a la medida* existe, es visible y está mal atendida. La
propuesta inicial del fundador fue construir un módulo donde el viajero
describe su viaje y las agencias registradas **compiten con propuestas**, y él
elige la mejor.

## Decisión

**Se construye un formulario de solicitud que produce un LEAD, atendido con la
cotización que ya existe. No se construye una subasta.**

1. El viajero describe destino, fechas, número de personas y presupuesto.
2. La solicitud llega a las agencias del propio fundador, que responden con una
   cotización real del OS. Esa cotización ya es un documento público con
   itinerario, precio y el botón para guardarla en la cuenta del viajero
   (ADR-0039), o sea que **la "propuesta" ya está construida**.
3. Se anuncia como **servicio** ("te armamos tu viaje a la medida, cotización en
   24 horas"), nunca como mercado ni como subasta.
4. Abrirlo a agencias de fuera es una decisión **posterior**, y solo con
   evidencia: que el formulario se llene de solicitudes reales.

## Por qué no la subasta

- **Arranque en frío por los dos lados.** Es exactamente lo que ADR-0002 decidió
  evitar. Hoy hay dos agencias registradas y las dos son del fundador; una
  subasta con dos postores es un formulario de contacto con pasos de más.
- **Desintermediación, y aquí nace muerta.** La agencia manda su propuesta con
  su nombre, el cliente le escribe por WhatsApp y cierran fuera. La plataforma
  hace el trabajo de emparejar y no cobra. En el grupo de Facebook ese
  comportamiento **ya es el default**.
- **Juez y jugador.** El día que se quiera vender el SaaS a agencias ajenas
  (Border incluida), ninguna entra a un mercado donde el dueño de la plataforma
  compite con ellas y además pone las reglas. La subasta cierra la puerta de la
  apuesta principal.
- **La transacción es grande y lejana.** El ejemplo real es un viaje con vuelos
  a un año de distancia, que la persona comparará durante meses. Es el peor
  terreno para estrenar un producto nuevo.

## Consecuencias

- La ventaja competitiva no es tecnológica sino de presentación: contra un "con
  gusto te ayudo" en un comentario, se responde con un documento con precio que
  además crea la cuenta del cliente. Se gana por ahí.
- Mientras tanto, la misma hipótesis se mide **sin código**: contestar esas
  publicaciones con una cotización real del sistema y ver cuánto convierte.
- Si el formulario se llena, la decisión de abrirlo a terceros se retoma con
  datos, y entonces habrá que resolver antes el conflicto de juez y jugador
  (por ejemplo, que las agencias del fundador no participen en solicitudes
  abiertas). Eso será su propio ADR.
- **No se anuncia con publicidad pagada** un producto de dos lados sin oferta:
  una solicitud sin propuestas se ve muerta en la primera visita.

## Alternativas descartadas

- **Subasta entre agencias registradas.** Por las cuatro razones de arriba.
- **Publicar las solicitudes en abierto** para que cualquier agencia responda.
  Mismo problema de desintermediación, y además expone datos del viajero a
  terceros no verificados.
- **No hacer nada y seguir contestando en los grupos.** Es lo correcto *hoy*
  como medición, pero no escala ni deja rastro en el sistema: el lead se pierde
  en un comentario.

## Verificación

**Pendiente: la función no está construida.** Cuando se implemente, este ADR
exige que su verificación nombre (ADR-0034):

- Un hard-test que afirme que una solicitud **no** es visible para una agencia
  que no fue destinataria (RLS por agencia), con fixtures efímeras.
- Un caso que afirme que responder una solicitud produce una cotización con su
  token, y que el viajero puede reclamarla a su cuenta (reusa `claim_quote`).
- Un caso que afirme que el formulario público es alcanzable **sin sesión** y
  declarado en `src/proxy.ts` — la familia de bug que ya mordió dos veces con
  `/privacidad` y `/indexnow-key.txt`.

Mientras no exista, la medición es manual y queda anotada en
`docs/PLAN_COMERCIAL.md`: cuántas solicitudes contestadas en grupos de Facebook
terminaron en cotización enviada y en venta.
