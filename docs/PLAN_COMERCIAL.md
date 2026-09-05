# Plan comercial — arranque (septiembre 2026)

> Acordado con el fundador la madrugada del 2026-09-05, sobre datos medidos esa
> noche (catálogo, páginas de Facebook, tarifas de comisión vivas). Documento
> **vivo**: se actualiza conforme se ejecuta. Las decisiones estructurales que
> salen de aquí viven en `docs/adr/`; la crónica de lo hecho, en
> `docs/BITACORA.md`.

## De dónde partimos (medido, no supuesto)

**Catálogo publicado**: 5 viajes, 4 rutas, todas desde Ciudad Juárez.

| Viaje | Agencia | Precio | Próxima salida | Lugares libres |
|---|---|---|---|---|
| Basaseachi-Creel | Wanderlust | $1,800 | 11 sep | 82 |
| Creel y Barrancas | Border | $2,399 | 11 sep | 100 |
| Huasteca en avión | Border | $7,999 | 10 sep | 80 |
| Colombia | Border | $24,999 | 7 sep | 140 |
| Mazatlán Año Nuevo | Border | $9,999 | 29 dic | 45 |

**447 lugares vacíos.** Cero ventas en línea a la fecha.

**Páginas de Facebook**:

| Página | Seguidores | Última publicación | Reseñas |
|---|---|---|---|
| Bordertravels | 29,000 | activa, diaria | 317, 96% recomiendan |
| Wanderlust Jrz | 9,800 | julio 2022 | — |
| Ketzal app | 3,100 | mayo 2025 | — |

**Tarifas de comisión activas**: plataforma 10% (global), embajador $250 por
pasajero (Border y Wanderlust), agente $300 por pasajero (dos agentes).

**Mercado Pago**: solo **Wanderlust** está conectada. Border se desconectó el
2026-09-03 porque apuntaba a la cuenta del fundador (ADR-0042).

## Las tres decisiones de la noche

**1. Wanderlust es el laboratorio, no la segunda prioridad.** Es 100% del
fundador, es la única que puede cobrar en línea hoy, y no requiere convencer a
nadie. Todo lo que se quiere probar —tour local de adquisición, cotización que
crea cuenta, comisiones por servicio, embajadores— se prueba ahí.

**2. Border es una venta, no un canal.** Lo opera Meny y sus decisiones de
publicación no son del fundador. No se le insiste sin datos: se le lleva el
reporte de lo que vendió Wanderlust en línea. Plazo propuesto: 60 días.

**3. Ketzal como marca va tercero y con esfuerzo mínimo.** Su audiencia no son
los viajeros (esos ya los atienden las agencias) sino **quienes quieren vender**:
futuros embajadores y, más adelante, agencias. Se calienta ahora para poder
anunciar desde ella después; no se abre el reclutamiento hasta que haya tours.

## El producto de entrada: fin de semana de campamento + dunas

Sábado en una quinta, domingo por la mañana dunas de Samalayuca con
sandboarding. Racional: sin hotel ni vuelos, riesgo contenido a un día, se
repite cada semana, y produce material visual para publicidad.

Su trabajo **no es maximizar margen sino producir clientes con cuenta**, que
después suben la escalera que ya existe en el catálogo: entrada → Creel $2,399 →
Huasteca $7,999 → Colombia $24,999.

Reglas que se fijan antes de vender el primero:

- **Precio claramente por debajo de $1,800**, o compite con Basaseachi en vez de
  alimentarlo.
- **Mínimo de personas para que salga**, y qué pasa si no se llena, publicado de
  antemano. Cancelar por poca gente es lo que más rápido mata la confianza.
- **Regla de comisión propia para ese servicio**, porcentual. Con las tarifas
  fijas de hoy ($250 embajador + $300 agente) un tour barato hace que el motor
  rechace el devengo en silencio por exceder la venta.
- **Todos los lugares se venden en línea**, o por cotización enviada. Una venta
  de mostrador sin cotización es un cliente que no queda en la app.

## El mercado y el techo (investigado 2026-09-05)

**México tiene 10 unicornios** al primer trimestre de 2026: Bitso, Kavak, Clip,
Konfío, Incode, Clara, Merama, Nowports, Stori y Plata. **Siete de los diez son
fintech o tienen una capa financiera adentro** (Kavak vende autos, pero lo que la
hizo valer 8,700 millones de dólares fue financiarlos).

