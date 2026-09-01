# ADR-0031 — La atribución del embajador vive en una cookie, y es last-touch

- Estado: aceptada · Fecha: 2026-09-01 · Sustituye: —
- Alcance: `src/proxy.ts`, `crearPedido`, `pedido-form.tsx`,
  `comprar/[serviceId]/page.tsx` (b082)

## Contexto

El `?ref=CODIGO` del embajador viajaba **solo en la query string**, hop a hop, y
se respaldaba en `localStorage` recién al llegar a `/comprar` **con sesión**. Eso
significa que bastaba con que el visitante hiciera cualquier cosa normal para que
la comisión se evaporara:

- tocar el logo, el footer, «← Todos los viajes», la ficha de una agencia o
  «Entrar» — ~10 `href` del funnel público **no propagan el ref**;
- registrarse y confirmar el correo: el link del mail lo devuelve al Site URL sin
  la query, y en ese momento el respaldo todavía no existía (no había sesión
  cuando pasó por `/comprar`);
- volver al día siguiente por Google o tecleando la URL.

Los tres son el comportamiento normal de un comprador, no casos raros. El único
carril que sobrevivía era tarjeta → ficha → CTA, sin desviarse.

Un embajador que vende y no cobra deja de vender, y se lo cuenta a los demás.

## Decisión

**El `?ref` se captura en el PRIMER aterrizaje, en una cookie, desde `proxy.ts`.**

- Se escribe **solo si el request trae `?ref`**. Esa petición ya tiene su propia
  query key en el CDN, así que **ninguna respuesta cacheada de una URL limpia se
  lleva un `Set-Cookie`** — el riesgo de envenenar el caché queda descartado.
- `httpOnly`, `sameSite=lax`, `secure` en producción, `path=/`, **30 días**.
- Se valida con `normalizarCodigoReferido`, **el mismo normalizador que usa la
  BD**, para no guardar basura en una cookie.
- `crearPedido` la lee y **la consume** al atribuir: sin eso, la compra del año
  que viene se le seguiría acreditando al mismo embajador.

Esto **borra** andamio en vez de agregarlo: se va el respaldo en `localStorage`
(`mkt_ref`), el `refCode` que el form le pasaba a la acción, y la prop que la
página le pasaba al form. Ya no hay que perseguir los diez `href`.

### Last-touch, no first-touch

ADR-0025 usa **first-touch** para medir gasto en ads. Esto es otra cosa: decide
**a quién le pagas**. Con first-touch, el embajador cuyo link cerró la venta no
cobra porque el comprador vio otro link hace tres semanas — un caso de soporte
imposible de explicarle a alguien que estás reclutando. **Gana el último link.**

Las dos políticas conviven porque miden cosas distintas y viven en
almacenamientos distintos (`ktz_attribution` en localStorage para marketing;
`kz_ref` en cookie para la comisión).

## Alternativas descartadas

- **Meter `ref` al `PARAM_MAP` de `attribution.ts`** (localStorage, cliente): ese
  módulo es *evidencia de marketing*, no dinero, y **el servidor no lo ve** sin
  que el cliente se lo reenvíe — el mismo agujero de hoy con otra forma.
  `crearPedido` es quien llama al RPC; necesita leerlo él.
- **Las dos a la vez**: dos fuentes, dos TTL y dos políticas para el mismo pago.

## Riesgos que quedan vivos

- **Robo de venta**: last-touch permite el «ábrelo con mi link antes de pagar».
  El rastro queda en `bookings.ambassador_id` y en `referral_misses`.
- **Webview del correo**: si la confirmación abre en un navegador distinto, la
  cookie no está. Ninguna variante cubre eso.
- La cookie es por navegador: comprar desde otro dispositivo pierde la
  atribución, igual que cualquier esquema basado en cookies.

## Verificación

`supabase/tests/atribucion_ref.mjs` recorre la app como un navegador (siguiendo
`Set-Cookie`) y prueba los siete casos, incluido **el que se fugaba**: aterrizar
con `?ref`, navegar por `/agencias` → `/explora` → `/politica-cancelacion` (tres
links que no lo propagan) y comprobar que la atribución sigue viva.

Además, compra real en el navegador con un viajero efímero: el pedido quedó con
`ambassador_id` = el embajador del link **sin que el `?ref` viajara en ninguna
URL intermedia**, y con `0` líneas de comisión por seguir en `draft` (ADR-0029).
