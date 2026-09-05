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

## Checklist

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