**El turismo a México crece de verdad.** Primer trimestre de 2026: 26.22 millones
de visitantes internacionales, +10.2% contra 2025, con derrama de 10,287 millones
de dólares. Enero de 2026 fue el mes con más llegadas desde que hay registro.

**Pero el software de turismo no es donde se hacen unicornios.** En toda
Latinoamérica hay 916 empresas de viajes en línea; entre todas, en toda su
historia, han levantado 1,660 millones de dólares y han producido **un solo
unicornio**. No es mala suerte, es aritmética: una agencia chica paga cientos de
pesos al mes, y en México no hay decenas de miles de agencias. **El techo del
SaaS puro está puesto por el tamaño del mercado, no por la ejecución.**

**La versión con techo alto es otra, y ya está a medio construir.** Ketzal tiene
plan de pagos, apartado, abonos, ledger inmutable y separación de dinero al
cobrar: eso no es software de gestión, es infraestructura financiera de la venta
de viajes. El mercado de compras a plazos en México valía 4,560 millones de
dólares en 2024 creciendo 54.5% anual, con proyección de superar los 18,000
millones al inicio de la próxima década, y los viajes son uno de sus casos de uso
originales. La tesis de escala no es "vender software a agencias" sino **ser por
dónde pasa el dinero de los viajes**, distribuido a través de agencias.

**Nada de eso se decide sin datos.** Con cero ventas en línea no hay tesis que
sostener. Por eso la secuencia de la brújula es: una venta real → diez ventas con
la medición de cuántos pagan a plazos y cuántos se caen por no poder pagar de
golpe → una agencia ajena pagando.

**Sobre pivotar a transporte o bienes raíces: no.** El código es lo barato de lo
que hay; el conocimiento del negocio es lo caro. Cambiar de industria tira lo
valioso y conserva lo reemplazable.

## Competencia (investigada 2026-09-05)

Tres frentes con niveles de peligro muy distintos. El comparativo funcional
contra un back-office tradicional vive en [PLAN_COMPETIDOR.md](PLAN_COMPETIDOR.md).

### Software para agencias

**Sistemas MIG / ICAAVweb** (40 años, CFDI, conectividad GDS con Amadeus, Sabre y
Galileo), **OfiViaje** (2,300 agencias entre España, México, Portugal y Chile),
**Amadeus Selling Platform Connect**, y locales como Corsario o SoftFabrics.

Ketzal les gana en pago en línea, enlaces públicos compartibles y aplicación
instalable. Les pierde en dos cosas que están fuera de alcance por decisión:

- **CFDI.** Una agencia mexicana tiene que facturar. Sin factura necesita un
  segundo sistema, y el prescindible es el nuestro. **Es el mayor hueco
  competitivo del SaaS** y hay que decidirlo conscientemente, no por omisión.
- **Conexión a GDS.** Sin Amadeus o Sabre no se sirve a quien vende vuelos. Eso
  define el nicho real: **el operador con inventario propio** (tours, salidas,
  cupos), no la agencia que revende boletos.

### Marketplace de tours

**Viator, GetYourGuide, Klook y Expedia concentran más del 90%** de las reservas
de tours y actividades; Civitatis lidera en español con ~97,000 actividades en
más de 4,270 destinos. Contra eso no se compite de frente.

La distinción que salva el nicho: **ellos venden turismo receptor, Ketzal vende
emisor.** Civitatis le vende un cenote a quien ya está en Cancún; nadie le vende
a la gente de Ciudad Juárez el fin de semana en Creel. Nicho real y defendible,
también más chico.

### El dinero

**Aplazo** (más de 15,000 comercios, ya en aerolíneas y autobuses) y **Kueski
Pay** (categoría de viajes explícita, vuelos en quincenas) ya están adentro;
Aeroméxico ofrece Aplazo, Kueski y Atrato.

Pero hacen algo distinto: **dan crédito y asumen el riesgo.** El apartado con
abonos de Ketzal no presta nada — el cliente paga por adelantado su propio viaje
y el sistema lleva la cuenta y reparte al cobrar. Aplazo no lo hace porque ahí no
hay intereses que ganar. **La jugada es integrarlos, no competirles**: botón de
Aplazo o Kueski en el checkout para quien no puede apartar. Ketzal se queda con
la venta y, más importante, con el dato de quién compra a plazos.

### El competidor que de verdad puede ganar

**WhatsApp y una hoja de Excel.** Para Meny la alternativa no es ICAAVweb ni
Civitatis: es lo que hace hoy, que funciona y no cuesta nada. Contra eso la
ventaja no es tener más funciones sino quitarle trabajo — que no sume abonos a
mano, que el recibo salga solo, que sepa quién le debe sin releer conversaciones.
Es el único frente donde ganar depende solo de nosotros.

## Dónde está el unicornio (2026-09-05)

No está en una función que falte construir. Está en un hecho económico del
negocio que Ketzal ya intermedia: **el viajero paga meses antes de viajar.**

Ese anticipo es, visto de cerca, un préstamo sin garantía de una persona a un
negocio pequeño sin balance. Es la razón por la que mucha gente no le compra a
una agencia local y prefiere pagar más caro con una aerolínea o una OTA grande.
Y del otro lado, la agencia necesita ese dinero para operar y no tiene de dónde
sacar capital de trabajo. Las dos partes tienen el mismo problema y ninguna lo
puede resolver sola.

**Ketzal ya está sentado exactamente en medio de esa transacción**, y con las
piezas que hacen falta para resolverla:

- el **ledger append-only** sabe cuánto se pagó, cuánto se debe y cuándo;
- el **split al cobrar** puede enrutar o retener el dinero;
- los **cupos por salida** saben si el viaje existe de verdad;
- la **política de cancelación y el motor de créditos** saben qué pasa si falla.

De ahí salen tres escalones, y el tercero es el del unicornio:

1. **Comisión sobre el flujo.** Es lo que hay hoy: 10% de las ventas del portal.
   Real, pero pequeño.
2. **Garantía del anticipo.** Ketzal retiene el anticipo y lo libera a la agencia
   contra hitos o contra la salida. Eso es lo que hace que un desconocido se
   atreva a prepagarle a una agencia chica, y es la diferencia entre un
   marketplace y un directorio.
3. **Capital de trabajo.** Cuando el ledger conoce la cobranza real, la tasa de
   cancelación y la ocupación de una agencia, se le puede prestar contra salidas
   futuras. **Es la jugada de Konfío, con un dato que ningún banco tiene.**

Ese es el mismo patrón de los unicornios mexicanos: Kavak no le vendió software a
las lotes de autos, se quedó con la transacción y el financiamiento.

**Las dos advertencias, escritas para no engañarse:**

- El escalón 2 es una decisión **regulatoria**, no de producto. Hoy ADR-0016 dice
  explícitamente *registro ≠ custodia*: Ketzal anota, no guarda dinero ajeno.
  Retener anticipos cambia esa naturaleza y hay que entrar con abogado, no con un
  sprint.
- El escalón 3 necesita capital y figura (SOFOM). Es otra empresa, financiada, no
  una función más del OS.

**Y la consecuencia práctica, que sí aplica desde mañana:** el activo no es el
código, es **el historial de transacciones reales**. Se construye operando, no
programando. Por eso la regla de decisión de aquí en adelante es:

> Ante dos tareas, gana la que mete más transacciones reales al ledger.

Eso también reencuadra por qué importa que Meny capture **todas** sus ventas,
incluidas las de mostrador: no es un tema de adopción de software, es que cada
venta que se queda fuera del sistema es un ladrillo que le falta al único activo
que puede valer mil millones. Un Ketzal usado solo como aparador nunca acumula
el dato, y sin el dato no hay escalón 2 ni 3.

## Checklist

> **Regla de decisión:** ante dos tareas, gana la que mete más transacciones
> reales al ledger.

### Ya hecho (2026-09-03/04)

- [x] Dominio `ketzal.tours` en vivo, todo link a cliente sale del dominio
      público (ADR-0040)
- [x] Píxel de Meta + API de conversiones + GA4 midiendo y validados en vivo
- [x] Aviso de privacidad público (`/privacidad`) enlazado desde pie y checkout
- [x] Buzón `privacidad@ketzal.tours` operativo (reenvío → Zoho, con envío)
- [x] AEO técnico: marca en la portada, fechas en la ficha, `llms.txt` con
      catálogo vivo, IndexNow al publicar (ADR-0048)
- [x] Search Console verificado, sitemap aceptado, enlazado a GA4

### Bloqueantes del fundador (nada de código)

- [ ] Bing Webmaster Tools + `INDEXNOW_KEY` en Vercel
- [ ] Google Business Profile por agencia, con reseñas reales; reclamar la ficha
      vieja cuya cuenta se perdió
- [ ] Identidad legal del responsable en el aviso de privacidad
- [ ] Conectar la cuenta de Mercado Pago **de Border** (hoy sin conectar)
- [ ] Corregir el correo de contacto de la página de Ketzal (dice `ketzaOS`,
      sin la ele)

### Carril Wanderlust (el laboratorio)

- [ ] Definir costo por salida y lugares de la unidad → punto de equilibrio y
      precio
- [ ] Verificar permiso de acceso comercial a los Médanos de Samalayuca (área
      natural protegida) y si la quinta permite fogata
- [ ] Verificar seguro de pasajeros del transporte; deslinde firmado para
      sandboarding; botiquín y hospital de referencia
- [ ] Comprar tablas de sandboard (se amortizan en pocas salidas y son el
      diferenciador)
- [ ] Alta del servicio en el OS con salidas semanales
- [ ] Regla de comisión propia de ese servicio, **antes** de la primera venta
- [ ] Página de Facebook: foto de perfil, romper el silencio de 2022, publicar
      el tour con enlace de compra
- [ ] Borrar los dos servicios de prueba (`TEST — Validación comisión portal`,
      `TEST pago en línea $50`) y los borradores de prueba

### Carril página de Ketzal (calentar, no reclutar)

- [ ] Conectar la página al portafolio comercial "Ketzal OS"
- [ ] Foto de portada y descripción orientada a quien quiere **vender**, no viajar
- [ ] Público personalizado de quienes interactuaron (365 días) + similar
- [ ] Cadencia de una o dos publicaciones por semana, sostenida 4-8 semanas
- [ ] Lista de espera de embajadores (Messenger o el módulo de encuestas). **No**
      abrir el reclutamiento hasta que haya tours que vender

### Carril publicidad (cuando haya qué vender)

- [ ] Una sola campaña, objetivo **ventas**, no notoriedad
- [ ] Geolocalización Ciudad Juárez; público amplio con Advantage+
- [ ] **No** usar Advantage+ Shopping ni Performance Max hasta tener volumen
      (necesitan ~50 conversiones semanales y ~30 mensuales respectivamente;
      hoy son cero)
- [ ] Google: solo campañas de búsqueda, intención alta
- [ ] Encuestas de investigación: **orgánicas**, no pagadas

### Carril tesis (lo que decide si esto escala)

- [ ] Medir en las primeras 10 ventas: **qué porcentaje paga a plazos**, cuánto
      aparta, y cuántos abandonan el checkout sin pagar. Es el dato que sostiene
      o tumba la tesis financiera
- [ ] Evaluar integrar **Aplazo o Kueski** en el checkout para quien no puede
      apartar (no competirles: quedarnos con la venta y con el dato)
- [ ] **Decidir CFDI conscientemente.** Hoy está fuera de alcance por ADR-0002 y
      es el mayor hueco para que una agencia formal adopte el OS
- [ ] Asumir por escrito el nicho: **operador con inventario propio**, no agencia
      que revende vuelos (sin GDS no se sirve a la segunda)

### Carril Border (venta con fecha)

- [ ] 60 días operando Wanderlust en el OS
- [ ] Reporte de ventas en línea, clientes captados y comisión pagada
- [ ] Propuesta a Meny: socio de diseño, 3 meses gratis, **precio pactado desde
      el día uno** (no un año gratis: el que no paga no reclama y al año hay
      precipicio)

## Lo que NO vamos a hacer

- **Subasta entre agencias** para viajes a la medida → [ADR-0050](adr/0050-el-viaje-a-la-medida-es-un-lead-no-una-subasta.md)
- **Notoriedad de marca antes que conversiones.** Con presupuesto chico se
  reparte el aprendizaje y no aprende ninguno.
- **Vender el SaaS a nivel nacional** antes de que el OS haya operado un mes
  real. Contradice ADR-0002 y vende una promesa.
- **Revivir las tres páginas en paralelo** con el mismo contenido. Se
  canibalizan y multiplican el trabajo.

## Preguntas abiertas del fundador

1. **Cuánto puede perder al mes** mientras aprende. Todo el plan de publicidad
   depende de ese número.
2. **Quién contesta los mensajes** que genera la publicidad, y con qué horario.
   Un anuncio sin quien responda en minutos es dinero tirado.
3. **Costo real por salida y lugares de la unidad**, para fijar precio.
