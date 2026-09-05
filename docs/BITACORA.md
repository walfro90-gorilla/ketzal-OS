# Bitácora de construcción — Ketzal OS

> **Historia, no reglas.** Este archivo conserva VERBATIM el changelog que
> vivía en la sección "Construido — estado real" de `CLAUDE.md` (movido aquí
> el 2026-08-27 para adelgazar el contexto por sesión). Las reglas del juego
> vigentes viven en **`docs/adr/`**; el estado corto, en `CLAUDE.md`.
> Entrada nueva SIEMPRE aquí (arriba de la sección), nunca de vuelta en
> CLAUDE.md.

## Entradas nuevas (más reciente arriba)

> **Plan comercial de arranque, y la subasta que no se va a construir (2026-09-05).**
> Sesión larga de estrategia con el fundador, sobre datos medidos esa noche y no
> sobre supuestos: 5 viajes publicados con **447 lugares vacíos** y cero ventas
> en línea; las páginas de Facebook (Border 29 mil seguidores y publicando a
> diario con 317 reseñas al 96%, Wanderlust 9,800 dormida desde 2022, Ketzal
> 3,100 dormida desde mayo de 2025); y las tarifas de comisión vivas (plataforma
> 10%, embajador $250 por pasajero, agente $300).
>
> Tres decisiones: **Wanderlust es el laboratorio** (es la única con Mercado Pago
> conectado y no requiere convencer a nadie), **Border es una venta y no un
> canal** (lo opera Meny; se le lleva el reporte de Wanderlust a los 60 días, no
> insistencia), y **la página de Ketzal se calienta para hablarle a quien quiere
> vender**, no a quien quiere viajar. Producto de entrada: fin de semana de
> campamento en quinta más dunas de Samalayuca con sandboarding, cuyo trabajo es
> producir clientes con cuenta, no margen.
>
> Hallazgo que cambia una configuración: con las tarifas fijas de hoy, un tour
> local de $600 acumula $610 de comisiones y **el motor rechaza el devengo en
> silencio** por exceder la venta. Antes de vender el primer tour barato hay que
> ponerle regla propia, porcentual, a ese servicio.
>
> Y una idea del fundador que se descarta con su razón escrita: una **subasta**
> donde las agencias compitan por viajes a la medida. Se descarta por arranque en
> frío por los dos lados, desintermediación (en el grupo de Facebook las agencias
> ya responden con su nombre y cierran por WhatsApp) y porque ser juez y jugador
> cierra la puerta del SaaS. En su lugar, formulario que produce un lead y se
> contesta con la cotización que ya existe → ADR-0050. Todo el plan con su
> checklist en `docs/PLAN_COMERCIAL.md`.
> **El onboarding de una agencia nueva ya se celebraba solo; le faltaban los momentos (2026-09-04).**
> El fundador pidió tour + confeti para agencias nuevas. Al revisar, casi todo
> existía: el tour con foco de 13 pasos que se auto-abre (m005) y el checklist
> "Primeros pasos" derivado de `onboarding_agencia()` (b064). Lo que faltaba era
> más fino. **Confeti en dos momentos y ninguno más**: la apertura AUTOMÁTICA del
> tour para el admin que estrena agencia (al reabrir con "?" no dispara, y al
> agente invitado tampoco — su momento es su primera venta), y "Primeros pasos"
> al llegar a cero, que es el momento que de verdad vale y que hasta hoy no se
> marcaba de ninguna forma. Ese segundo vive en un componente APARTE porque la
> tarjeta solo se monta con `pendientes > 0`: al completarse se desmonta y no
> puede celebrar su propio final. Se celebra la **transición**, no el estado, para
> que quien se une a una agencia ya lista no vea confeti por trabajo ajeno.
> `canvas-confetti` entra con import dinámico: chunk propio de 11 KB, fuera de
> `main-app` y del layout de ops, y respeta `prefers-reduced-motion`. De paso, el
> paso "Primeros pasos" del tour dejó de hablar en condicional ("si tu agencia es
> nueva") — se gatea con `conAgencia` desde `profiles.supplier_id`, que el layout
> ya leía. **Dos hallazgos del camino:** `vitest.config.ts` no tenía el alias
> `@/`, y hasta hoy ningún test lo había cruzado, así que el hueco estaba tapado
> por casualidad; y la prueba en navegador midió la diferencia exacta —el admin
> pide el chunk del confeti y ve 14 pasos, el superadmin no lo pide y ve 13.
> → [ADR-0049](adr/0049-el-confeti-solo-celebra-dos-momentos.md).

> **Que un asistente de IA pueda citarte: marca, fechas, catálogo vivo y aviso
> a Bing (2026-09-04).** El fundador preguntó cómo lograr que ChatGPT o Gemini
> recomienden Ketzal. Medido contra producción, ADR-0026 ya tenía viva la base
> —robots invitando a los cinco crawlers de IA, `TouristTrip` en la ficha,
> `ItemList` en la vitrina—, así que el trabajo fue tapar tres huecos y decir la
> parte incómoda: con **5 tours publicados, 4 rutas y cero menciones de
> terceros**, ningún asistente va a recomendar la marca por más schema que se
> agregue; lo que decide es estar en el índice, tener contenido con forma de
> respuesta y que alguien más te corrobore.
>
> Lo construido (ADR-0048): la portada declara `Organization` + `WebSite` atados
> por `@id` —nada ataba el nombre "Ketzal" al dominio—; la ficha publica
> `departureTime` y `availabilityStarts` con la salida más próxima, que es la
> pregunta que sigue al precio; `llms.txt` deja de ser estático y sirve el
> catálogo vivo con nombre, destino, precio en MXN, agencia y URL por tour; y
> publicar o despublicar un servicio avisa a Bing por **IndexNow** dentro de
> `after()`, env-gated por `INDEXNOW_KEY`.
>
> El harness nuevo `aeo_superficie.mjs` (24 aserciones, anónimo) cazó de
> inmediato que `/indexnow-key.txt` daba **307 a `/login`**: sin ese archivo
> público, Bing nunca valida el aviso y IndexNow no sirve para nada. Misma
> familia que el bug de `/privacidad` de anoche. Y cazó una trampa del propio
> harness: `fetch` sigue redirects por omisión, así que la primera versión
> pasaba en verde midiendo la página de login — todas las peticiones llevan ya
> `redirect: 'manual'`. Verificado por mutación. Suite 32.
> **Rediseño de la home, etapas 5 y 6: historia, precios, preguntas, cierre y
> la auditoría que encontró dos fallas de accesibilidad (2026-09-04).** La home
> queda completa. Historia del fundador firmada, encuadrada como credibilidad
> de producto ("No lo diseñé leyendo el mercado. Lo diseñé perdiendo"), con un
> **hueco reservado** para su foto (`HuecoFoto`): dice en pantalla qué falta y
> reserva la caja exacta para que el layout no salte cuando llegue el archivo;
> nada de stock. Precios en tres columnas con el modelo real —beta gratis, sin
> comisión en la venta que registra la agencia, comisión solo por la vitrina— y
> la nota de que la tarifa de Mercado Pago es aparte y Ketzal no la retiene.
> Cuatro preguntas con `<details name="preguntas">` nativo: acordeón exclusivo,
> teclado y lectores de pantalla gratis, **cero JavaScript** (verificado: abre
> con clic y cierra la anterior). Cierre con el titular de la spec. Footer
> propio de la home (`FooterHome`), porque el compartido le habla al viajero;
> lleva contacto, los dos textos legales y **la única puerta al marketplace de
> toda la página** (ADR-0047), medida: `/explora` aparece exactamente una vez.
>
> **La auditoría (etapa 6) encontró dos cosas reales antes de mergear**, midiendo
> el DOM en Chrome, no leyendo la tabla de la spec: (1) `text-low` (#6B7F79) se
> estaba usando en captions de 12px y small de 14px, donde da **4.02:1 sobre
> surface-1 y 4.38 sobre canvas** — falla AA; la spec lo permite solo en ≥18px.
> Se cambiaron los 15 usos a `text-mid` (en texto chico la jerarquía la da el
> tamaño, no el color) y `home.mjs` lo fija. Resultado: **129 textos medidos, 0
> fallas, el peor par ahora 7.27:1** (era 4.02). (2) El enlace "Ver salidas
> publicadas" del footer no tenía anillo de foco. Con Tab real: **16 elementos,
> orden lógico, ninguno sin anillo**. Trampa de método anotada: `el.focus()`
> programático NO dispara `:focus-visible`, así que medir el foco así da un
> falso negativo — hay que mandar Tab de verdad. `home.mjs` cierra en **36
> casos**.

> **Rediseño de la home, etapa 4 de 6: cómo funciona, inventario y capa de IA
> (2026-09-04).** Tres pasos numerados (aquí sí: es una secuencia real) con
> mini-captura cada uno — el formulario de nueva venta, el plan de abonos y el
> **recibo público real** (folio #0001, emitido por `emit_receipt` en la
> corrida). **Inventario en vivo**: `components/marketing/inventario.ts` lee
> las mismas RPC anónimas de la vitrina (`list_public_services` +
> `get_public_service`), así la home nunca enseña algo que el marketplace no
> tenga; hoy salen Huasteca Potosina ($7,999, Border Travels), Colombia 2026 y
> Creel y Barrancas, con foto del Storage por el optimizador, próxima salida,
> cupo libre y precio. Si un día no hay nada publicado, la sección
> simplemente no se pinta. Capa de IA en lenguaje de negocio con el enlace
> verificable a `npmjs.com/package/ketzal-mcp` y tres nombres de herramienta
> que existen de verdad en `mcp/src/tools`. `home.mjs` sube de 20 a 27 casos:
> el `<ol>` tiene exactamente 3 pasos con 3 imágenes, el inventario trae la
> Huasteca con su precio real, las fotos salen del Storage por
> `/_next/image`, el enlace a npm está, no se promete ninguna herramienta que
> el MCP no tenga, y no hay copy vacío ("potencia", "transforma", "sin
> fricción"). Dos tropiezos de la corrida: `emit_receipt` devuelve el folio,
> no el id (el recibo se busca por `pg`, porque `receipts` es RPC-only), y esa
> tabla no tiene `created_at` sino `folio`. Solo queda el cierre (etapa 5).

> **Rediseño de la home, etapa 3 de 6: credibilidad, problema y features
> (2026-09-04).** Sustituye las cuatro cards iguales con icono (anti-patrón
> §7) por tres secciones de la spec. Credibilidad: franja delgada sin fondo,
> "Agencias que ya están en Ketzal" con los dos nombres reales y su ciudad
> (sin el verbo "operan": el OS sigue en pruebas), y a la derecha Next.js /
> Supabase / MCP en `caption`; cero logos inventados. Problema: dos columnas
> "Así opera hoy tu agencia" (5 líneas, en `mid`) contra "Así opera con
> Ketzal" (4, en `hi`), separadas por hairlines; el único dato en jade de la
> sección es "Una sola pantalla con todo lo que te deben". Features con
> jerarquía: uno héroe ancho ("Venta, abonos y recibo en un solo flujo",
> `display-md`) con la captura de escritorio de la venta —plan de pagos y
> resumen total/pagado/saldo—, y dos secundarios lado a lado con captura más
> chica: Cobranza (pantalla real) y Vitrina (la ficha pública real de la
> Huasteca de Border Travels, en JPEG porque en PNG pesaba 2.2 MB). Las tres
> capturas nuevas salen del mismo `scripts/capturas-home.mjs` (opciones
> `soloViewport` y `formato`), encuadre 1280×800 a 2x, agencia efímera y
> limpieza verificada. `home.mjs` sube de 14 a 20 casos: ≥ 4 imágenes todas
> por el optimizador con alt ≥ 40 caracteres, solo la del hero prioritaria y
> las demás lazy, las dos agencias por nombre, y ningún "+", "%" ni
> "clientes" en la franja de credibilidad. Medido en Chrome: título de
> feature 39 px Bricolage, subtítulos 25 px Inter 600, problema 31 px, franja
> 14 px `mid`; sin scroll horizontal a 1440 ni a 390. Quedan del diseño
> viejo "Cómo funciona" y el cierre (etapas 4 y 5).

> **Rediseño de la home, etapa 2 de 6: nav y hero con captura real (2026-09-03).**
> La home pasa a canvas oscuro con la paleta jade (ADR-0046). Nav sticky con
> blur permanente (cero JS): logo, "Producto" (ancla), "Entrar" y, solo si
> `WHATSAPP_VENTAS` está puesta, el CTA "Escríbenos"; ya no enlaza a `/explora`
> (ADR-0047). Hero asimétrico 7/5 con el H1 y el párrafo de la spec, CTA
> primario WhatsApp (o "Entrar a mi agencia" si no hay número: no se inventa
> un botón), la línea "Hecho en Ciudad Juárez…" y a la derecha la **captura
> real del producto**: la venta con su plan de abonos en el celular, única
> imagen con `priority`, servida por el optimizador con AVIF
> (`images.formats` en `next.config.ts`). Las capturas se generan con
> `scripts/capturas-home.mjs`: agencia efímera + venta con plan quincenal y dos
> abonos (RPC reales con el JWT del agente efímero, política congelada y
> aceptada para que no salga el aviso legado), Chrome headless por CDP con la
> cookie de sesión —sin extensión, sin teclear contraseñas— a 2x, y limpieza
> verificada en cero (agencia, venta, cuentas, contadores de folio). Salieron
> 10 capturas (venta móvil/escritorio, cobranza, dashboard, lista de ventas,
> vitrina real de la Huasteca); la home usa una; el resto queda para las
> etapas 3–4 sin commitear. Las secciones viejas siguen debajo sobre el tema
> `dark` hasta que las etapas 3–5 las sustituyan. Harness nuevo `home.mjs`
> (12 casos): H1 único, UNA imagen prioritaria con alt descriptivo por
> `/_next/image`, nav sin marketplace, contenido también por RSC, `/styleguide`
> exige sesión; mutación gratis: corrido contra la home vieja en producción
> falla donde debe. Tres cosas que solo salieron midiendo: (1) en Next 16
> `priority` ya NO pone `fetchpriority="high"` en el `<img>` —solo quita el
> lazy y emite el `<link rel=preload>`—, el hint va aparte con `fetchPriority`;
> (2) `quality={85}` se servía como 75 en silencio porque Next 16 solo entrega
> las calidades de `images.qualities` (quedó `[75, 85]`); (3) `cn()` tiraba
> `text-lead` al verlo junto a `text-mid`: tailwind-merge no conocía los
> tokens nuevos y los trató como dos tamaños, así que el párrafo del hero
> salía a 16 px. Se le enseñan en `lib/utils.ts` (`extendTailwindMerge`) con
> su test.

> **Aviso de privacidad público, y la ruta legal que nacía tras el login (2026-09-03).**
> Con el píxel de Meta y GA4 ya midiendo, faltaba el prerequisito legal: el
> aviso de privacidad (LFPDPPP). Nace `/privacidad` — responsable, qué datos se
> recaban (contacto, viajeros, comprobantes; las tarjetas nunca tocan Ketzal),
> finalidades necesarias y secundarias, con quién se comparten (la agencia que
> opera el viaje, Mercado Pago, proveedores de infraestructura, Meta y Google),
> cookies y medición nombrando píxel y Analytics, y derechos ARCO — enlazado
> desde el pie de todas las páginas públicas y desde el checkout, **fuera** del
> checkbox que sella la política de cancelación con ip/ua (esa casilla no debe
> cambiar de significado para las ventas ya selladas). También al sitemap, junto
> con la política de cancelación, que tampoco estaba.
>
> Al probarla en el build: **307 a `/login`**. `proxy.ts` no la declaraba
> pública, así que el aviso que la ley pide mostrar a quien AÚN no es usuario
> solo lo veía quien ya tenía sesión — y el crawler de Google veía la pantalla
> de acceso. Un vistazo desde una cuenta abierta jamás lo habría notado.
> Arreglado en la lista de rutas públicas y fijado con `paginas_legales.mjs`
> (17 aserciones, sin sesión, exigiendo TEXTO y no status, por URL directa y por
> `RSC: 1`). Suite 31.
>
> Pendiente del fundador: confirmar la identidad legal del responsable
> (hoy dice "Ketzal", Ciudad Juárez) y **crear el buzón `privacidad@ketzal.tours`**
> — un correo ARCO que rebota es peor que no ponerlo.

> **Rediseño de la home, etapa 1 de 6: tokens (2026-09-03).** Arranca el
> rediseño de `ketzal.tours/` por la spec del fundador
> (`KETZAL_HOME_REDESIGN.md`, 12 secciones, lista de anti-patrones). Antes de
> tocar la home: un segundo bloque `@theme inline` en `globals.css` con la
> paleta jade medida del logo, canvas oscuro `#081512`, tres niveles de texto,
> hairlines, `signal`/`alert`, la escala tipográfica 1.25 con peso y tracking
> por token, tres radios por rol y el aire de sección (96/160 px). Todo
> ADITIVO: `git diff` de `globals.css` solo suma líneas; el OS no cambia ni un
> byte de CSS (ADR-0046). Inter se carga en `components/marketing/fonts.ts`,
> no en el layout, para que el OS no la descargue. `/styleguide` (protegida,
> `noindex`, cero cliente) pinta la paleta y **mide** cada par de contraste en
> el render con `lib/contraste.ts`; el test fija los nueve pares de la spec y
> encontró uno distinto: jade-600 sobre canvas da **8.66:1**, no 8.57 (AAA
> igual). También salió que canvas sobre `signal` es 6.37:1 (AA) y negro sobre
> `signal` 7.18:1 (AAA): el fill `signal` lleva texto negro. La spec traía
> `surface-2 #12292322` (ocho dígitos); quedó `#122923`. Con la etapa se
> documenta también ADR-0047 (propuesta): el apex es la puerta del SaaS hoy,
> el marketplace conserva sus rutas y el flip a `os.` tiene disparador. Lo que
> no se hizo a propósito: Bricolage 800 (la escala usa 600/700), AVIF en
> `next.config.ts` (va con las capturas), tocar `landing.tsx` (etapa 2).

> **Estreno del pixel de Meta y GA4 en producción (2026-09-03).** Wal creó el
> Business Portfolio "Ketzal OS", verificó `ketzal.tours` (TXT), creó el
> conjunto de datos `1461675542488693`, el token CAPI y el código de prueba;
> GA4 quedó en la propiedad existente con el flujo web apuntando al dominio,
> referencias no deseadas `mercadopago.com`/`mercadolibre.com` y el secreto de
> Measurement Protocol. Las cinco env vars en Vercel, bundle desplegado con el
> pixel y el `G-` inlineados. Primer `begin_checkout` real desde la vitrina:
> `ga4=sent`, **`meta=failed_400`** — y el log solo decía el status, así que
> no se sabía si era el token (190) o el payload (100). Ahora se loggea código y
> mensaje del error de Meta (la respuesta no trae el token). Con el log: **190
> "Cannot parse access token"** — el token pegado en Vercel no era el token
> (lección 6 del runbook, calcada). Token regenerado y pegado limpio →
> tercer checkout: `meta=sent ga4=sent`. **Pixel + CAPI + GA4 en vivo.**
> Observación: cada `begin_checkout` sale dos veces en `vercel logs`; Meta y
> GA4 dedupean por `event_id`/`transaction_id`.


> **El gate de la contraseña provisional redirigía y aun así entregaba el panel (2026-09-03).**
> Cerrando un hueco de cobertura salió una fuga. `gate_password_provisional.mjs`
> sólo probaba `/embajador` y `/proveedor`, los dos FUERA de `(ops)`: el gate del
> back-office —donde se mueve el dinero— nunca se había medido. Al escribir esos
> casos apareció por qué importaba. Con `must_change_password = true`, un GET a
> `/dashboard` con cabecera `RSC: 1` (lo que manda el navegador al hacer **clic**
> desde el menú) devolvía **200** y un flight de **72 KB** con el nombre de la
> agencia, nombres reales de clientes y once cifras en pesos, entre ellas
> `$20,024.80`. El `NEXT_REDIRECT` venía dentro, o sea que el router sí navegaba
> a `/nueva-password` — pero los datos ya habían viajado, y se leen pidiendo el
> RSC a mano. Causa: `(ops)` tiene `loading.tsx`, así que la ruta streamea y el
> `redirect()` del layout no alcanza a cortar el render de la página. `/ventas` y
> `/clientes` NO filtraban, por el instante en que se cancela el stream de cada
> una: peor que un hueco parejo, porque invita a arreglar la página en vez de
> mover el gate. Exposición al encontrarlo: **cero cuentas con el flag**
> (medido); la ventana se abre al reclutar embajadores con contraseña
> provisional. El gate se movió a `src/proxy.ts`, que corre antes de renderizar
> nada, consultando el flag a la BD y no al JWT —un `app_metadata`
> desincronizado es un gate que miente— y reusando la lectura de `profiles` que
> ese archivo ya hacía para las rutas admin, así que las rutas admin no la pagan
> dos veces. El `redirect()` del layout se queda como segunda línea. Seis casos
> nuevos en el harness exigen **307 a `/nueva-password` Y que el cuerpo no traiga
> contenido del OS**: las dos mitades, porque un 200 con `NEXT_REDIRECT` adentro
> también "redirige". Probado por mutación: anular el gate del proxy pone los
> tres casos RSC en rojo y **reaparece la fuga**
> ([ADR-0045](adr/0045-el-gate-de-seguridad-no-vive-en-un-layout.md)). Suite:
> **30/30**.

> **El OS tiene asistente IA: chat flotante sobre las 37 herramientas del MCP, solo superadmin por ahora (2026-09-03).**
> Se quería operar el OS en lenguaje natural sin terminal. No se escribió un
> segundo catálogo: `ToolDef` del MCP ya era agnóstico del transporte, así que
> `src/lib/agente/tools.ts` importa `ALL_TOOLS`, los traduce con
> `z.toJSONSchema` y llama `handler` directo; `mcp/src/session.ts` ganó un
> `tokenScope` (AsyncLocalStorage) para que corran con el JWT de la cookie y no
> con la sesión del disco. El LLM va por `fetch` (mismo patrón que el lector de
> volantes), Groq → Gemini → DeepSeek, saltando solo por red/429/5xx. Lo que
> mueve dinero o borra no corre: el stream emite `confirmar`, la persona da clic
> y se re-manda con el id aprobado. Dos cosas que solo salieron construyendo:
> **Turbopack no remapea `./x.js` → `x.ts`** (14 "Module not found" al importar
> el MCP; se resolvió con un loader de una línea en `next.config.ts`, no con
> esbuild ni cambiando el MCP), y **`GROQ_API_KEY` está marcada Sensitive en
> Vercel**, así que `vercel env pull` trae un valor inútil de 11 caracteres:
> en local se pega a mano. Probado: 22 unit tests nuevos (fallback, loop,
> confirmación, recorte de historial) y `agente_gates.mjs` 13/13 contra la app
> y la BD real con un superadmin y un admin efímeros (401/403/400, `whoami`
> devuelve la cuenta efímera, el abono no corre sin clic y sí con él; limpieza
> verificada). La prueba con modelo real queda pendiente de la llave en local.
> Escalar a todos los admins = quitar un `if` en la ruta.
> → [ADR-0044](adr/0044-el-asistente-del-os-reusa-las-herramientas-del-mcp.md).
> **La agencia se configura en Configuración, no en Proveedores (2026-09-03).**
> El fundador, a punto de desconectar la cuenta MP de Border, notó que la
> única forma de llegar a la ficha de su propia agencia (logo, nombre, cobros
> en línea) era abrir **Proveedores** y entrar a sí mismo — una sección que
> debe listar a los proveedores *de* la agencia. Arreglo: `/ajustes` pasa de
> "Ajustes de plataforma (solo superadmin)" a **Configuración** para todo
> admin, con dos ámbitos: *Mi agencia* (perfil público, cobros MP, formulario
> de la agencia — las mismas piezas que ya existían en `/proveedores/[id]`,
> ahora reusadas: la tarjeta de MP se extrajo a `cobros-mp.tsx`) y *Plataforma
> Ketzal* (marca + WhatsApp, solo superadmin). `/proveedores` deja de listar la
> propia agencia para el admin (el superadmin sigue viendo agencias, para él
> son proveedores) y enlaza a Configuración; `/proveedores/<mi agencia>`
> redirige a `/ajustes` conservando el `?mp=` del callback de MP, así el OAuth
> no cambia. El redirect vive en `proxy.ts` (donde ya se consulta el perfil), no
> en la página: `(ops)/loading.tsx` streamea y un `redirect()` de página sale
> como meta-refresh con **200** y un segundo de destello — lo cazó el harness,
> que exigía 307. Acotado por Rick midiendo el gate de `must_change_password`
> en `(ops)/layout.tsx`: el `redirect()` de un **layout** sí da 307 por URL
> directa (lanza antes de renderizar hijos); la degradación es solo de página. El select "Tipo" se bloquea al editar una agencia (no se degrada a
> transporte). Nav: "Ajustes" → "Configuración", ya no `superadminOnly`.
> Hard-test `configuracion_agencia.mjs` (agencia + proveedor + admin +
> superadmin efímeros; status **y** contenido, URL directa y RSC). Suite 29.

> **El expediente de usuario nunca había abierto, y el 200 lo tapaba (2026-09-03).**
> El fundador reportó que entrar al detallado de un usuario desde `/usuarios`
> daba "no se encuentra". La primera ronda de medición dijo que no había nada
> roto: los 9 perfiles de producción respondían **200**, con superadmin y con
> admin de agencia, en local y en producción; `list_users` y `can_view_user`
> coincidían fila por fila para los tres admins; los logs de Vercel traían 665
> respuestas y **cero 4xx**. Todo verde y el bug seguía ahí. Se vio abriéndola en
> un navegador de verdad: Next servía su pantalla *"This page couldn't load"*
> **con status 200**, y el log decía `Attempted to call fmtFecha() from the
> server but fmtFecha is on the client`. `fmtFecha` vivía dentro de
> `usuarios-list.tsx` (`'use client'`) y el expediente —Server Component— la
> importaba y la llamaba. Así desde b066 (2026-08-23): la sección nunca funcionó
> y nadie lo notó porque `/usuarios` sí abría. Se mudó a
> `src/components/data/format.ts`, que existe justamente para lo que se importa
> de los dos lados. Segundo camino al mismo síntoma: las cuentas efímeras de los
> hard-tests (`qa.efimero.…`) salían en `/usuarios` y en `/equipo` como
> cualquier persona; viven segundos, así que a quien le diera clic a una después
> de que la fixture la borró le salía un 404 mudo. b093 las esconde con un
> predicado compartido (`ketzal.es_cuenta_efimera`) en `list_users` y
> `list_team`, y el expediente dejó de dar 404 mudo: un id que no existe (o que
> no es de tu alcance — no se distinguen a propósito) pinta una tarjeta que lo
> explica. De paso el rediseño que pidió el fundador: `/usuarios` estrena una
> tira de resumen (cuentas por tipo, pendientes de aprobación, sin cuenta de
> acceso, entraron en 30 días) y el expediente pasó de cinco `dl` apilados a
> encabezado con iniciales y badges, cuatro señales arriba (último acceso,
> sesiones abiertas, entra con, cuenta creada), dos columnas de detalle y la
> actividad en mosaicos — con `StatTile` como pieza nueva. Harness:
> `supabase/tests/expediente_usuario.mjs` (7 casos) pide **cada** expediente que
> la lista enlaza, por URL directa y por `RSC: 1` (el clic), y exige el
> **contenido**, no el status. Probado por mutación: devolver el import viejo
> pone los dos casos en rojo **con 200 en los 8 ids** — que es exactamente por
> qué la verificación anterior, que sólo miraba el status, había dado verde con
> el bug puesto ([ADR-0043](adr/0043-la-frontera-cliente-servidor-no-se-cruza-con-un-helper.md)).
> Suite: **28/28**.

> **Desconectar la cuenta MP de una agencia (b092, ADR-0042, 2026-09-03).**
> Al probar el redirect URI nuevo, Border quedó conectada al MP user
> `479630144` — el mismo de Wanderlust, o sea la cuenta del fundador — y no
> había forma de quitarla: la única puerta a `mp_accounts` era el OAuth con
> upsert (Conectar/Reconectar). Se agregó `mp_account_disconnect(p_supplier)`
> (DEFINER, guard idéntico a `mp_account_status`, `coalesce(...,false)`,
> devuelve false si no había fila, escribe `system_log`) y el botón
> "Desconectar" con confirmación de dos pasos en `/proveedores/[id]`. El texto
> dice lo que ADR-0024 ya decía: Ketzal borra su copia; revocar el permiso es
> del vendedor en su cuenta de MP. Hard-test `mp_desconectar.sql` (12
> aserciones: sin sesión, admin ajeno, agente, deny-all directo, admin propio,
> idempotencia, superadmin, rastro). Suite 27/27. La UI no se clickeó en
> navegador en esta sesión: compila; la primera pulsación real es la de Border.
> De paso: `encuestas_rls.mjs` dependía de que existiera un admin REAL de
> Wanderlust (hoy no hay; el fundador es superadmin sin agencia) y fallaba;
> ahora crea el suyo con `crearPosiciones`. Suite completa 27/27 con la app
> local en 3100.

> **La confirmación de correo se pausa hasta Pro, pero deja de ser un camino sin probar (2026-09-03).**
> El fundador prendió *Confirm email* en Auth y la suite siguió en verde. Ese
> verde no decía nada: las 25 fixtures crean cuentas con `email_confirm: true`
> por la Admin API, así que **ninguna tocaba el camino que el switch cambió** —
> `registrarComprador` llama `signUp()`, y de ahí en adelante el usuario solo
> entra si el enlace del correo funciona. Se midió lo que sí y lo que no
> aguantaba: las cinco altas administradas (`/proveedores`, `/comisiones`,
> `/viajeros` y las dos de `/equipo`) pasan `email_confirm: true` y no se
> tocan; la allowlist de Redirect URLs respeta `/auth/callback` y rechaza un
> host ajeno (la primera lectura dijo lo contrario y estaba mal: el REST de
> `admin/generate_link` quiere `redirect_to` PLANO, anidarlo en `options` lo
> ignora en silencio). Lo que sí duele con la plantilla por defecto: el enlace
> es PKCE (`?code=`) y se canjea contra la cookie del navegador donde se pidió,
> así que quien se registra en el webview de WhatsApp y confirma desde Gmail
> aterriza en `/login?error=auth`. La plantilla con `{{ .TokenHash }}` ya
> existe y arregla justo eso, pero editarla pide Pro. Decisión del fundador:
> apagar la confirmación hasta que haya Pro y usuarios pagando
> ([ADR-0041](adr/0041-la-confirmacion-de-correo-se-pausa-hasta-pro.md)). No
> abre hueco — `email_verificado` exige `confirmation_sent_at is not null`
> además de `email_confirmed_at`, y con auto-confirmación GoTrue no manda
> correo, así que falla cerrado (medido contra los 8 usuarios de producción:
> los 8 con `confirmation_sent_at` NULL, solo los 3 de Google verificados). Lo
> que se apaga es el barrido por correo de `link_my_customers`; quedan
> `claim_quote` por token y Google. Y el camino queda probado para el día que
> se prenda: `supabase/tests/confirmacion_email.mjs`, 10 casos que fabrican el
> enlace con `admin/generate_link` (cero correos, cero cuota), lo pegan **sin
> cookies** —otro navegador— y exigen `307 → /mis-compras`; más un solo uso,
> PKCE inválido que degrada sin cookie de sesión, `?next` que no saca del
> sitio, y limpieza verificada. Probado por mutación: matar `token_hash` da 2
> rojos y quitar la sanitización del `?next` otros 2 (el `https://` ajeno
> además tira 500). La primera versión del caso del `?next` comparaba solo el
> host y pasaba con la mutación puesta — la ruta se arma como
> `${origin}${next}`, así que hasta un `next` sucio conserva el host; ahora
> compara el `pathname`. Suite: **26/26**.

> **El dominio nuevo en todos los links que van a un cliente; el host viejo redirige (2026-09-03).**
> Pregunta del fundador: ¿cómo quedan los links de embajadores y de cotizaciones
> con `ketzal.tours`, hay que cambiar algo para que no falle al compartir?
> Inventario contra el código: siete sitios armaban el link con el host donde
> estaba parado quien lo generaba (`window.location.origin` / header `host`):
> link de referido (`link-referido.tsx`), viajes para compartir del portal del
> embajador (`embajador/page.tsx`), cotización desde el back-office
> (`cotizacion-acciones.tsx`), botón "Compartir por WhatsApp" de cotización/
> estado/recibo (`compartir-whatsapp.tsx`), compartir ficha pública
> (`compartir.tsx`), link del voucher (`voucher-boton.tsx`), estado de cuenta y
> Checkout Pro desde la venta (`ventas/[id]/actions.ts`) y el QR del voucher.
> Con un agente en `os.ketzal.tours` (o en el `vercel.app` viejo, que el PWA
> instalado sigue abriendo) el cliente recibía ese host. Ahora todo pasa por
> `origenPublico()` (`src/lib/site-url.ts`): `NEXT_PUBLIC_SITE_URL` si existe,
> si no el origen actual (local/preview). Además: redirect 308
> `ketzal-os.vercel.app` → `ketzal.tours` en `next.config.ts` para que los links
> ya repartidos sigan abriendo con su query (`?ref=`) intacta — `/api` y
> `/_next` fuera, porque el webhook y el OAuth de Mercado Pago se registraron
> con el host viejo y no siguen redirects; canonical al apex en `/`, `/explora`,
> `/agencias`, `/agencia/[id]`, `/politica-cancelacion` (`/servicio` y `/opina`
> ya lo tenían) para que `os.` no cuente como copia; default del MCP
> (`KETZAL_APP_URL`) y docs vivos (CLAUDE.md, README, mcp/README) al dominio
> nuevo. **Evidencia:** build con `NEXT_PUBLIC_SITE_URL=https://ketzal.tours`;
> `curl -H 'Host: ketzal-os.vercel.app'` → `/explora?ref=X` 308 a
> `https://ketzal.tours/explora?ref=X`, `/api/track` NO redirige; canonicals
> presentes; navegador real con embajador efímero en `localhost`: el link de
> referido y los tres botones de WhatsApp salieron `https://ketzal.tours/…?ref=QADOMINIO`
> (borrado y verificado: 0 en auth.users/profiles). `tsc`, eslint, 174 unit,
> 77 MCP y `next build` limpios. **Ojo para Wal:** el PWA instalado desde
> `ketzal-os.vercel.app` ahora aterriza fuera de su scope (se abre en el
> navegador): reinstalar desde `ketzal.tours` — el modal de instalar lo ofrece.
> Y el OAuth de Mercado Pago tiene registrado el redirect del host viejo: para
> conectar Border desde `ketzal.tours` hay que agregar
> `https://ketzal.tours/api/mp/oauth/callback` en la app de MP (o seguir
> conectando desde el `vercel.app`, que para `/api` no redirige).

> **`ketzal.tours` en vivo; `www` redirige al apex (2026-09-03).**
> Wal puso los registros en Namecheap (A `@` y `os` → `76.76.21.21`), fijó
> `NEXT_PUBLIC_SITE_URL=https://ketzal.tours` en Vercel y los hosts en Supabase
> Auth. Vercel emitió certificados para los tres hosts; `sitemap.xml` y
> `robots.txt` ya emiten `https://ketzal.tours`. "No alcanza el dominio" era
> la caché del resolver de su red (seguía en el parking `192.64.119.240`, TTL
> 30 min) — autoritativo, 1.1.1.1 y 8.8.8.8 ya respondían Vercel. `www`: en vez
> de borrar el CNAME del parking (que servía anuncios de Namecheap bajo la
> marca), se apuntó a `cname.vercel-dns.com`, se agregó `www.ketzal.tours` al
> proyecto y se fijó redirect 308 al apex con `vercel api -X PATCH
> /v9/projects/{id}/domains/www.ketzal.tours -f redirect=ketzal.tours`.
> Verificado: `https://www.ketzal.tours/` → `308 https://ketzal.tours/`;
> apex y `os` → 200 server=Vercel.

> **Dominio propio: `ketzal.tours` + `os.ketzal.tours` conectados al proyecto Vercel (2026-09-03).**
> El fundador compró `ketzal.tours` en Namecheap (mismo panel que estampida.run)
> y pidió conectarlo junto con `os.ketzal.tours` al proyecto `ketzal-os`, y
> ejecutar el `<orden-de-ejecucion>` de `docs/MARKETING_STACK_HUELLA.md`.
> Estado real contra el código: **los pasos 1–5 ya estaban hechos en PR #86**
> (contrato `bookings.attribution`, robots/sitemap/llms.txt/JSON-LD
> `TouristTrip`+`ItemList`, trackers cliente, `conversions.ts` con hooks en
> webhook MP/Brick/SPEI, tarjeta de atribución en `/cuentas`); el doc mismo ya
> vivía en `main` desde ese PR. Verificado en prod: `/robots.txt`, `/sitemap.xml`
> y `/llms.txt` 200, robots permite GPTBot/ClaudeBot, una ficha trae JSON-LD
> `TouristTrip`/`Offer`/`TravelAgency`/`Place` y `/explora` trae `ItemList`.
> El paso 6 (test event CAPI, GA4 DebugView, Network tab) sigue bloqueado por
> los IDs/tokens del fundador — todo nace env-gated, hoy en Vercel solo existe
> `NEXT_PUBLIC_MARKETPLACE`. Lo nuevo de hoy: `vercel domains add` de los dos
> hosts al proyecto (`vercel domains inspect` → `A 76.76.21.21` para ambos;
> nameservers se quedan en Namecheap, como manda el prerequisito 1: solo se
> agregan registros); y los dos únicos fallbacks con `ketzal-os.vercel.app`
> hardcodeado (`credenciales-provisionales.tsx`, `voucher/[voucherId]/page.tsx`)
> pasan a `SITE_URL`. Mercado Pago ya arma `notification_url`/`back_urls` del
> host de la petición, así que funciona en cualquier dominio. **Pendiente del
> fundador:** registros DNS en Namecheap; `NEXT_PUBLIC_SITE_URL=https://ketzal.tours`
> en Vercel (decide sitemap/canonical/OG/`event_source_url` — con dos dominios
> no conviene dejar que Vercel elija); Site URL + Redirect URLs de Supabase Auth
> con los dos hosts; después los TXT de Meta y Google. Sin decidir: ruteo por
> host (apex = vitrina, `os.` = back-office) — hoy los dos sirven todo.

> **"Instala la app" pasa de tarjeta a modal, solo celular, en los tres shells (2026-09-03).**
> El fundador pidió un modal que sugiera instalar la app en el celular cuando
> detecte que no está instalada. Ya existía `InstalarApp` (embajadores v2) como
> tarjeta inline solo en `/embajador`. Ahora es una hoja inferior (`Sheet`
> side="bottom") montada en `AppShell` (ops), `(travel)/layout` y
> `embajador/layout`, con `esperar={!tourYaVisto}` para no apilarse con el
> tour de bienvenida. Reglas: solo `max-width: 767px`; si ya corre en
> `standalone` (o iOS marcó "Ya la tengo") no sale; "Ahora no", la X o el fondo
> se respetan 14 días; `appinstalled` la marca lista. iOS no tiene
> `beforeinstallprompt` ⇒ instrucciones Compartir → Añadir a inicio. Hallazgo:
> Chrome dispara `beforeinstallprompt` antes de que React monte el efecto, así
> que el root layout lo captura en `window.__kzInstallPrompt` con un `<Script
> strategy="beforeInteractive">` (sin `preventDefault`: en las páginas públicas
> la barra de Chrome sigue siendo el único camino). **Evidencia:** navegador
> real contra la BD viva con viajero efímero: a 500px el modal aparece con el
> evento REAL de Chrome ya capturado (`promptRealCapturado: true`), "Ahora no"
> escribe `kz_instalar_pospuesto` y tras recargar no reaparece; a 1200px no sale
> aunque el evento sí llegó. `tsc`, eslint y `next build` limpios. Limpieza
> verificada: 0 `qa.b092` en auth.users/profiles/bookings. **De paso:** el alta
> de prueba devolvió "Te enviamos un correo para confirmar" ⇒ **el fundador ya
> prendió "Confirm email"** (`confirmation_sent_at` no nulo en la cuenta nueva);
> la puerta por correo de ADR-0039 queda viva en cuanto pegue la plantilla.
> Y Supabase Auth rechaza correos `.local` (`email_address_invalid`): las cuentas
> efímeras de navegador van en `@gorillabs.dev`.

> **El snapshot del schema estaba 20 migraciones atrás, y el bloqueo era falso (2026-09-03).**
> `supabase/snapshots/ketzal_schema.sql` seguía siendo el dump de **b071** y su
> propia cabecera lo decía: *"hace falta la contraseña de la BD"*. No hacía
> falta. El `DATABASE_URL` lleva meses en `.env.local`, y aunque esta máquina no
> tiene `psql` ni `pg_dump` (`command -v` → nada), **la CLI de Supabase no los
> necesita**: baja `public.ecr.aws/supabase/postgres` y corre el `pg_dump` de
> adentro. Dos minutos:
>
> ```
> supabase db dump --db-url "$DATABASE_URL" --schema ketzal \
>   -f supabase/snapshots/ketzal_schema.sql
> ```
>
> Snapshot al día hasta **b091 / m011**, verificado por identificador y no por
> fecha: trae `claim_quote` y `email_verificado` (b091), `puede_folear` y
> `puedo_subir_comprobante` (b088), `puedo_escribir_imagen_supplier` (b090).
> Schema-only —0 `COPY`/`INSERT`, ninguna fila de negocio— y 0 URLs de conexión
> embebidas.
>
> **Lo que el snapshot NO trae, ahora escrito en su cabecera:** las policies de
> `storage.objects` viven en el schema `storage`, no en `ketzal`, así que un
> rebuild desde este archivo deja el Storage **sin policies**. Desde el 2026-09-02
> eso es seguridad crítica; su fuente son `b088_superficie_publica_storage.sql` y
> `b090_storage_suppliers_y_brand_scopeados.sql` (ADR-0036, ADR-0038) y hay que
> re-aplicarlas a mano.
>
> Cierre de carriles coordinado con el carril de b091 (ADR-0039): main sin PRs
> abiertos, árbol limpio, 24 harness en el registro, y 13 ramas locales viejas
> —todas ya integradas por squash, verificadas archivo por archivo— borradas.
> Queda colgada la remota `origin/fix/list-ambassadors-admin` (su contenido ya
> entró por #105): borrar remotas es decisión del fundador.

> **La cotización se guarda en la cuenta del viajero; el correo liga solo verificado (b091, ADR-0039, 2026-09-03).**
> El fundador preguntó cómo hacer que, cuando un agente registra y cotiza a un
> prospecto, Ketzal le ofrezca crear su cuenta de viajero "para tener ahí la
> cotización y más opciones de viaje", y pidió ligar cuentas por correo
> "agregando la confirmación si es necesario". Verificado contra el código y la
> BD viva: `/cotizacion/[token]` era pública, sin expirar y con un solo CTA
> (aceptar política); `/mis-compras` filtra SOLO `bookings.marketplace_customer_id
> = auth.uid()` y la venta del back-office nace con eso en null — ligar
> `customers.marketplace_customer_id` no bastaba. "Confirm email" está APAGADO
> en el proyecto (8/8 cuentas con `confirmation_sent_at` null), así que
> `email_confirmed_at` no prueba nada; y `customers.email` lo teclea el agente
> (3 de 6 clientes ni lo tienen). De ahí las dos puertas de ADR-0039: el
> **token** liga esa cotización (`claim_quote`, primer reclamo gana con error
> explícito para el segundo) y el **correo verificado** liga el expediente
> (`link_my_customers` desde `/mis-compras`, predicado `email_verificado` que
> falla cerrado con auto-confirmación y acepta Google `email_verified`).
> Hallazgo al ligar: `delete_my_draft_order` y los tres RPC de pago dejaban al
> prospecto borrar/replanear/pagar el draft del agente ⇒ canal `manual` queda de
> **solo lectura** en el portal (gate en BD en 5 RPC; la UI esconde con
> `channel`, que ahora viajan `list_my_marketplace_orders` y `get_my_trip`).
> Cableado para cuando se prenda la confirmación: `registrarComprador` manda
> `emailRedirectTo=/auth/callback?next=…` (antes aterrizaba en `/` con un
> `?code=` que nadie canjeaba) y `/auth/callback` acepta `token_hash` (verifica
> en servidor: registro en el webview de WhatsApp, confirmación desde Gmail).
> `/entrar` respeta `?next=`; `RegistroComprador` gana `nombreInicial`/`next`/
> `onCreada` (aditivo). **Evidencia:** harness `cotizacion_reclamada.sql`
> **24/24** (rollback) y la suite completa **24/24** con `pnpm hard-test`;
> `tsc`, eslint, 174 unit y `next build` limpios; flujo REAL en navegador
> contra la BD viva con cliente+cotización efímeros en Wanderlust y cuenta
> efímera: alta desde la cotización con el nombre prellenado → toast
> "Cotización guardada en tus viajes" → `bookings`/`customers` ligados al perfil
> nuevo (`email_verificado=false`, como debe) → con sesión el CTA cambia a
> "Guardar en Mis viajes" → `/mis-compras` la pinta como "Cotización" con el
> aviso "lo lleva tu agencia" y SIN botones de pagar/eliminar → el detalle
> muestra "Los pagos van con tu agencia" y el contacto. Limpieza verificada:
> 0 bookings, 0 customers, 0 auth.users, 0 profiles, 0 suppliers `QA b091`.
> **Pendiente del fundador (dashboard de Auth, no código):** prender
> *Confirm email* y apuntar la plantilla "Confirm signup" a
> `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=signup` para que la
> puerta por correo deje de estar inerte y la confirmación funcione entre
> navegadores; hasta entonces solo liga el token. Techos anotados en el ADR:
> barrido perezoso (al abrir `/mis-compras`), fila duplicada por agencia
> queda sin ligar, cuentas auto-confirmadas nunca ligan por correo.

> **Re-auditoría del fix de seguridad: b088 dejó dos ramas abiertas (2026-09-02).**
> Con #102 ya en `main` y desplegado, se volvió a barrer producción para
> confirmar el cierre. Lo confirmado, medido: las cabeceras están vivas
> (`content-security-policy: frame-ancestors 'none'`, `x-frame-options`,
> `nosniff`, `referrer-policy`, `permissions-policy`, sin `x-powered-by`); el
> comprobante SPEI que antes bajaba sin sesión da **400**; el bucket privado no
> se lista ni con la publishable key; `/api/track` corta en **60 y responde 429**;
> las 7 rutas de `/api/` niegan sin credencial (`comprobante` 404, `clawbot/tick`
> 401, `mp/webhook` **401 — el `MP_WEBHOOK_SECRET` sí está puesto en Vercel**,
> `track/login` 401); ningún secreto en el bundle (1.03 MB de chunks de 6
> páginas, solo la `sb_publishable_`); `superficie_anonima.mjs` 33/0; los 23
> harness en verde.
>
> **Lo que salió: el `case` de b088 scopeaba `services/` y `profiles/` pero no
> `suppliers/` ni `brand/`** — esas dos ramas pedían nada más "tener agencia".
> Medido en la BD real con un agente de Wanderlust (transacción revertida):
> sobrescribir `brand/logo-1784587723992.png` → **1 fila**; sobrescribir
> `suppliers/dd46052b…/foto-…jpg` de Border → **1 fila**. Las URLs no hay que
> adivinarlas: `get_brand_logo()` y `list_public_suppliers()` se las dan a
> cualquier anónimo, y las subidas del navegador van con `upsert: true`.
> Resultado: cualquier miembro de cualquier agencia cambiaba el logo de Ketzal y
> las fotos de la competencia.
>
> **b090** hace que la policy deje de inventar criterio y llame al que ya
> gobierna la fila (`suppliers_update`): `ketzal.puedo_escribir_imagen_supplier`
> —superadmin, admin de esa agencia, o admin de la agencia dueña del proveedor—
> y `brand/` solo superadmin. El guard toma `text` a propósito: una carpeta que
> no es uuid es entrada del atacante y un cast crudo revienta la policy en vez de
> negar. INSERT y UPDATE se re-aplican juntos porque `upsert` es UPDATE.
> → [ADR-0038](adr/0038-la-policy-de-storage-reusa-el-criterio-de-la-fila.md)
>
> El harness de storage pasa de 15 a **22 casos**, y esta vez se verificó que
> sirven: **prueba de mutación** — restaurada la policy de b088 dentro de una
> transacción revertida, los dos casos nuevos devuelven `HUECO: escribió`. Los
> casos que no encuentran fixture ahora escriben `ROTO`, no `SALTADO`.
>
> Pendientes que no son código: **activar la protección de contraseñas filtradas
> (HIBP) en el dashboard de Auth** —único WARN del advisor que no es de diseño— y
> la CSP completa con nonce, en Report-Only primero.

> **`/comisiones` rediseñada, y el hueco que el rediseño destapó (2026-09-02).**
> La página apilaba **ocho tarjetas del mismo peso** mezclando tres trabajos
> distintos —pagar el corte, configurar tarifas, dar de alta gente—, con el dato
> que más importa (a quién le debes hoy) en la posición 4 y el único KPI dentro
> de un `grid lg:grid-cols-4` con una sola tarjeta adentro, estirada al 25%.
> Ahora: fila de 3 KPIs (por pagar · ganado · referidos sin comisión, los tres
> derivados de datos que la página ya traía) y **cuatro pestañas por trabajo**
> (`Corte · Plataforma/Ganadas · Embajadores · Tarifas`) por `?tab=` con
> `<Link>` — server components, cero JS de cliente, URL compartible y el back del
> navegador funcionando. La primera pestaña del rol va sin query, así que
> `?corte=YYYY-MM-DD` sigue aterrizando en el corte sin tocar `corte.tsx`. Se
> deshizo una duplicación real: «Embajadores» y «Embajadores: cuánto paga tu
> agencia» eran dos tarjetas para lo mismo, separadas por otra en medio; ahora
> los referidos fallidos quedan debajo de la tarifa, donde el «configúrala
> arriba» de su propio aviso por fin es cierto.
>
> **Lo que salió al rediseñar: `list_ambassadors` negaba con `[]`.** La función
> abría con `if not is_superadmin() then return '[]'`, y los tres llamadores
> tratan la lista vacía como «no hay embajadores», no como «no tienes permiso».
> Consecuencia: un admin de agencia **no podía reemitirle la contraseña a sus
> propios embajadores** (contra m005) ni nombrarlos en `/gastos/nuevo` para
> registrar el pago de una comisión. Nunca produjo una queja porque los dos
> embajadores que existen son directos de Ketzal y ninguna agencia había
> reclutado a nadie. Arreglo **b089 (ADR-0037)**: acota por tenencia como
> `corte_embajadores` — superadmin ve todo; el admin ve **los suyos** más los
> que **ya le vendieron** (venta `reserved`/`confirmed`/`paid`; un `draft` con
> `?ref` no cuenta); el resto sigue recibiendo `[]`. La fila devuelve
> `supplier_id` para que la UI separe «a quién administro» de «a quién le debo»:
> el guard de `regenerarAccesoEmbajador` exige agencia propia, así que ofrecer
> el botón a un ajeno sería ofrecer un error.
>
> **Verificado en vivo**, no compilado: harness nuevo
> `list_ambassadors_alcance.sql` (11/11, con el caso 2 fallando contra la
> versión vieja) y **suite completa en 23/23**; y en navegador con dos cuentas
> efímeras (ADR-0023, destruidas y verificadas en 0) un admin de Border ve a su
> embajador en «Accesos» y lo encuentra en el selector de `/gastos/nuevo`.
> El corredor gana `-v`: en verde el conteo del harness («11 pasaron, 0
> fallaron») no se veía por ningún lado y un ✔ no distingue 11 casos de 1.

> **Barrido de seguridad sobre producción y lo que encontró (2026-09-02).**
> Se auditó `https://ketzal-os.vercel.app` de punta a punta: bundles, consola,
> superficie anónima de PostgREST, RPCs, endpoints, cabeceras y Storage.
>
> **El hallazgo caro: los comprobantes de transferencia SPEI estaban públicos.**
> El bucket `ketzal-assets` es `public = true` y listable, así que con la
> publishable key (que va en el bundle por diseño) se enumeraba `spei/`, sus 8
> carpetas de pedido y sus 13 archivos; el GET público devolvía **200, 137237
> bytes**: la foto de la transferencia de un cliente real, con nombre del
> titular, banco y monto. El código apostaba a que el path aleatorio no era
> adivinable — cierto e irrelevante, porque se lista. Segundo hueco del mismo
> bucket: `ketzal_assets_auth_update` era `USING (bucket_id = 'ketzal-assets')`,
> así que **cualquier autenticado** (el registro del marketplace es abierto)
> podía sobreescribir el comprobante de una venta ajena, el logo o el catálogo.
> Tercero: `next_doc_folio`/`next_receipt_folio` eran DEFINER sin un solo guard
> y con `p_supplier` libre, y los `supplier_id` son públicos vía `services`.
>
> **Arreglo (b088, ADR-0036):** bucket `ketzal-privado` (`public = false`, sin
> policy de SELECT) para los documentos con datos de una persona; los 13
> comprobantes y `presentacion-cierre.pdf` movidos ahí; lectura por
> `/api/comprobante?intent=`, que firma 60s tras revalidar con la RLS de
> `payment_intents` (404 si no te toca, sin confirmar que exista); policies de
> storage scopeadas por carpeta y por dueño; guard `puede_folear` **dentro** de
> los dos RPC de folio (revocar el EXECUTE habría roto `emit_receipt`,
> `emit_voucher` y `create_booking_with_items`, que son INVOKER). De paso:
> cabeceras de seguridad + `poweredByHeader: false`, `search_path` fijo en
> `my_supplier_id()`, `EXECUTE` de `refund_payment`/`ensure_statement_token`
> revocado a `anon`, y tope por IP en `/api/track` (60/min: medido 60×204 + 5×429).
>
> **Dos bugs del propio fix los cazó el harness nuevo antes de mergear**, los dos
> de familia conocida: dentro del `exists` sobre `ketzal.services`, un `name`
> pelón resolvía a `services.name` en vez de `objects.name` (el agente dueño no
> podía subir su foto), y `puede_folear` devolvía **NULL** en vez de false, con
> lo que `if not NULL then raise` no entra y el folio se consumía igual — el
> guard sin `coalesce(…, false)` de ADR-0004, por tercera vez.
>
> **Trampa nueva del CDN:** tras mover los objetos, el GET público seguía
> devolviendo 200 durante una hora (`cf-cache-status: HIT`, `max-age=3600`); con
> cache-buster ya daba 400. Un hard-test de storage sin cache-buster miente en
> verde.
>
> **Suite: 22/22** (`superficie_storage.sql`, 15 casos, entra a la lista del
> corredor). Y `superficie_anonima.mjs`, que existía desde antes, **no miraba
> Storage y además salía con código 0 aunque encontrara algo** — por eso este
> hueco no lo encontró un harness sino una auditoría a mano. Ahora mira el
> bucket y sale en rojo (33 pruebas, 0 expuestas).
>
> **Verificado limpio en el mismo barrido:** cero secretos en los bundles (la
> única key del cliente es la publishable), sin source maps, consola del
> navegador vacía, RLS activa en las 47 tablas, anon sin acceso a ninguna tabla
> de dinero ni PII, cron y webhook de MP exigiendo su secreto (401 en vivo), y
> todos los RPC DEFINER que mueven dinero con guard.

> **La suite completa en verde: 21/21, y el segundo escape a producción del día
> (2026-09-01).** Se repararon los cinco harness podridos que el corredor
> (ADR-0034) había destapado. Empezamos el día en 9 pasan · 2 fallan · 10 no
> corren.
>
> **Segundo escape, y la lección que faltaba.** Al portar
> `hard_testing_dinero.sql` se descubrió por qué "termina en `raise` ⇒ revierte"
> no bastaba: el archivo traía un `exception when others` que **se tragaba el
> error**. El bloque `do $$` terminaba normalmente, así que Postgres **commiteó**
> — y dejó 2 agencias, 2 cuentas, 6 ventas, 6 clientes y 5 pagos en producción.
> Se limpiaron por id con los guards append-only apagados y reencendidos dentro
> de una transacción, verificando contra la línea base.
>
> **Arreglo estructural: el rollback lo pone el corredor, no el harness.** Ahora
> `correr.mjs` abre `begin` antes de cada `.sql` y hace `rollback` en un
> `finally`, pase lo que pase adentro. Probado con un harness hostil a propósito
> (escribe y se traga su error): **0 filas escaparon**. El guard de `commit`
> (ADR-0035) se queda como declaración de intención; el que de verdad protege es
> este.
>
> **Los cinco reparados:**
> - `hard_testing_dinero.sql` y `volumen_y_clawbot.sql` — siembran sus propias
>   agencias e identidades en vez de exigir `qa_setup.sql`, y revierten. El de
>   Clawbot además pasó de imprimir tablas para que un humano las leyera, a
>   **exigir que las CUATRO reglas disparen** (28 recordatorios en la corrida):
>   una regla muerta era justo lo que nadie iba a notar.
> - `concurrencia.mjs` (ADR-0008, cupos) — traía la contraseña QA borrada
>   hardcodeada. Ahora levanta agencia, servicio con cupo y admin efímeros. Las 3
>   carreras vuelven a pasar tras meses sin correr.
> - `carreras_dinero.mjs` (ADR-0006, ledger) — dependía de una sesión de
>   `ketzal-mcp` y de fixtures sembradas a mano por `execute_sql`. **Su bloque de
>   limpieza, afortunadamente en comentario, era un `delete from ketzal.bookings`
>   SIN WHERE**: habría vaciado la base entera.
> - `comisiones_motor.sql` — reescrito como matriz (entrada anterior).
>
> **Dos guards nuevos contra el verde vacío**, porque los dos casos aparecieron
> de verdad: el primer cierre de `hard_testing_dinero` reportó *"0 pasaron, 0
> fallaron"* y el corredor lo dio por **verde** (el filtro usaba
> `clock_timestamp()`, que cae después del `now()` con que se sellan las filas).
> Ahora un harness que no registra ni un caso **falla**, y lo mismo en
> `concurrencia.mjs` si no corre ninguna carrera.
>
> Y en `_fixtures.mjs`: `crearEscenario`/`borrarEscenario` para los harness que
> corren por HTTP —lo que escribe PostgREST queda commiteado y hay que borrarlo a
> mano, con los guards append-only apagados dentro de la transacción— más un
> barrido tolerante: un resto que no se deja borrar ya no revienta la corrida
> entera antes de empezar.
>
> Producción verificada tras la corrida completa: 2 suppliers, 7 ventas, 2 pagos,
> 6 clientes, 7 cuentas, 2 recibos, 4 asientos, las 2 tarifas de embajador en
> pie, **0 residuo QA y 0 triggers apagados**.

> **La MATRIZ del motor de comisiones: 14 casos que cruzan los 4 payee_type
> (2026-09-01).** Pregunta del fundador: *"¿tenemos todos los perfiles para
> probar abonos y comisiones, todos los ángulos?"*. Al medirlo, la respuesta era
> incómoda: **la simulación de 1000 operaciones solo genera comisión de
> `agencia`** — cero menciones de embajador o agente en sus 243 líneas. Y la
> comisión por **`agente`** ($300/pax híbrido, con dos reglas activas en
> producción) **no la verificaba nadie**: aparecía en harness de RLS y de altas,
> pero ninguno comprobaba que devengara ni que se pagara bien.
>
> El único que cruzaba varios payee_type era `comisiones_motor.sql` — y estaba
> podrido. Se reescribió entero, porque estaba escrito contra un modelo que ya
> no existe: insertaba en `marketplace_customers` (tabla eliminada en b025),
> trataba al embajador como fila de `suppliers`, tomaba al comprador con
> `select id from auth.users limit 1` (¡una cuenta REAL al azar!), y esperaba que
> `set_booking_ambassador` lanzara excepción por tarifa inválida — **cosa que
> b079 dejó de hacer** cuando movió esa lógica al trigger, que ahora registra el
> motivo en `referral_misses` en vez de abortar. Probaba un contrato muerto.
> También creía que la comisión de plataforma la dispara la venta "libre"
> (`selling_supplier_id is null`); hoy la dispara `channel='portal'`.
>
> **La matriz nueva (14/14)** cruza canal × quién trae la venta × cómo paga ×
> cómo termina, verificando contra el contrato leído del trigger vivo:
> venta directa (no devenga nada) · reventa (cobra el revendedor con la tarifa
> de la dueña) · portal (corte de Ketzal por el global de `app_settings`) ·
> venta manual (no paga corte) · agente · embajador · **los tres juntos en una
> venta del portal, que es el caso que ningún harness veía** · las tres razones
> por las que el embajador NO cobra (sin tarifa, no cabe en la venta,
> auto-referido) · abono parcial que no mueve el devengo · el corte incluyéndola ·
> cancelación que la reversa a neto 0 · e inmutabilidad del asiento.
>
> Detalles que solo salen corriéndolo: `payment_type` es `payment|refund`, no
> `abono`; `corte_embajadores` exige claims de admin y devuelve un **objeto** con
> llave `filas`, no un arreglo.
>
> Estado de la suite: **17 pasan · 2 fallan · 2 no corren**. Producción
> verificada intacta tras la corrida: 2 suppliers, 0 fixtures QA, las 2 tarifas
> de embajador en pie, 7 ventas, 4 asientos, 0 `referral_misses`.

> **INCIDENTE: la suite de hard-tests borró datos de producción (ADR-0035,
> 2026-09-01).** Al encender el lado SQL de `pnpm hard-test`,
> `embajadores_rls.sql` se llevó las **dos tarifas reales de embajador** del
> fundador — $250/pax de Wanderlust y de Border. Se restauraron al detectarlo;
> nada más se perdió (encuestas, votos, ventas, asientos y pagos intactos,
> verificado fila por fila).
>
> **Cómo lo logró**, tres decisiones que solas son recuperables y juntas no:
> 1. Hardcodeaba los ids **reales** de Wanderlust y Border y les insertaba
>    tarifas de prueba.
> 2. Limpiaba **por predicado** (`delete … where payee_type='embajador' and
>    scope_supplier_id in (v_wl,v_bo)`), que no distingue lo que el harness creó
>    de lo que ya estaba.
> 3. Terminaba en **`commit`**.
>
> Y la corrida se reportó **verde**, por un cuarto motivo que era del corredor:
> ese harness declara sus fallas como `'ROTO: …'`, `'HUECO: …'`, `'SUCIO: …'`,
> `'INVALIDO: …'` y el detector solo miraba `'FALLA:'`.
>
> **La lección incómoda**: después de la corrida verifiqué "sin residuo" y todo
> cuadró — 7 perfiles, 7 cuentas, 14 servicios. Conté lo que había **de más** y
> nunca lo que **faltaba**. Una comprobación de limpieza detecta lo que un test
> agregó, jamás lo que borró. El daño salió a la luz de casualidad, tres pasos
> después, al notar que `commission_rules` no tenía ni una fila de embajador
> cuando la UI había mostrado $250/pax esa misma tarde.
>
> **Arreglo (ADR-0035): un hard-test `.sql` termina en `rollback`, nunca en
> `commit`,** y lo hace cumplir el corredor — se **niega a ejecutar** cualquier
> `.sql` con una sentencia `commit` y lo reporta como `NO CORRIÓ`. Con rollback
> la limpieza deja de existir como problema: no hay nada que borrar, así que no
> hay predicado que pueda equivocarse de fila. `embajadores_rls` además levanta
> ahora **sus propias tres agencias** QA, una de ellas **sin tarifa a propósito**
> — su caso 9 tomaba "cualquier otra agencia del catálogo" y daba un hueco falso
> en cuanto esa otra sí tenía tarifa, la misma enfermedad que clavar cifras del
> catálogo. Queda en 14/14 y sin tocar un solo dato real.
>
> El vocabulario de fracaso pasó a ser una lista (`VEREDICTO_MALO`): `FALLA`,
> `ROTO`, `HUECO`, `SUCIO`, `INVALIDO`. Este último cuenta como fracaso a
> propósito — significa que el caso no llegó a probar el guard, y un guard sin
> probar no es un guard verificado.

> **Los 10 harness del dinero por fin corren: 9 → 16 en verde (2026-09-01).** El
> fundador pegó `DATABASE_URL` (session pooler) en su `.env.local` y el lado SQL
> del corredor se encendió. La corrida destapó tres cosas que llevaban meses
> invisibles y dos bugs del corredor recién nacido.
>
> **Podredumbre real encontrada** (además de las dos del PR #96):
> - `comisiones_motor.sql` (ADR-0019) consulta `ketzal.marketplace_customers`,
>   **tabla eliminada** en el refactor de identidad (b025, F1). Lleva rota desde
>   entonces sin que nadie lo supiera.
> - `hard_testing_dinero.sql` y `volumen_y_clawbot.sql` dependen de
>   `qa_setup.sql` **y no revierten**. Correrlos hoy sembraría agencias QA en
>   producción — justo lo que ADR-0023 vino a terminar. Se les puso el requisito
>   `qa-setup`, que **nunca** está disponible a propósito: salen como `NO CORRIÓ`
>   con ese motivo en vez de ensuciar la BD real. Se detectó **antes** de
>   correrlos, revisando si escribían y si revertían.
>
> **Dos bugs del corredor, ambos por reusar una sola conexión:**
> 1. Un harness que aborta su transacción (un `raise` dentro de `begin;` sin
>    `rollback`) **envenena la sesión**: los seis siguientes murieron con
>    *"current transaction is aborted"*. Seis falsos rojos por culpa del primero.
> 2. Dos harness crean `temp table qa` ⇒ el segundo moría con *"relation qa
>    already exists"*. Y peor que las temp: un `set role authenticated` colgado
>    de un harness que falló a media haría que el siguiente corriera
>    **suplantando a alguien**. Ahora antes de cada uno van `rollback` y
>    `discard all`.
>
> **Contrato ampliado, porque la realidad tenía tres formas, no dos:** apareció
> el **estilo veredicto** (`begin; … commit;` devolviendo filas `'OK: …'` /
> `'FALLA: …'` para que un humano las lea). Esos no lanzan nada al fallar, así
> que el corredor los daba en **verde con casos rotos adentro**; ahora lee las
> filas. Y el "cero" del estilo rollback no es uno solo: `simulacion_1000_ops`
> dice `VIOLACIONES (0)` en vez de `0 fallaron`, y se habría reportado fallado.
> Los patrones viven juntos en `EXITO_EN_EXCEPCION`; uno nuevo que no case sale
> en rojo, que es el default correcto.
>
> El detector de `FALLA:` se probó contra formas de resultado reales (fila
> buena, fila mala, multi-statement) antes de confiar en él — un detector que no
> detecta es un verde falso con más pasos.
>
> **Estado: 16 pasaron · 3 fallaron · 2 no corrieron.** Producción verificada sin
> residuo tras la corrida completa: 7 perfiles, 7 cuentas, 2 suppliers, 14
> servicios, 7 bookings, 4 asientos, 2 comisiones — idéntico a antes.

> **`pnpm hard-test`: los invariantes dejan de vivir solo en prosa (ADR-0034,
> 2026-09-01).** Salió de una pregunta del fundador — *"¿cómo arreglamos lo de
> los ADRs que no concuerdan?"* — después de que construyéramos sobre una
> garantía falsa: ADR-0022 afirma que el auto-referido está bloqueado, y el guard
> vivo solo miraba `sold_by`, que en el portal **siempre es null**.
>
> **Lo medido antes de tocar nada:** CI corría `tsc` + `pnpm test` (vitest sobre
> funciones puras) + `build`, y **cero** de los 22 hard-tests. Todo
> `supabase/tests/` se corría de memoria. **9 de 33 ADRs** nombraban un harness;
> la sección "Verificación" de la plantilla acepta prosa, así que *"probado
> contra la BD real"* contaba como verificación y no ejecutaba nada.
>
> El diagnóstico que importa: **el problema no es que los ADRs se desfasen** —
> siempre van a poder, son registro de decisión, no especificación. Auditarlos
> arregla hoy y en tres meses estamos igual. Lo que se arregla es volver
> **ejecutables** los invariantes, para que el desfase truene solo.
>
> `supabase/tests/correr.mjs` corre los 21 harness con un comando y declara, por
> harness, qué necesita (`supabase` / `app` / `build` / `db`), qué ADR defiende y
> qué afirma. **Su regla dura: `NO CORRIÓ` es rojo**, y es un estado distinto de
> `FALLÓ` — si un problema de conexión se reporta como fallo, mañana alguien
> "arregla" el harness en vez de arreglar la conexión. Un archivo suelto en la
> carpeta que nadie declaró sale como `NO CORRIÓ — sin declarar`, para que no se
> vuelva invisible.
>
> **La primera corrida es el hallazgo: 9 pasaron · 2 fallaron · 10 no corrieron.**
> - `concurrencia.mjs` (ADR-0008, cupos) trae **hardcodeada** la contraseña
>   `'QA-hard-testing-2026'` de unas cuentas borradas en agosto. Muerto desde
>   entonces, en silencio — la cuarta vez que pasa exactamente esto (ADR-0023).
> - `carreras_dinero.mjs` (ADR-0006, ledger) depende de una sesión de
>   `ketzal-mcp` y de fixtures sembradas a mano.
> - Los 10 `.sql` no pueden correr: **no hay `DATABASE_URL`** y `psql` no está
>   instalado. Son justo los que verifican el dinero (ADR-0005 dinero derivado,
>   ADR-0006 append-only, ADR-0019 motor de comisiones). Se agregó `pg` como
>   devDependency; falta que el fundador pegue la cadena de conexión en
>   `.env.local` — es una credencial, no la mete un agente por shell.
>
> Antes de esto, ese mismo estado se veía como "no hay nada que reportar".
>
> **Lo que NO se hizo, a propósito:** meter los hard-tests en CI. Necesita
> `SUPABASE_SERVICE_ROLE_KEY` —la llave que salta toda la RLS— como secreto de
> Actions, donde cualquiera con permiso de escritura la exfiltra desde un
> workflow en un PR; y sin staging correrían contra producción. Queda para
> cuando haya proyecto de pruebas, o como `workflow_dispatch`. Tampoco se
> rescataron los 2 harness podridos: valen y hay que portarlos a fixtures
> efímeras, pero es trabajo aparte. Lo que este carril garantiza es que **ya se
> ven**.
>
> De paso se corrigió el `CLAUDE.md`, que decía "92 tests de dominio" (son 174) y
> daba a entender que los hard-tests estaban en CI.

> **Fase 6: el cliente se vuelve embajador sin perder sus compras (b087,
> ADR-0033, 2026-09-01).** A quien ya te compró es a quien le pides que te
> recomiende, y ese camino no existía: `crearEmbajador` llamaba a
> `admin.createUser` de una y cualquier correo con cuenta moría en *"¿correo ya
> registrado?"*. Se buscaba una cuenta nueva donde ya había una persona.
>
> Ahora la acción busca primero por `profiles.email`: si es viajero, **convierte
> esa misma cuenta con un `update`** y devuelve `credentials: null` — entra con
> su contraseña de siempre, no se le emite provisional ni se le marca
> `must_change_password` (ADR-0028). Al agente y al proveedor los rechaza con su
> motivo: convertirlos les quitaría el back-office o los desconectaría de sus
> servicios.
>
> **Lo que NO se construyó, porque ya funcionaba y nadie lo había mirado:** el
> convertido nunca perdió sus compras. Los RPC del viajero
> (`list_my_marketplace_orders`, `list_my_credits`, `get_my_trip`,
> `emit_my_voucher`) filtran por `auth.uid()` y **ninguno mira `profiles.type`**;
> `(travel)/layout.tsx` tampoco tiene gate de persona. El plan decía "hoy los
> gates de persona lo dejarían fuera" — era falso, y verificarlo antes de
> escribir borró la mitad de la fase.
>
> Lo que sí faltaba era **navegación**: `/` manda a cada quien a su portal, así
> que el convertido aterriza siempre en `/embajador`, y ni ese portal ni el shell
> del viajero tenían enlace al otro. Sus compras existían y no había cómo
> llegar. Se agregó la salida en ambos sentidos; la de "Mis compras" solo se
> pinta si de verdad compró algo (una pestaña vacía enseña a ignorarla).
>
> **Probado contra lo real, no compilado:**
> - `supabase/tests/conversion_viajero_embajador.sql` — **6/6**, dentro de un
>   `DO` que termina en `raise exception` para que Postgres revierta todo. Cubre
>   que el convertido no pierde compras, créditos, viaje ni voucher, y que
>   comprarse a sí mismo con su propio código sigue rechazándose (ADR-0029).
> - `supabase/tests/conversion_portales.mjs` — **9/9** contra la app compilada y
>   servida: `/mis-compras` responde 200 con `type='embajador'`, cada portal
>   trae el enlace al otro, el embajador sin compras NO lo trae, y un viajero de
>   verdad sigue rebotando de `/embajador`.
> - `supabase/tests/conversion_alta.mjs` — **10/10** ejerciendo la server action
>   real por HTTP (`Next-Action`), no una copia de su lógica. El id de la acción
>   se **busca** en el manifiesto del build mandando un payload vacío que el
>   primer guard rechaza, para que el harness no muera cuando cambie el hash.
> - Fixtures efímeras (ADR-0023) y limpieza **verificada**: 7 perfiles / 7
>   cuentas antes y después, 0 restos.
>
> Dos tropiezos que dejaron lección. El primero: el harness SQL "falló" tres
> veces seguidas y el bug era **mío** — asertaba sobre `e->>'id'` cuando
> `list_my_marketplace_orders` devuelve `booking_id`. Una aserción mal escrita se
> ve idéntica a un bug del producto. El segundo: la prueba por navegador no
> convirtió nada y no daba error, porque el **tour de onboarding** se auto-abre
> en una cuenta recién creada y tapaba el formulario; encima `/comisiones` es tan
> pesada que los screenshots se colgaban a los 30s. Se cambió a llamar la acción
> por HTTP, que además quedó como harness repetible.

> **Fase 5: el corte quincenal — ya se le puede pagar al embajador (b086,
> ADR-0032, 2026-09-01).** El motor ya devengaba bien (ADR-0029) y había un solo
> riel de pago (ADR-0030), pero faltaba el proceso: nadie sabía a quién le debía
> cuánto, ni había forma de registrar el pago de una persona desde la app
> (`create_expense` solo sabe pagarle a un PROVEEDOR).
>
> **El corte no es una tabla, es una resta a una fecha**: devengado hasta el día
> X menos pagado hasta el día X. Y por eso es **acumulativo y auto-corregible**:
> si te saltas una quincena, la siguiente trae lo pendiente sin que nadie tenga
> que acordarse, y no hay un "periodo" que pueda quedar mal cerrado o cerrado dos
> veces. La fecha es solo un corte de lectura.
>
> **Solo se paga lo cobrado**, y ahí se cierra el hueco que ADR-0029 dejó
> abierto: `refund_payment` no reversa la comisión, así que una venta devuelta
> completa que nadie canceló sigue devengada. El corte filtra por
> `bookings_with_balance.paid > 0` —que ya descuenta reembolsos—: si la agencia
> no tiene el dinero, no hay de dónde pagar. En el harness: tres ventas devengan
> $900, una sin cobrar y otra reembolsada completa, y el corte paga **$300**.
>
> Agrupa por **(embajador, agencia)** porque paga la agencia dueña del viaje
> (ADR-0021); el bono por reclutar va en su fila aparte, sin agencia, porque lo
> paga Ketzal. El **guard del monto vive en la BD**, contra el mismo corte que se
> pinta en pantalla: pagar de más dejaría el saldo en negativo sin que nadie se
> entere hasta que el embajador reclame.
>
> **El embajador ya ve sus pagos con fecha** (`my_ambassador_payments`). Un
> "pagado: $X" agregado no se puede conciliar con el banco, y la primera duda
> —"¿me pagaste la quincena pasada?"— acababa en un WhatsApp al fundador.
>
> **Límite documentado**: el bono queda FUERA del ledger. El ledger espeja hechos
> (ADR-0011) y el bono es una derivación, no una fila: no hay devengo que
> espejar, así que tampoco su pago. Es el precio de haberlo derivado, que se
> eligió por razones más fuertes; queda escrito para que nadie lo lea como un
> faltante en `/cuentas`.
>
> **Probado:** `supabase/tests/corte_embajadores.sql` 8/8 dentro de una
> transacción que revierte — filtro de dinero cobrado, corte a fecha anterior,
> pagar de más rechazado, pagar dos veces rechazado, el ledger global en 0 tras
> el pago, un viajero no ve el corte y un admin ajeno no registra el pago.
> 174 tests de dominio (5 nuevos: `finDelCorte`, incluidos bisiesto y diciembre).
>
> **Lo que NO se pudo probar en el navegador y por qué**: el botón "Pagar" usa
> `window.confirm`, y un diálogo nativo **congela la automatización del
> navegador** (bloquea todos los eventos de la extensión). Neutralizarlo desde la
> consola lo bloqueó el clasificador de permisos y no se buscó rodeo. El camino
> completo sí quedó probado por SQL con impersonación real; lo único sin ejercitar
> es el `onClick` en sí.
>
> **Dos limpiezas quirúrgicas más**, por la misma causa de la fase anterior:
> escenarios creados por HTTP en vez de dentro de una transacción. Se borraron
> por id bajando los candados append-only dentro de UNA transacción. Verificado
> después: 7 bookings, 2 líneas, ledger en 0, 0 cuentas efímeras.

> **Fase 4: bono por invitar + PWA instalable (b085, 2026-09-01).**
>
> **El bono NO es una fila de dinero.** ADR-0005 dice que el dinero se deriva, y
> lo que faltaba aquí no era una tabla sino el VÍNCULO: `profiles.recruited_by`.
> $300 una vez por recluta, cuando ese recluta logra su primera venta con
> comisión neta > 0 sobre un booking confirmed/paid. **No es multinivel** — quien
> invita no gana nada de las ventas de su invitado, y eso no es copy: es lo que
> separa un bono de referido de un esquema piramidal.
>
> Las tres alternativas se descartaron con razones verificadas contra la BD viva.
> La peor era la más tentadora: una fila en `commission_lines` con
> `payee_type='bono'` habría **reventado `tg_ledger_mirror_commission`** (su CASE
> tiene 4 ramas y el propio código avisa que un tipo nuevo deja `v_payee` null) y,
> peor, su contraparte es SIEMPRE `selling_supplier_id` ⇒ **la agencia dueña del
> viaje acabaría pagando el reclutamiento de Ketzal**, contra la decisión del
> fundador de que lo paga la plataforma.
>
> **Anti-colusión en el WHERE**, ajustable sin migrar datos: el comprador no
> puede ser el recluta ni el reclutador, y la venta tiene que valer al menos
> $1,000 para que una compra simbólica no dispare el bono. Y reversibilidad
> gratis: si la venta gatillo se cancela, b073 mete el reverso, el neto cae a 0 y
> **el bono desaparece solo**.
>
> **Sin tabla de candidatos ni auto-servicio**: el embajador manda un mensaje por
> WhatsApp y quien administra da de alta al invitado eligiendo "¿quién lo
> invitó?". Menos piezas, y nadie queda en un limbo de "solicitud pendiente" que
> nadie revisa. El resumen del admin usa la MISMA función que el portal —si
> divergen, uno miente y la discusión la pierde quien no tiene el panel— y lista
> también a quien solo ha ganado bonos, para que ese saldo no sea invisible.
>
> **PWA instalable.** Tres cosas que no eran obvias: **iOS no soporta
> `beforeinstallprompt`** (en iPhone solo se puede instruir "Compartir → Añadir a
> inicio", y el equipo vende desde iPhone, así que ese camino es la mitad de los
> casos, no el extra); si ya está instalada no hay nada que ofrecer
> (`display-mode: standalone` + `navigator.standalone`); y **no se muestra en cada
> visita** — el "ahora no" se recuerda 14 días, porque un modal que reaparece
> siempre es la forma más rápida de que lo cierren sin leer.
>
> **Probado:** 7/7 con rollback sobre el bono, incluidos los TRES casos de
> colusión (comprador = recluta, comprador = padrino, venta bajo el umbral) y que
> una segunda venta del mismo recluta no paga otro bono. En el navegador con
> padrino + recluta + comprador efímeros: "Ganado $300.00" con el desglose
> "$0.00 de ventas + $300.00 de bonos", la tarjeta diciendo "Ya invitaste a 1
> persona y llevas $300.00 en bonos", el prompt de instalar, y el "ahora no"
> respetado tras recargar.
>
> **Error propio anotado:** esta prueba se hizo por HTTP y no dentro de una
> transacción, así que dejó rastro que las FK volvían imborrable (venta
> confirmada ⇒ comisiones ⇒ ledger). Se limpió quirúrgicamente por id, bajando
> los candados append-only dentro de UNA transacción y reponiéndolos ahí mismo.
> El harness bueno es el de Fase 0: correr dentro de una transacción que revierte.

> **Fase 3: activación — clics, checklist y confeti (b084, 2026-09-01).**
>
> **Conteo de clics.** El sustrato ya existía (`funnel_events` + `/api/track`,
> m011); se agregó el evento `link_click` y el RPC `my_link_clicks`, porque la
> tabla es deny-all y nadie la lee por REST. Devuelve **solo conteos**: cuántas
> personas, nunca quiénes — un embajador viendo "Juan abrió tu link 3 veces" es
> vigilancia y no le sirve para vender. Y se emite **en el cliente** a propósito:
> medido en el servidor contaría el prefetch de los `<Link>` de Next y el crawler
> que arma la vista previa de WhatsApp, y el embajador vería clics que nadie dio.
>
> **Checklist derivado.** Cuatro pasos (código, foto, primer clic, primera
> venta), cada uno calculado de un dato real. Nada de palomitas que el embajador
> marque solo: un checklist que se completa sin hacer nada mide obediencia, no
> activación, y miente en el primer corte cuando el que "completó todo" no ha
> traído una venta. Se esconde solo al terminarse.
>
> **Confeti en la PRIMERA COMISIÓN**, no al abrir el tour: celebrar que alguien
> instaló algo no premia nada. Sin dependencia nueva — divs con dos animaciones
> CSS; una librería de confeti son ~15 KB para doce segundos de alegría al año.
>
> **Tres cosas que cazaron las pruebas, no el compilador.**
> 1. El allowlist de `/api/track` y el CHECK de `funnel_events` son **dos
>    candados**: agregué el evento al handler y la BD lo rechazaba con 23514.
> 2. `useSearchParams()` en `Trackers` —que vive en el layout raíz— **rompió el
>    build**: obliga a toda la app a render dinámico y truena las páginas
>    estáticas ("should be wrapped in a suspense boundary"). Habría llegado a
>    producción. Se lee el `?ref` de `window.location` dentro del efecto, que es
>    donde de verdad se necesita.
> 3. **Un número deshonesto**: el total sumaba los conteos por servicio, así que
>    una sola persona mirando la vitrina y dos tours salía como "3 personas". Lo
>    vi en pantalla diciendo "2 personas" cuando el único visitante era yo.
>    Corregido a sesiones distintas (b084c) — un panel que infla números pierde
>    la confianza del embajador la primera vez que él sabe cuánta gente le
>    compartió.
>
> Verificado en el navegador de punta a punta: aterrizar con `?ref` registra el
> clic, navegar a un tour registra el suyo, el checklist pasa a "2 de 4" con
> "Alguien abrió tu link" palomeado, y la fila del tour dice "1 persona lo
> abrió". 169 tests de dominio (11 nuevos) · build · limpieza verificada.

> **Fase 2: el portal del embajador deja de ser una lista de números
> (b083, 2026-09-01).** Reorden completo de `/embajador` con lo que el fundador
> pidió, sobre los cimientos de las fases 0 y 1.
>
> **Tarjeta arriba de todo**: foto, nombre, nivel con barra de avance y los KPIs
> en **cuadrícula 2×2** (no 1×4: cuatro columnas dejan los números ilegibles en
> un teléfono). El embajador entra a ver cuánto lleva ganado, no a leer
> instrucciones — así que las instrucciones se fueron al final y son
> **colapsables** (`<details>` nativo, cero JS), abiertas por defecto solo para
> quien todavía no vende.
>
> **NIVELES DERIVADOS, no XP.** `nivelDe()` se calcula de lo devengado; no hay
> contador que subir. Un XP mutable premia actividad que no produce ingreso: el
> embajador sube de nivel sin haber traído un peso, y el día que lo nota deja de
> creer también en el número de sus comisiones. Derivado significa además que si
> una venta se cancela y se reversa, **el nivel baja solo**.
> `profiles.axo_coins_earned` sigue muerta y NO se reusó: es exactamente la
> columna mutable que la regla de oro #2 prohíbe. 7 pruebas de dominio.
>
> **Subir foto: no existía ningún camino.** `register_traveler` trae
> `where profiles.type = 'viajero'` ⇒ para un embajador es un no-op silencioso, y
> encima nunca tocó `image`. **b083** agrega `update_my_profile` (nombre,
> teléfono, foto; solo la fila propia; nunca rol, tipo, agencia ni código), con
> el candado de que **la foto tiene que vivir en `ketzal-assets`** — si no,
> `image` es un campo libre apuntando a donde el usuario quiera y la app lo
> pinta. La subida va directo al bucket desde el navegador, como las imágenes de
> proveedores y servicios (el body de una función en Vercel tope en 4.5 MB).
> 5 aserciones con rollback, incluida que una foto externa se rechaza.
>
> **Marketplace interno**: cada viaje publicado con su botón de compartir y de
> copiar, y **el código del embajador ya puesto en el link**. El 80% ya existía
> —`?ref` se propaga por /explora → ficha → checkout, y cada servicio tiene su OG
> con foto real—; lo que faltaba era el botón. Antes solo tenía UN link a la
> vitrina entera: para compartir un viaje concreto había que navegar hasta él y
> editar la URL a mano.
>
> **Dos errores propios que vale anotar.** (1) Pisé `embajador.test.ts` con `cat >`
> y borré 98 líneas de pruebas de m010; lo cazó el contador bajando de 158 a 148
> cuando yo había AGREGADO 7. Restauradas: 165. (2) Cambié un `useEffect` por un
> `useState` perezoso para callar un lint, y con eso introduje un **hydration
> mismatch real** — el `href` del servidor (`origin` vacío) no coincidía con el
> del cliente. El lint era de rendimiento; el bug, de corrección. Se arregló
> resolviendo el origen **en el servidor** con los headers del request y pasándolo
> como prop: determinista en ambos lados y sin efecto.
>
> Verificado en el navegador con un embajador efímero: tarjeta, nivel, barra,
> 2×2, los 5 viajes publicados con sus links, instrucciones colapsables mostrando
> las tarifas de $250 que se sembraron en Fase 0 —la cadena completa llegando al
> embajador—, y la foto subida y guardada en el bucket. 165 tests · build ·
> limpieza verificada (7 usuarios, 0 efímeros).

> **Fase 1: la atribución del embajador se fugaba en el recorrido normal (b082,
> ADR-0031, 2026-09-01).** El `?ref` viajaba solo en la query string, hop a hop,
> y se respaldaba en `localStorage` recién al llegar a `/comprar` **con sesión**.
> Bastaba tocar el logo, el footer, «← Todos los viajes», la ficha de una agencia
> o «Entrar» —~10 `href` del funnel público no lo propagan— para perder la
> comisión. También se perdía al registrarse con confirmación de correo (el link
> del mail vuelve al Site URL sin la query, y en ese momento el respaldo aún no
> existía) y al volver al día siguiente. Los tres son el comportamiento normal de
> un comprador; el único carril que sobrevivía era tarjeta → ficha → CTA sin
> desviarse.
>
> Ahora el `?ref` se captura en el **primer aterrizaje**, en cookie, desde
> `proxy.ts`. Se escribe **solo si el request trae `?ref`**, así que ninguna
> respuesta cacheada de una URL limpia se lleva un `Set-Cookie` —el riesgo de
> caché quedó descartado por construcción—, se valida con el **mismo
> normalizador que usa la BD**, y `crearPedido` la lee y **la consume** al
> atribuir (sin eso, la compra del año que viene se le seguiría acreditando al
> mismo embajador). **Borra andamio en vez de agregarlo**: se fueron el respaldo
> `mkt_ref` en localStorage, el `refCode` que el form pasaba a la acción y la
> prop que la página pasaba al form.
>
> **Política: LAST-touch** (ADR-0031), distinta a propósito del first-touch de
> ADR-0025. Ese mide gasto en ads; esto decide **a quién le pagas**, y con
> first-touch el embajador cuyo link cerró la venta no cobraría porque el
> comprador vio otro hace tres semanas — un caso de soporte que no se le puede
> explicar a nadie que estés reclutando.
>
> **Probado en los dos extremos.** `atribucion_ref.mjs` (7/7) recorre la app como
> navegador siguiendo `Set-Cookie`, incluido el caso que se fugaba: aterrizar con
> `?ref` y navegar por tres links que no lo propagan. Y **compra real en el
> navegador** con un viajero efímero: el pedido quedó con `ambassador_id` = el
> embajador del link **sin que el `?ref` viajara en ninguna URL intermedia**, con
> 0 líneas de comisión por seguir en `draft` (ADR-0029) — y el pedido **se pudo
> borrar**, que era el bug imposible antes de b079. Limpieza verificada: 7
> usuarios, 0 efímeros, 0 pedidos con embajador.
>
> Trampa de operación anotada: `NEXT_PUBLIC_MARKETPLACE` no está en `.env.local`
> —vive solo en Vercel—, así que en local `/comprar` da 404 hasta que se levanta
> el dev con `NEXT_PUBLIC_MARKETPLACE=on`.

> **Un solo riel para pagarle a una persona (b081, 2026-09-01).** Había DOS
> formas de saldarle la comisión a un embajador y no se veían entre sí:
> registrar el gasto en `/gastos` (baja la CxP y el "pagado" del portal, pero
> deja su saldo VIVO en el ledger) o `settle_ledger` desde `/cuentas` (cierra el
> ledger, pero la CxP y el portal siguen mostrando saldo). Cualquiera de las dos
> deja una pantalla mintiendo, y un corte quincenal que lea una fuente mientras
> alguien liquidó por la otra **paga dos veces**.
>
> **No hizo falta decidir nada nuevo: ADR-0011 ya lo decía** — «el ledger ESPEJA,
> no recrea: triggers sobre los hechos generan los asientos. No se insertan
> asientos a mano que re-cuenten un hecho ya contado». `settle_ledger` sobre un
> embajador era exactamente eso, la excepción que rompía su propia regla. Ahora:
> el hecho es el gasto, `tg_ledger_mirror_expense` postea la liquidación solo
> (gemelo del espejo de comisiones), y `settle_ledger` rechaza 'embajador' y
> 'agente' con un mensaje que dice a dónde ir, igual que ya rechazaba 'viajero'.
> **`agencia` no entra**: su saldo en el ledger es el corte de plataforma
> (Ketzal↔agencia) y `mayorista` es pagarle a un proveedor — deudas distintas,
> sin choque.
>
> **Y salió un hermano del mismo bug:** `expenses` no tenía categoría para
> pagarle a un **agente**, pero desde m010 el portal de embajador también lo usan
> los agentes con código de referido, y su "pagado" salía solo de
> `category='embajador'`. A un agente pagado por `settle_ledger` su portal le
> decía **"pagado $0" para siempre**, aunque ya hubiera cobrado. Se abrió la
> categoría y los dos resúmenes la leen.
>
> Probado con rollback (6/6): la venta devenga $300 al embajador en el ledger,
> registrar el gasto lo deja en **0 solo**, el ledger global sigue en 0,
> `settle_ledger` rechaza embajador y agente, y la categoría 'agente' se acepta.
>
> De paso, la tarifa de embajador gana la cuarta forma que la BD ya soportaba:
> **híbrido** (% de la venta + fijo por pasajero a la vez), la misma que usan los
> agentes desde b054.

> **La tarifa de embajador no se podía guardar: m008 cambió el lector y olvidó el
> escritor (b080, 2026-09-01).** Al ir a capturar la tarifa —el paso que yo había
> descrito como "captura del fundador, no código"— resultó que no había dónde.
> `set_commission_rule` tenía
> `v_scope_sup := case when p_payee_type in ('embajador','agente') then null else p_scope end`,
> o sea que para embajador SIEMPRE guardaba `scope_profile_id` y jamás
> `scope_supplier_id`. Pero m008 movió la tarifa a la AGENCIA dueña del viaje y
> `resolve_commission_rule` la busca ahí (perfil+servicio → perfil+global →
> agencia+servicio → agencia+global). **m008 actualizó el lector y el CHECK de la
> tabla, y dejó el escritor en la versión de antes.** La tarifa que de verdad paga
> no se podía crear desde ninguna parte de la app: ése es el motivo real de que el
> programa llevara desde su creación con CERO reglas de embajador y de que un
> embajador pudiera traer la venta y cobrar $0.
>
> b080 distingue el scope **por lo que es**: si el uuid es una agencia, la regla es
> de agencia; si es un profile `type='embajador'`, es el trato especial de esa
> persona. Un uuid no puede ser las dos cosas, así que no hace falta tocar la
> firma del RPC ni pasar una bandera. De paso, el **admin de agencia** ya puede
> fijar la suya (`is_agency_admin` con `coalesce`), que era la dependencia del
> fundador que m005/m008 querían quitar. UI nueva en `/comisiones`:
> "Embajadores: cuánto paga tu agencia", reusando `ReglaRow`.
>
> Probado con rollback (5/5): la tarifa por agencia se guarda con
> `scope_supplier_id`, el resolver la encuentra, el override por persona sigue
> ganando sobre ella, y un uuid que no es ni agencia ni embajador se rechaza.
> Verificado además en el navegador con sesión de superadmin: se guardó
> `fijo_pax $250` sobre Wanderlust con `service_id` null y `scope_profile_id` null
> — la forma exacta que el resolver busca.
>
> **Hallazgo de dinero encontrado mirando esa misma pantalla, y RESUELTO:** la UI
> decía que Ketzal cobra **10%** (lee `app_settings.platform_commission_rate`) y
> el motor cobraba **20%**, porque `resolve_commission_rule` encuentra la regla
> global de `commission_rules` ANTES de caer a `app_settings`. El control
> "Comisión de plataforma" de `/equipo` escribía un valor que ya no mandaba: se
> podía cambiar y no pasaba nada.
>
> Se le presentó al fundador con la aritmética de un tour real —20% **sobre la
> venta completa**, más ~3.5% de MP, más la tarifa del embajador, contra un margen
> bruto de 15–25% en un tour de camión— y decidió **8–12%, ajustando después**. Se
> fijó en **10%** desactivando la regla global de `commission_rules`, para que el
> % general vuelva a salir de `app_settings`: **una sola fuente de verdad**, que es
> la que el control de `/equipo` escribe y la que `/comisiones` muestra. Los
> overrides POR SERVICIO siguen resolviéndose antes que el global, así que no se
> pierde nada.
>
> **Y el copy describía algo que no pasa**: `/comisiones` y `/equipo` decían
> "ventas de agentes libres y del marketplace", pero el corte está detrás de
> `if NEW.channel = 'portal'` y `bookings.channel` nace `'manual'` por default —
> un agente libre vendiendo desde el back-office genera **cero** corte. Copy
> corregido en las tres pantallas.
>
> Verificado en vivo con rollback (3/3): venta del portal de $10,000 ⇒ plataforma
> $1,000 (10%) + embajador $300; la misma venta con `channel='manual'` ⇒ cero
> líneas de plataforma. Tarifa de embajador sembrada en las dos agencias
> (`fijo_pax $250`, valor de arranque que el fundador ajusta desde la UI).

> **Fase 0 del programa de embajadores: el motor devengaba mal (b079, ADR-0029,
> 2026-09-01).** Antes de construir las 10 mejoras del portal se auditó el motor
> contra la BD **viva** (el snapshot del repo está desfasado). El embajador era
> el ÚNICO de los cuatro beneficiarios que devengaba fuera del molde: plataforma,
> agencia y agente nacen en `tg_commission_snapshot` al dejar el borrador; el
> embajador nacía dentro de `attribute_booking_by_ref`, que corre justo después de
> crear el pedido — o sea **en `draft`**. Tres daños, los tres verificados:
> (1) **deuda fantasma** — el espejo del ledger postea el asiento en cuanto nace
> la línea, y una cotización que nadie paga dejaba `+embajador / −agencia` vivos
> para siempre porque los drafts no se cancelan y b073 nunca los reversa;
> (2) **pedido imborrable** — `commission_lines.booking_id` es FK sin cascade y
> `no_mutar` prohíbe DELETE, así que `delete_my_draft_order` truena con 23503 para
> cualquier draft que llegó con `?ref`: el comprador no podía borrar su propio
> pedido, nunca; (3) **auto-referido abierto** — el guard de m010 mira `sold_by`,
> que en el portal es siempre null (al comprador lo identifica
> `marketplace_customer_id`), así que un embajador podía comprarse su viaje con su
> código y pagarse comisión. ADR-0022 enunciaba el principio; el código
> implementaba una versión más angosta.
>
> **b079** separa atribuir de devengar: las dos funciones validan y escriben
> `bookings.ambassador_id`, y el cuarto bloque de `tg_commission_snapshot` crea la
> línea cuando la venta es real. El trigger pasa a `AFTER INSERT OR UPDATE OF
> status, ambassador_id` — **esa segunda palabra no es opcional**: la venta del
> back-office nace en `reserved`, corre el trigger con `ambassador_id` null y sin
> ella nunca volvería a dispararse.
>
> **Cómo se probó sin dejar rastro** (`supabase/tests/embajador_devengo.sql`,
> 9/9): un `DO` block que termina con `raise exception`, así Postgres revierte
> cada insert — las `commission_lines` no se pueden BORRAR (`no_mutar`) pero sí
> REVERTIR. Verificado después: 8 bookings y 2 commission_lines, los mismos de
> antes. **El precedente del repo no servía**: `carreras_dinero.mjs` limpia con
> `delete from ketzal.commission_lines` completo — seguro con la BD vacía de
> agosto, hoy habría borrado ventas reales — y `comisiones_motor.sql`, que sí usa
> rollback, lleva sin poder correr desde b025 porque siembra
> `ketzal.marketplace_customers`, tabla eliminada por el refactor de identidad.
>
> **Limpieza del catálogo en el mismo carril**: se desactivaron dos reglas de
> plataforma colgadas de servicios (10% sobre el servicio TEST y **$1,000 por
> pasajero sobre "Colombia 2026"**, que estaba publicado y vivo) y se despublicó
> `TEST pago en línea $50`, que llevaba semanas en `/explora`. Queda activa solo
> la regla global del 20%.
>
> Pendiente que nadie puede arreglar con código: **`commission_rules` no tiene ni
> una fila de `payee_type='embajador'`** ⇒ el motor ya devenga bien, pero devenga
> cero hasta que el fundador capture la tarifa por agencia en `/comisiones`.

> **El hermano roto que quedó del carril anterior, y lo que había debajo (b078,
> ADR-0028, 2026-08-31).** ADR-0027 dejó `generarLinkInvitacion` de `/equipo`
> sin arreglar a propósito. Al abrirlo, el link muerto era lo de menos:
> `accept_pending_invitation` hacía `update ketzal.profiles … where id =
> auth.uid()` sobre una fila **que no existía** —0 filas, ningún error— y
> enseguida marcaba la invitación `accepted`. Medido en vivo:
> `accept_pending_invitation -> 200 "dd46052b-…"` mientras `profile -> NO EXISTE`,
> y el segundo intento (ya con `ensure_profile`) devolvía null porque la
> invitación estaba quemada. **El agente invitado que entrara por contraseña
> quedaba `type='viajero'` para siempre**, aterrizando en `/mis-compras`, y su
> invitación desaparecía de `/equipo` como si todo hubiera salido bien. Sin un
> error para nadie: ni para él, ni para quien lo invitó.
>
> La causa: la función asumía que alguien más (`ensure_profile()`, que solo llama
> `/auth/callback`) ya había creado la fila. `/login` la invoca tras
> `signInWithPassword` sin ese paso, y ese orden no lo garantizaba nadie. **b078**
> la vuelve autosuficiente con un `insert … on conflict do update` —estructural,
> no un `if FOUND`— conservando los tres guards del DDL vivo. `generarAccesoInvitado`
> sustituye al link: crea la cuenta con provisional, materializa el profile con el
> rol y la agencia de la invitación, la marca cumplida y devuelve las credenciales.
> El profile se escribe ahí y no en el login porque `must_change_password` solo
> pega sobre una fila que ya exista.
>
> **Dos bugs más los cazó mirar la pantalla, no el tipado.** (1) La tarjeta de
> credenciales colgaba del `<li>` de la invitación pendiente; al cumplirse la
> invitación la fila se va con el `revalidatePath` y **la contraseña no se veía
> nunca** — quedaba una cuenta creada que nadie podía usar. Ahora vive al nivel de
> la sección. (2) El `<Button render={<a>}>` de `CredencialesProvisionales`
> (enviado en el PR anterior) gritaba en consola: base-nova exige `<button>`
> nativo y meterle un `<a>` le quita la semántica. Cambiado al patrón del repo,
> `buttonVariants` sobre el `<a>`.
>
> **Probado:** `invitacion_acceso.mjs` 19/19 —crea el profile, nace agente y no
> viajero, respeta el rol invitado, NO arrebata a quien ya es de otra agencia y en
> ese caso NO quema la invitación, idempotente, sin invitación no fabrica nada, y
> con la app arriba el invitado aterriza en el back-office y no pasa sin fijar su
> contraseña—; `gate_password_provisional` 4/4; `acceso_provisional` 9/9; 158
> tests de dominio; `superficie_anonima` 30/0; `next build` verde. Además el botón
> se ejercitó **en el navegador** como superadmin, que es lo que destapó los dos
> bugs de UI. Limpieza verificada: 0 cuentas efímeras, 0 profiles huérfanos, la
> invitación real del fundador intacta.
>
> Queda anotado, no hecho: "Enviar acceso" sigue siendo solo del superadmin
> aunque un admin de agencia sí pueda invitar (misma asimetría que m005 arregló
> para embajadores), y un `viajero` invitado se convierte en agente mientras
> `crearAgenciaEInvitarAdmin` lo bloquea — incoherencia real, decisión de
> producto.

> **El acceso de los embajadores: se acabó el link que nunca funcionó (ADR-0027,
> 2026-08-31).** Reporte del fundador: "se crea un link y se envía, pero el link
> no funciona". Era literal, y llevaba así desde que existe. Medido en vivo con
> una cuenta efímera: `admin.generateLink` devuelve un `/auth/v1/verify` que
> aterriza en `/auth/callback` con la sesión en el **fragmento**
> (`#access_token=…`) porque un link de la Admin API no trae `code_verifier` y
> Auth cae a flujo implícito; `app/auth/callback/route.ts` es un Route Handler de
> servidor, el fragmento no le llega nunca, leía `?code=`, no lo encontraba y
> mandaba a `/login?error=auth`. **Siempre.** Y encima el token es de un solo uso:
> el segundo GET responde `#error=…`, o sea que el crawler de vista previa de
> WhatsApp lo quema antes de que la persona lo toque. Dos fallas independientes,
> cada una suficiente. Nadie lo notó porque el síntoma ("me manda al login") es
> indistinguible de haberse equivocado de correo, y quien lo sufre no es quien
> puede diagnosticarlo.
>
> **El arreglo ya estaba medio construido en el repo**: los admins de agencia y
> los miembros del equipo entran con contraseña provisional `Ketzal-NNNNNN` +
> `must_change_password` desde b029, y funciona. Embajador y proveedor eran los
> dos que se habían quedado con el magic-link. Se unificó: `lib/auth/credenciales.ts`
> emite (`nuevaProvisional`, `emitirCredencialProvisional`), cada llamador pone su
> propia puerta antes, y `regenerarAcceso` de equipo pasó a delegar ahí también —
> de tres implementaciones a una.
>
> **Segundo hueco, el que sí era grave:** el gate `must_change_password` vivía
> SOLO en `(ops)/layout.tsx`. Los portales `/embajador` y `/proveedor` no lo
> tenían, así que sus cuentas se habrían quedado con la contraseña que alguien les
> dictó por WhatsApp, para siempre. Ahora es `debeCambiarPassword` en
> `lib/persona.ts`, la misma línea en las tres superficies, y `/nueva-password`
> aterriza en `/` (que rutea por persona) en vez de `/dashboard` — antes un
> embajador rebotaba contra el gate de ops.
>
> Al crear o reemitir sale una tarjeta única (`CredencialesProvisionales`, que
> reemplazó dos copias del mismo bloque) con botones de **WhatsApp** (al chat de
> la persona si se capturó su teléfono) y **correo**. El envío sigue siendo
> manual: no hay correo transaccional y la caja de WA está pausada (ADR-0017).
> El correo del proveedor pasó a obligatorio — antes se sintetizaba un
> `<uuid>@proveedor.ketzal.local` que nadie puede dictar por teléfono.
>
> **Probado contra el proyecto real, no compilado.** `acceso_provisional.mjs`
> (9/9): la provisional entra, el propio usuario LEE su flag por RLS (si no, el
> gate no dispara nunca), `clear_password_change_flag` corre para un embajador y
> lo baja, reemitir mata la contraseña anterior, y el magic-link sigue aterrizando
> en el fragmento y muriendo al segundo GET. `gate_password_provisional.mjs` (4/4)
> contra el server de Next: `/embajador` y `/proveedor` mandan a `/nueva-password`
> con el flag puesto, `/nueva-password` abre (si rebotara quedarían encerrados), y
> sin flag se entra normal. 158 tests de dominio + `next build` en verde.
> Trampa que costó un rato y casi se reporta como bug de producción: un POST a
> `/rpc/` de PostgREST resuelve el schema con **`Content-Profile`**, no con
> `Accept-Profile` — sin él da 404, que se lee igualito a "falta el GRANT".
>
> **Queda un hermano roto, a propósito y documentado:** `generarLinkInvitacion`
> (`/equipo`, "dar acceso" a una invitación pendiente) usa el mismo
> `generateLink`, ahora con `type:'recovery'`, y se midió que aterriza igual en
> el fragmento. No se convirtió porque ese camino invita a una cuenta que aún no
> tiene `profiles` —lo crea `accept_pending_invitation` desde `/auth/callback`, y
> un login por contraseña nunca pasa por ahí—, así que arreglarlo obliga a crear
> el profile por adelantado con rol y agencia: es la máquina de estados de
> invitaciones, carril aparte. Está anotado en el código y en el ADR con lo que
> sí sirve mientras tanto. Y la línea real quedó clara: lo que se rompe es lo
> que genera el **admin**; los links que inicia la persona desde el navegador
> (magic-link de `/login`, `/recuperar`) sí traen `code_verifier` y funcionan.

> **Stack de marketing: medición server-first + SEO/AEO (m011, ADR-0025/0026,
> 2026-08-31).** Port del stack construido y verificado en vivo en estampida
> (transferencia completa en `docs/MARKETING_STACK_HUELLA.md`) — todo antes de
> gastar un peso en campañas, porque el pixel necesita ~2 semanas de datos
> para optimizar.
>
> **Medición (ADR-0025).** `Purchase` sale del servidor, de los caminos que
> confirman dinero (webhook MP, Brick inline, approve SPEI en Cobranza), vía
> Meta CAPI + GA4 Measurement Protocol con `event_id`/`transaction_id` =
> `booking_id`. Gates del helper único `sendPurchaseEvents`: solo pedidos del
> marketplace (`marketplace_customer_id`) y solo el PRIMER abono confirmado —
> la venta es una conversión, no una por abono. `InitiateCheckout` al crear el
> pedido vía `after()`. El pixel del cliente solo manda `PageView` y solo en
> la superficie pública (allowlist de rutas; el back-office no se mide).
> `user_data` mínimo: `external_id = sha256(booking_id)` — Meta rechaza
> eventos sin customer info param (error 2804050, lección pagada en
> estampida); sin email hasheado hasta que el aviso de privacidad lo cubra.
> Atribución first-touch (utm/fbclid/gclid, localStorage 30 días) + ip/ua/
> `_fbp`/`_fbc` capturados al crear el pedido → `bookings.attribution`
> (jsonb, solo service role). Funnel propio `ketzal.funnel_events` deny-all +
> `POST /api/track` (`checkout_open`/`order_created`/`pago_metodo`), sin
> PostHog. Tarjeta de atribución en `/cuentas` (superadmin): fuente →
> pedidos → con pago → $. Todo env-gated (`NEXT_PUBLIC_META_PIXEL_ID`,
> `META_CAPI_TOKEN`, `NEXT_PUBLIC_GA_ID`, `GA4_API_SECRET`,
> `META_TEST_EVENT_CODE` opcional): sin vars = no-op silencioso; nada puede
> tumbar el webhook.
>
> **SEO/AEO (ADR-0026).** `robots.ts` (crawlers de IA PERMITIDOS: GPTBot,
> OAI-SearchBot, ClaudeBot, PerplexityBot, Google-Extended; fuera back-office
> y vistas por token), `sitemap.ts` dinámico desde `list_public_services`,
> `llms.txt`, JSON-LD `TouristTrip` en la ficha e `ItemList` en `/explora`
> (serializado escapando `<`). El proxy ahora deja pasar `/robots.txt`,
> `/sitemap.xml` y `/llms.txt` — antes redirigían a /login y ningún crawler
> los veía.
>
> **Probado en vivo:** m011 aplicada y verificada contra `information_schema`
> (attribution existe; funnel_events con RLS on, 0 policies, 0 grants);
> PostgREST anon GET/POST a `funnel_events` → 401 ambos; `/api/track` local →
> 204 con fila real en BD (limpiada y verificada: 0 restantes), 400 con
> evento inválido y sin body; `robots/sitemap/llms.txt` → 200 con contenido;
> JSON-LD server-rendered visible en `curl` de la ficha (Colombia 2026).
> `tsc` limpio, 158 tests (13 nuevos: payloads shape exacto + atribución TTL
> + allowlist de rutas), `pnpm build` OK. **Pendiente de cuentas (Wal):**
> Business Portfolio Meta + dataset/token CAPI, GA4 + API secret, dominio
> propio para verificación — checklist paso a paso en
> `docs/MARKETING_STACK_HUELLA.md`; el envío real a Meta/GA4 queda sin
> ejercer hasta que existan esas envs (no-op verificado mientras tanto).

> **Reconectar Mercado Pago, y por qué hizo falta (ADR-0024, 2026-08-31).**
>
> Salió de un incidente propio: un agente investigando por qué no encontraba la
> conexión de MP corrió `select m.*` sobre `ketzal.mp_accounts` —tabla deny-all,
> justamente porque guarda tokens OAuth— y el `access_token` y el
> `refresh_token` de producción de Wanderlust quedaron impresos en un transcript.
>
> Al ir a rotarlos apareció el hueco real: **no había forma de hacerlo desde el
> producto.** La tarjeta de "Cobros en línea" enseñaba el botón de conectar solo
> cuando NO había cuenta; ya conectada decía `✓ Cuenta conectada` y nada más.
> Rotar significaba escribir en la BD con la service key — exactamente lo que la
> tabla deny-all existe para impedir. Guardar bien un secreto y no poder
> cambiarlo es media solución.
>
> **Arreglo sin backend nuevo (#83).** El link *Reconectar* reusa
> `/api/mp/oauth/start`, que ya traía el guard (superadmin o admin de esa
> agencia, `supplier` firmado HMAC en `state`), y el callback ya hacía `upsert`
> por `supplier_id`. Solo faltaba la puerta.
> → [ADR-0024](adr/0024-rotacion-de-credenciales-de-terceros.md)
>
> **El segundo hallazgo lo destapó el fundador probándolo:** "le di click, pero
> solo hace un refresh". Sí había funcionado —dos rotaciones en `system_log` a
> las 07:07:21 y 07:07:27, `expires_at` movido de 2027-02-06 a 2027-02-27, y el
> token nuevo validado en vivo contra `users/me` de MP (200, user 479630144)—.
> Lo que fallaba era el acuse: el callback volvía con `?mp=conectado` desde b053
> y **ningún componente leía ese parámetro**. La pantalla quedaba idéntica en los
> tres casos, así que **un fallo se veía igual que un éxito** — y durante un
> incidente eso te hace creer que rotaste cuando no. Corregido en #84.
>
> **Lo que Reconectar NO hace:** revocar los tokens viejos. MP emite uno nuevo en
> cada intercambio pero los anteriores siguen vivos hasta expirar (~180 días).
> Para una credencial expuesta el runbook es de dos pasos: revocar Ketzal en
> **Aplicaciones autorizadas** de la cuenta MP del vendedor, y recién entonces
> Reconectar. Queda escrito en el ADR porque el atajo de "solo reconectar" da una
> falsa sensación de cierre.

> **Los hard-tests ya se traen sus propias cuentas (ADR-0023, 2026-08-31).**
>
> Al cerrar el barrido de ayer quedó una consecuencia fea: borrar las cuentas QA
> dejó sin correr `encuestas_rls.mjs`, justo el harness que había cazado la fuga
> de PII de m002. Al mirarlo de cerca resultó que **no era la primera vez**:
> `policy_services_posiciones.mjs` llevaba muerto desde la limpieza del
> 2026-08-23 por exactamente lo mismo, y nadie se enteró.
>
> El problema no era haber borrado las cuentas, era que existieran. Cuentas QA
> permanentes te dan a elegir entre dos formas de perder: dejarlas vivas y
> acumular credenciales con rol alto en producción —`qa.ui` con
> `role='superadmin'` seis días—, o borrarlas y que los tests se apaguen **en
> silencio**. El de encuestas hasta tenía una rama que saltaba las posiciones
> inexistentes con un aviso: un test que se auto-desactiva.
>
> Ahora las cuentas viven lo que dura la corrida. `supabase/tests/_fixtures.mjs`
> las crea por Admin API con contraseña aleatoria por corrida (nunca impresa,
> nunca en `.env`), inserta su `profiles`, devuelve el JWT, y el harness llama
> `destruir()` en un `finally` que **verifica** —relee y falla si quedó alguna
> viva—. `KETZAL_QA_PASS` desaparece: ya no hay credencial de QA que guardar.
> → [ADR-0023](adr/0023-fixtures-efimeras-en-los-hard-tests.md)
>
> **El barrido de restos se probó con un crash de verdad, sin querer.** Un
> `| head -6` cerró el pipe y mató el proceso antes del `finally`; quedaron 4
> cuentas vivas. La corrida siguiente imprimió `⚠ barridos 4 restos de una
> corrida anterior` y cerró en 0. Mejor evidencia que cualquier simulacro.
>
> De paso, `policy_services_posiciones.mjs` tenía clavado `TOTAL = 13,
> PUBLICADOS = 2` y el catálogo real ya iba en **14 y 6**: resucitarlo tal cual
> lo habría dejado en rojo por la razón equivocada, que es como se entrena a
> ignorar un check (ADR-0020). Ahora las cifras se derivan con service role y la
> agencia de prueba se elige por ser la que más servicios internos tiene.
>
> Verde en vivo: encuestas **23/23 sin fugas**, posiciones **12/12**,
> `superficie_anonima` 30 pruebas · 0 expuestas. Después: 6 usuarios, 0 con
> prefijo `qa.`, 0 profiles huérfanos.

> **Se van las cuentas QA, y con ellas un superadmin olvidado (2026-08-30).**
>
> Barrido de pendientes tras cerrar investigación de mercado. Vivían cuatro
> cuentas `@ketzal.local` en la BD de producción, y la peor no era ninguna de
> las tres que se crearon para probar m002: era **`qa.ui@ketzal.local`, con
> `role='superadmin'`**, creada el 2026-08-24 para un ciclo de UI y nunca
> retirada. Una contraseña de prueba con acceso a toda la plataforma, seis días
> viva. La misma cuenta que en su momento tumbó la Admin API entera por haberse
> creado con INSERT directo a `auth.users`.
>
> Borradas por Admin API, nunca por SQL. Antes de tocar nada se verificó a qué
> apuntaban: solo su propio `profiles` y una notificación —cero datos de
> negocio— y ambas FK con `on delete cascade`, así que el borrado limpia solo.
> Después: **0 cuentas QA vivas, 0 profiles huérfanos, y el único superadmin que
> queda es el del fundador**. Recrearlas cuando toque probar sigue documentado en
> `supabase/tests/qa_m002_setup.sql`.
>
> **Lección operativa:** una cuenta de pruebas con rol alto no es dato de prueba,
> es una credencial. Borrarla es parte de cerrar el carril, no del "algún día".
>
> En el mismo barrido se cerró el carril zombi `god-panel` (su trabajo ya estaba
> en `main` como el squash de #80; `git branch -d` se niega porque el squash
> cambia el SHA, se confirma con `git diff origin/main HEAD` vacío antes de
> forzar) y se cerraron los **tres hallazgos menores** que la revisión de m004
> había dejado abiertos (#81): un error de lectura que se descartaba y reportaba
> "no existe" ante cualquier fallo; el rango de meses que se truncaba **en
> silencio** pasando de 24 —el guard va en `validar()`, que comparten crear y
> editar, y el cálculo se extrae a `largoDelRango` porque `validar` vive dentro
> de un `'use server'` y vitest no lo puede importar—; y `mesEnRango`, exportada
> sin un solo llamador. 145/145 tests, `tsc` limpio, build OK.

> **Un agente también refiere (m010 + ADR-0022, 2026-08-30).**
>
> Al revisar con el fundador los cuatro valores de `profiles.type` salió que el
> enum hacía **dos trabajos a la vez**: decidir *dónde entras* (el OS, o el
> portal `/embajador`) y decidir *si cobras por referir*. Como es un solo valor,
> las dos cosas estaban amarradas, y de ahí dos agujeros: un agente de mostrador
> que comparte el link del marketplace **no cobraba nada** —su código caía en
> `referral_misses` como `codigo_inexistente` y nadie se enteraba— y **nadie
> podía ser las dos cosas** (quien opera el mostrador y además promueve en su
> Instagram tenía que elegir).
>
> Ahora el acceso lo sigue decidiendo `type`; el cobro lo decide tener
> `referral_code` + tarifa. La línea emitida **sigue siendo
> `payee_type='embajador'`** aunque quien refirió sea un agente: referir es una
> actividad, no un oficio, así que la tarifa por agencia de m008, el espejo en el
> ledger y el portal siguen funcionando sin tocarse. → [ADR-0022](adr/0022-referir-lo-decide-el-codigo-no-el-tipo.md)
>
> **El abuso que abría esto se cerró en el mismo diff.** El agente podía pasarse
> su propio link, cerrar él la venta y cobrar **dos veces**: su línea de `agente`
> por `sold_by` más la de `embajador` por `ambassador_id`. Si `sold_by =
> ambassador_id` no se paga la de referido y se escribe un miss `auto_referido`,
> marcado **no accionable** — el motor hizo lo que debía y no hay nada que
> arreglar. Segunda razón nueva: `perfil_inactivo`, para que el código de alguien
> dado de baja deje de pagar **con su propio motivo** en vez de disfrazarse de
> código mal escrito.
>
> Probado contra la BD real. `set_referral_code` 9/9: el admin de Wanderlust le
> pone código a su agente pero **no** al admin de Border ni a un viajero; un
> agente sin rol admin no puede ponerse el suyo; duplicado, formato corto y
> formato inválido rebotan con mensaje legible; el superadmin puede con
> cualquiera; y `null` lo quita. End-to-end 5/5 (en transacción con rollback,
> verificado en 0 después): agente refiere venta ajena ⇒ **$800** (7000 × 10% +
> $50 × 2 pax) atribuidos, con 2 asientos de ledger que suman 0; auto-referido ⇒
> 0 líneas; perfil inactivo, código inexistente y sin tarifa ⇒ cada uno con su
> razón. Y en el navegador con la sesión de Border: el código se guarda en
> mayúsculas, aparece el link `/explora?ref=…` con copiar y WhatsApp, y el
> duplicado sale como *"Ese código ya está en uso por otra persona"* sin fugar el
> `23505`.
>
> De paso, dos cosas que salieron de la misma conversación:
>
> - **`profiles.type='proveedor'` no es lo que hace falta para Creel.** Registrar
>   prestadores locales (tirolesa, motos, caballos) es una fila en `suppliers` —
>   el `type` es solo el login para que ese prestador vea su manifiesto. El hueco
>   real es que `services.add_ons` es `{key,label,price}`: **sin dueño y sin
>   costo**, así que se le cobra la tirolesa al viajero pero el sistema no sabe a
>   quién se le debe ni cuánto. Anotado en el ROADMAP; no se construyó.
> - **El snapshot del schema lleva 15+ migraciones de retraso.** Está congelado en
>   b071 (`f111ce0`, "previo a migrar de proyecto"): `grep referral_misses` y
>   `grep onboarded_at` dan **0** en el archivo y existen en vivo. Un
>   rebuild-from-zero con él produce un sistema sin el motor de referidos actual.
>   Se le puso una advertencia en la primera línea; regenerarlo necesita la
>   contraseña de la BD (`supabase db dump --schema ketzal`), que es del fundador.

> **Panel del admin rediseñado + cierre de carriles zombis (2026-08-30).**
>
> **Panel (PR #76, solo presentación** — ni un RPC, ni una action, ni una
> migración; del lado de datos solo tres `count(head:true)` y el `image`/`type`
> del perfil). Cinco cambios pedidos por el fundador sobre capturas reales:
> *Primeros pasos* pasa a `<details>` **nativo** (cero JS, cero estado, teclado y
> lector lo entienden solos) y colapsado dice CUÁL paso falta, no solo cuántos
> —con 7 de 8 hechos seguía empujando el panel entero hacia abajo—; **cabecera de
> identidad de la agencia** con logo y tres cifras de inventario (servicios,
> clientes, equipo: el dinero vive en Resumen y mezclarlos aquí competiría);
> **Resumen de hoy primero**, con KPIs a dos columnas desde móvil y los filtros
> en una sola fila con "Aplicar" convertido en lupa; y el **menú de cuenta** con
> foto, tipo legible ("Administrador de agencia", no `agente` crudo) y agencia.
>
> El cambio con más efecto fue *Requiere atención* en móvil: **de ~900px a
> 279px**, medido en el DOM a 500px de ancho. La idea no fue encoger todo sino
> **jerarquía por estado** — "todo al día" es una buena noticia y colapsa a una
> fila de 41px con su enlace; la alerta conserva la tarjeta completa, que es lo
> único que hay que ver. En las capturas originales, tres de tres tarjetas decían
> "todo al día" ocupando lo mismo que la que sí requería acción.
> Verificado en navegador con sesión real de admin, en escritorio y móvil.
>
> **Carriles zombis cerrados.** `worktree-mcp-server` (último commit 2026-08-19)
> y `worktree-comisiones-motor` (2026-08-04) llevaban semanas en
> `git worktree list` como si tuvieran trabajo en vuelo. Ninguno lo tenía: cero
> commits fuera de `main`, cero cambios sin commitear. `comisiones-motor` tenía
> el nombre engañoso —arrancó con el motor de comisiones (b019) pero terminó
> siendo el carril de **cancelaciones y crédito**, la serie C0→C5 (b046–b051)—;
> no lo reemplazó nada, simplemente se terminó y quedó sin cerrar.
>
> El procedimiento verificado para cerrar un carril viejo quedó en
> `docs/WORKTREES.md › Cómo cerrar un carril viejo`. Lo que salva ahí es
> **comparar archivos, no commits**: con trabajo integrado por squash los SHA no
> coinciden y `git log main..rama` parece mostrar trabajo perdido cuando ya está
> todo dentro. Y si un archivo existe solo en la rama, hay que averiguar por qué
> NO está en main antes de asumir un descuido: en `mcp-server` los dos candidatos
> resultaron ser eliminaciones deliberadas (el workflow retirado en ADR-0020 y un
> `actions.ts` que b071 borró para cerrar un camino de venta con $0).
>

> **Embajadores listos para reclutar + tour para las tres personas (m005–m007,
> 2026-08-30).** Walfre quiso empezar a conseguir embajadores reales, así que
> primero auditamos si el flujo servía. La BD contestó sola: **0 embajadores, 0
> códigos de referido, 0 ventas atribuidas y 0 reglas de comisión de embajador**.
> Es decir, se podía reclutar a alguien, que trajera una venta, y **no cobraba
> nada**. Cinco huecos, todos arreglados:
>
> **(1) El embajador no cobraba.** No había una sola regla `payee_type='embajador'`.
> m005 abrió las policies para que el admin de agencia fijara la tarifa de sus
> embajadores; **m008 cambió el modelo** tras revisarlo con el fundador, y es la
> versión que quedó (ADR-0021):
>
> · Ketzal recluta embajadores **directos**, sin agencia (`supplier_id` null).
> · **Cualquier embajador vende viajes de cualquier agencia.** Sin límite de
>   catálogo: el que trae la venta, cobra.
> · **Paga la agencia dueña del viaje, con la tarifa que ELLA fijó.** Este fue
>   el punto fino: con la tarifa pegada al embajador (una sola y global, como en
>   m005), una agencia podía acabar pagando un 10% que nunca acordó solo porque
>   el embajador venía con esa tarifa puesta por otro. Con agencias terceras en
>   el SaaS eso es una factura sorpresa. Ahora la tarifa es de la agencia
>   (`scope_supplier_id`), y el override por persona sigue existiendo para el
>   trato especial. `resolve_commission_rule` recibe la agencia de la venta y
>   resuelve en ese orden — el mismo embajador cobra 4% + $150 en un viaje de
>   Wanderlust y $200/pax en uno de Border, verificado en vivo.
> · **Ningún referido falla en silencio**: `ketzal.referral_misses` guarda el
>   motivo (`sin_tarifa_de_la_agencia`, `codigo_inexistente`, …). Lo lee el
>   superadmin, el admin de la agencia y el propio embajador.
>
> **(2) El embajador no tenía dueño.** `crearEmbajador` nunca escribía
> `supplier_id`, así que no se podía preguntar "los embajadores de mi agencia" ni
> acotarlos por RLS. Ahora se ata a la agencia de quien lo da de alta.
>
> **(3) Solo el superadmin reclutaba** — y con un correo opcional que, si venía
> vacío, se inventaba como `<uuid>@embajador.ketzal.local`. Ese dominio no
> existe: el magic-link se generaba contra un buzón inalcanzable y **la cuenta
> quedaba muerta sin aviso**. Correo obligatorio, alta y entrega de acceso
> abiertas al admin de agencia, y botón de compartir por WhatsApp con el mensaje
> ya redactado (que es como de verdad se le manda a alguien).
>
> **(4) El portal no enseñaba nada.** Abría con el link y tres ceros. Ahora abre
> con "Cómo ganas": su tarifa en español (`Ganas 4% de la venta más $150 por cada
> persona que viaje`), cuándo se abona y cuándo le pagan.
>
> **(5) El tour solo existía para el back-office** y se recordaba en localStorage,
> o sea por dispositivo: reaparecía en cada navegador y nadie sabía quién ya lo
> había visto. Ahora hay tour de **embajador** y de **viajero**, y la marca vive
> en `profiles.onboarded_at` vía RPC (la tabla es RPC-only-write desde b017).
>
> **Dos bugs que solo aparecieron probando en vivo**, ninguno visible en el
> código ni en el build:
> · **m006 — solo podía existir UN embajador con tarifa en toda la plataforma.**
> `uq_commission_rules` se creó en b019 sobre `(payee_type, scope_supplier_id,
> service_id)`; b054 agregó `scope_profile_id` y el índice nunca se actualizó.
> Como para un embajador `scope_supplier_id` es NULL por check, todos colapsaban
> en la misma clave y el segundo moría con `duplicate key`. Lo destapó un caso
> que salió verde por la razón equivocada: el harness falló con
> `unique_violation` y lo habíamos leído como "el guard funcionó".
> · **m007 — el embajador no podía leer su propia tarifa.** El portal decía "tu
> tarifa todavía no está configurada" aunque estuviera puesta, porque
> `commission_rules_sel` contemplaba a los admins pero nunca al interesado.
>
> Y un tercero, de React: pasar los pasos del tour como prop de un Server a un
> Client Component revienta con *"Only plain objects can be passed to Client
> Components"* — los pasos llevan un `icon` que es un componente. El build no lo
> ve; sale al abrir la página. Se pasa el nombre de la persona y los pasos se
> resuelven del lado del cliente.
>
> **Un cuarto, de privacidad**, al mostrar las tarifas por agencia: el portal
> necesitaba el NOMBRE de cada agencia, y el join directo a `suppliers` devolvía
> null porque su policy solo expone la agencia propia. La tentación era ampliar
> esa policy — pero `suppliers` trae correo, teléfono, comisión pactada y la
> CLABE de los SPEI en `info`. Se resolvió reusando el RPC `list_agency_names`
> (DEFINER, solo id+nombre) que ya existía. El harness verifica que el embajador
> vea los nombres y **cero filas** de `suppliers` directo.
>
> Verificado: harness `supabase/tests/embajadores_rls.sql` **12/12** con camino
> feliz y ataques en la misma pasada · ensayo end-to-end en navegador entrando
> como embajador real (tour, tarifa, link con su código, WhatsApp) · 137 tests ·
> `tsc` y `next build` limpios · superficie anónima 30/0 · BD sin rastro.

> **El gate de comisión estaba puesto pero no cerraba (b076 → b077, 2026-08-30).**
> Al integrar el carril de comisiones que quedó sin commitear, el hard-test que
> nunca había corrido destapó que **b076 era inerte**. Su guarda decía
> `if r.basis is null then raise`, pero `resolve_commission_rule` NUNCA devuelve
> vacío para `payee_type='plataforma'`: cuando no hay regla cae a un último
> recurso que retorna siempre `('percent', coalesce(platform_commission_rate,0))`.
> Resultado: con la regla general desactivada un servicio se publicaba igual, y
> un `INSERT ... published=true` también pasaba. El agujero que motivó el carril
> —vender del portal devengando $0 en silencio— seguía abierto justo en su caso
> peor.
>
> **b077** mide el valor en vez de la forma: bloquea si `rate <= 0` **y**
> `unit_amount <= 0`, lo que de paso cubre los cuatro basis (percent,
> fijo_venta, fijo_pax, híbrido) en vez de solo los tres que enumeraba el ADR.
> Hard-test en vivo 7/7 con los dos caminos en la misma corrida —publicar con
> 20%, con el fallback de 10%, con `fijo_pax $150`; bloqueado con todo en 0% por
> UPDATE y por INSERT; editar un ya publicado no re-valida— y restauración
> verificada (fallback 10, regla 20, 5 publicados, 0 basura).
>
> Dos cosas que quedan anotadas, no corregidas: **hay dos fuentes del % de
> plataforma** (`commission_rules` general = 20 y
> `app_settings.platform_commission_rate` = 10); mientras la regla esté activa
> se cobra 20, si alguien la desactiva baja a 10 sin avisar — unificarlas es
> decisión de negocio. Y el gate solo vigila la **transición** a publicado: un
> servicio ya en vitrina sigue ahí aunque después le quiten la comisión.
>
> Contexto de proceso: este carril lo dejó otra sesión que se cerró antes de
> commitear, con su ADR-0019 declarando verificaciones que no se habían hecho
> (el trigger ni siquiera estaba aplicado en la BD — solo la regla sembrada).
> Recordatorio de que "aceptada" en un ADR no es evidencia; la evidencia es la
> corrida.

> **Los 7 arreglos de la revisión + se retira la security review automática
> (2026-08-29, PR #69).** Después de subir las encuestas (m002/m003) pedí una
> revisión del carril completo. Encontró 10 cosas; 7 valían el arreglo, y una
> era vergonzosa: **la sección no le servía al fundador**. `polls_admin_ins/upd`
> solo miraban `is_agency_admin`, que exige `role='admin'` literal, y
> `walfre.am@gmail.com` es superadmin con `supplier_id` NULL — veía las
> encuestas pero no podía crear ninguna ("new row violates row-level security
> policy", comprobado en vivo). Encima las actions hacían `.update()` sin
> `.select()`, y como PostgREST devuelve **204 sin error** cuando la RLS filtra
> las filas, la UI decía "listo" sobre un cambio que nunca ocurrió. m004 agrega
> la rama `is_superadmin()`, el form le muestra selector de agencia (no tiene
> una propia) y las actions ahora avisan si no tocaron filas.
>
> El resto: **congelamiento a la BD** (un trigger impide cambiar destinos, meses
> o agencia de una encuesta publicada — reasignar los ids dejaba los votos
> emitidos apuntando a otro destino, y esa regla vivía solo en `actions.ts`: el
> mismo error de m003 una capa más abajo); **UTM filtrados en la server action**
> y no en el componente, que es la frontera real; **CSV injection** en el export
> de leads (`=HYPERLINK(...)` escrito por cualquiera desde el anuncio se
> ejecutaba al abrir el Excel — el `campo()` copiado de /reportes solo escapa
> comillas porque allá el origen es interno); y **conteos truncados a 1000**,
> que habrían hecho mentir a las barras justo cuando la campaña funcionara.
>
> **Se elimina `.github/workflows/security-review.yml`** → [ADR-0020]. Nunca
> corrió: pide el secreto `CLAUDE_API_KEY` y el repo no tiene ninguno
> (`gh secret list` vacío). El PR #69 fue el primero en dispararlo —hasta ahora
> el trabajo entraba por push directo a `main`, y el workflow solo escucha
> `pull_request`— y falló en 30s con `ANTHROPIC_API_KEY is not set`. Trampa del
> nombre: el secreto se llama `CLAUDE_API_KEY` en GitHub; el error dice
> `ANTHROPIC_API_KEY` porque así se llama dentro de la action. Se retira en vez
> de dejarlo en rojo permanente: un check que siempre falla entrena a ignorar
> los checks. Se reimplanta al entrar en operación real; la deuda tiene dueño
> (el fundador carga el secreto). Mientras tanto la revisión es manual y
> obligatoria en carriles de RLS, dinero, PII o superficie anónima — que no es
> equivalente, porque depende de que alguien se acuerde.
>
> **Nota de proceso:** m002 y m003 se pushearon directo a `main`, saltándose el
> gate de PR que corresponde a un carril de RLS + migraciones. El #69 ya va por
> rama, como debía haber sido desde el principio.

> **Investigación de mercado: la encuesta que compra la señal antes de armar la
> salida (m002, 2026-08-29).** Hasta hoy la agencia armaba el trip y después
> descubría si había demanda. Ahora paga Meta Ads apuntando a `/opina/[id]`:
> quien llega vota destino + mes **sin registrarse**, y si quiere deja WhatsApp
> o correo — ese lead es el ROI real del anuncio. Al votar ve los resultados
> agregados (prueba social) y las dos puertas a Ketzal: crear cuenta o
> `/explora`. La agencia administra todo desde `/investigacion` (adminOnly):
> curar 4–8 destinos, abrir/cerrar/reabrir, resultados en barras, lista de
> leads con link `wa.me` y export CSV, y la liga con UTM ya puestos para pegar
> en el anuncio. Decisiones en **ADR-0018**.
>
> Lo que costó pensar más que codear: **el repo no tiene ni una policy de RLS
> para `anon`** (0 de 80), así que la escritura anónima va por 2 RPCs
> `SECURITY DEFINER` calcados de `accept_policy_by_token` (b047) — fail-closed
> `return null`, tope de 4KB, idempotencia en el `on conflict`. Y **hCaptcha no
> servía**: en este repo solo funciona a través de Supabase Auth (no hay
> `HCAPTCHA_SECRET` ni verify propio), y un endpoint de voto no pasa por Auth.
> El antiabuso quedó en dedupe por `sha256(cookie|ip|ua)` con `unique
> (poll_id, voter_hash)`; techo asumido y escrito: borrar la cookie o rotar de
> IP permite re-votar. Para una encuesta de marketing, poner un captcha entre
> el anuncio y la opinión costaba más de lo que el sesgo vale.
>
> `poll_votes` guarda PII, así que es append-only + RPC-only-write (`revoke
> insert,update,delete` a `authenticated` y `anon`) y solo la agencia dueña la
> lee; ni ella puede editar un voto. `polls`, en cambio, **no** es RPC-only: no
> es dinero, así que el CRUD escribe directo con `is_agency_admin` en vez de
> tres RPCs de fachada. Las opciones son `jsonb` y no tabla hija — 4–8 filas,
> un solo escritor; editar destinos con la encuesta ya abierta lo bloquea la
> server action.
>
> **Probado duro contra la BD real**: harness nuevo `supabase/tests/
> encuestas_rls.sql` (13 casos suplantando identidad con `set_config` —
> dedupe, voto no pisado, agregados sin PII, draft y cerrada rechazadas,
> cross-agencia en lectura y escritura, append-only hasta para la dueña):
> **13/13 OK**. `superficie_anonima.mjs` ampliado con las dos tablas y los dos
> RPCs: **30 pruebas, 0 expuestas** (`polls` y `poll_votes` dan 401; uuid
> inventado devuelve `null` sin crear filas; `meta` >4KB rechazado). Voto real
> en navegador con `?utm_source=meta&fbclid=…`, verificado en la fila
> resultante (hash de 64 chars, UTM y contacto guardados); recarga muestra "ya
> votaste". Datos de prueba borrados y **verificado en 0**. 19 tests de dominio
> nuevos, `tsc` y `next build` limpios.
>
> Dos cosas que encontramos de paso, ninguna causada por este carril: las
> cuentas QA (`walfre.am+...`) **ya no existen** tras la limpieza del
> 2026-08-23, así que `policy_services_posiciones.mjs` y el
> `encuestas_rls.mjs` nuevo no pueden correr hoy (el segundo hace *skip*
> explícito con exit 2, no verde falso); y `.env.local` no trae
> `SUPABASE_SERVICE_ROLE_KEY`, por lo que no se pudieron crear cuentas
> efímeras para cubrir el camino HTTP autenticado — la cobertura equivalente
> quedó por SQL.

> **Proyecto Supabase propio + ADRs + catálogo con fotos y video (2026-08-26/28).**
> Tres cosas encadenadas, todas disparadas por un síntoma chico: un magic link de
> Ketzal aterrizó en `hub.gorillabs.dev` porque el Site URL de Auth era un dial
> único compartido con el CRM/swarm y con tiendas.
>
> **(a) Migración a proyecto dedicado** (`uznqmmeqwbbjkotbxwsw`, org **ECS**;
> commit `a6ca662`, decisión en `docs/adr/0015`). Se hizo ANTES de la operación
> real, que era la única ventana barata: la capa transaccional estaba en cero
> desde el reset del 2026-08-19. Método: `supabase db dump --schema ketzal`
> regenerado fresco (el snapshot versionado tenía 5 semanas de atraso) y aplicado
> como migración `ketzal_baseline`; las 6 cuentas recreadas con **mismo UUID y
> mismo hash de contraseña** (copia DB-a-DB, nadie resetea nada); datos con
> `session_replication_role=replica` y las 2 migraciones de datos borradas del
> historial después. **Verificación por hashes, no por conteos**: md5 idéntico
> viejo↔nuevo de 160 funciones (cuerpo+ACL+search_path), 80 policies, 43 tablas
> (columnas+defaults), constraints y 26 triggers; conteos idénticos en 25 tablas;
> FKs sin huérfanos; `verificar_invariantes` 0; advisors 0 ERROR. **Bucket
> dedicado `ketzal-assets`** (84 objetos, hash idéntico) — el viejo
> `gorilla-assets` era del CRM y sus policies de escritura decían "Service role"
> pero tenían `roles={public}`: el bucket nuevo nace con INSERT/UPDATE solo
> `authenticated`. Dos cosas que el dump NO lleva y hubo que rehacer: la
> membresía Realtime de `notifications` y toda la config de Auth del dashboard.
>
> **Lección cara del cutover (3 redeploys):** las variables `NEXT_PUBLIC_*` se
> hornean en el build, y Vercel tenía **3 copias de cada una** (una por entorno).
> Editar una copia no bastó (el build de Production leía otra), el redeploy con
> build cache sirvió el bundle viejo, y borrarlas todas de golpe dejó Production
> **sin variables ⇒ 500 en todo el sitio** (`Your project's URL and Key are
> required`, en `/middleware`, que corre en cada request). Lo que funciona: UNA
> variable por nombre cubriendo los 3 entornos + redeploy **sin** build cache.
> Verificar el bundle servido (`grep` del ref dentro de `/_next/static/chunks/*.js`),
> no solo que el deploy diga READY.
>
> **(b) ADRs + dieta de CLAUDE.md** (commit `345218b`, `docs/adr/0001`). CLAUDE.md
> pesaba 84KB y el 92.5% era changelog narrativo: ~21K tokens cargados en CADA
> sesión de CADA agente para transmitir ~4KB de reglas. Se congelaron **17 ADRs
> fundacionales** (las reglas del juego, inmutables, se sustituyen) y el changelog
> se movió VERBATIM a este archivo. CLAUDE.md quedó en 6.6KB. Gate nuevo:
> decisión estructural ⇒ ADR antes de mergear. De paso se repararon 3 punteros
> podridos que la auditoría destapó: el contador de `db/proposed/README` decía
> b017 cuando íbamos en b071, `FINANZAS_PLATAFORMA` apuntaba a una memoria de
> codebase-memory que ya no existía en disco (la razón por la que ADR-0001 exige
> que las decisiones vivan en git), y los avisos de WORKTREES llevaban 5 semanas
> resueltos sin marcarse.
>
> **(c) Catálogo por MCP.** `ketzal_subir_fotos` (banner + galería desde archivos
> locales, merge no destructivo del jsonb `images`) y el campo `video` de
> `ketzal_editar_servicio` cierran el último hueco que exigía la app web. El
> video valida con las mismas reglas que la app: sin validar, un link no
> soportado se guarda sin error y la ficha simplemente no lo pinta — fallo
> silencioso que el agente no detecta. `videoEmbedUrl` se **copia** de
> `src/lib/video.ts` en vez de importarse porque el paquete se publica a npm
> (mismo criterio que `rest.ts`). "Huasteca Potosina en Avión" quedó con banner +
> 8 fotos + guía 4K de 5 días. Criterio al elegir el video, no obvio: se
> descartó el mejor posicionado por ser de **RutaHuasteca, una agencia que vende
> los mismos tours** — meter su video en la ficha de Border es publicidad gratis
> al competidor; y otro candidato estaba **muerto (404)**, cazado con el endpoint
> **oEmbed público de YouTube**, que da canal y disponibilidad sin API key (por
> eso no se instaló ningún MCP de YouTube: no hay oficial, los de comunidad
> piden API key de Google y meten código de terceros en la sesión que opera el
> dinero).
>
> **(d) Cuenta QA cerrada** (`qa.ui@ketzal.local`): viajó a producción nueva como
> superadmin activo. Desactivada en ambos proyectos (`active=false` +
> `banned_until`). Al hacerlo salió que **nunca pudo hacer login**: se creó por
> SQL con `confirmation_token`/`recovery_token`/`email_change_token_new` en NULL
> en vez de `''`, y GoTrue los escanea como string no-nullable ⇒ `500 Database
> error querying schema` en cualquier intento. Preexistente, no introducido al
> migrar. `banned_until='infinity'` tiene el mismo problema de parseo: usar fecha
> concreta lejana. Si algún día se recrean cuentas por SQL, los tokens van `''`.

## Construido — estado real (actualizado 2026-07-09)

> El checklist de arriba quedó corto. Resumen aditivo de lo construido. Detalle vivo en la memoria del proyecto (`ketzal-project`).
>
> **Estado real (corregido 2026-07-19):** el OS está **desplegado en producción y en fase de pruebas — todavía NO hay operación real**. Verificado contra la BD: `bookings`, `payments`, `customers`, `receipts` en **cero**. Sigue en pruebas hasta que esté 100% probado. No confundir "desplegado y funcional" con "en uso": el FODA pesa distinto según cuál sea (ej. los 8 días de Clawbot caído tuvieron daño real cero porque no había nada que cobrar). **Reset a 0 (2026-08-08):** para empezar de cero antes de la operación real, se vació el schema `ketzal` (agencias/servicios/ventas/pagos/clientes/recibos a 0, folios reiniciados) en un DO block atómico que levantó y re-armó los guards `no_mutar`. Quedan solo la cuenta superadmin (`walfre.am@gmail.com`, **sin agencia** — su `supplier_id` se puso null) y `app_settings` (config/marca); `auth.users` intacto. El seed de Wanderlust/Border/Snapshot + servicios se recrea desde la UI (`/equipo → Crear agencia`, `/servicios`).
>
> **Catálogo público — primer slice vivo (2026-07-20):** el flag `services.published` ya se prende/apaga desde la UI (toggle en la lista de servicios **y** en el formulario de edición, tarjeta "Publicación"). Las rutas públicas `/explora` (`ketzal.list_public_services`) y `/servicio/[id]` (`ketzal.get_public_service`, fail-closed) sirven solo lo publicado. El fundador publicó **2 servicios** (Brasil, Dunas Mágicas Samalayuca) — verificado end-to-end, 0 errores de advisors. Sigue siendo **fase de pruebas** (sin ventas ni operación real); es el primer paso hacia el marketplace B2C 🅰️. Además ya tienen **galería (hasta 20 fotos) + carrusel** en la ficha y **video opcional** (YouTube/Vimeo, `yt_link` en `get_public_service`); `/explora` ordena por precio.
>
> **Marketplace — terreno B.0 aplicado (2026-07-20, dark-launched):** primer paso B2C detrás del flag **`NEXT_PUBLIC_MARKETPLACE`** (off por default; se prende en Vercel + redeploy). Tabla nueva **`ketzal.marketplace_customers`** (comprador B2C, RLS solo-dueño `id = auth.uid()`, **aislada de `profiles`** para no tocar la RLS por agencia). Registro con **email+password** (evita `/auth/callback` → el comprador nunca nace como agente). Ruta **`/comprar/[serviceId]`** (gated): alta rápida → resumen + handoff WhatsApp (sin pago aún). CTA "Comprar en línea" en la ficha. Plan y estado por fases en **`docs/MARKETPLACE_TERRENO.md`**. **B.1 (pedido + endurecer confirmación de comprador) se continúa en Claude console; esta rama sigue con UI/UX.**
>
> **Vitrina pública B2C — construida (2026-07-21, rama UI/UX):** circuito público navegable, indexable, sin login: **`/explora`** (viajes) ↔ **`/agencias`** (directorio) → **`/agencia/[id]`** (perfil) → **`/servicio/[id]`** (ficha) → **`/comprar`** (tras flag). **RPCs nuevos** (SECURITY DEFINER, anon): `get_public_supplier` (perfil fail-closed: logo, métricas reales —viajes activos/destinos/años operando—, km seed del fundador, galería, viajes clicables, redes), `list_public_suppliers` (directorio), `get_supplier_rating` (rating agregado que **reusa `get_service_reviews`** → misma visibilidad, sin N+1). `get_public_service` extendido con `agency.id` para enlazar la ficha al perfil. **Reseñas/rating** (badge + recientes en perfil, estrellas en directorio y ficha) tras el flag `NEXT_PUBLIC_MARKETPLACE`. **`/explora` pulido**: agencia enlazable (mapeo nombre→id, sin tocar `list_public_services`), filtro de precio, badges de tipo, "limpiar filtros", conteo N de M. **Header/footer público compartido** (`src/components/public/`) en las 5 rutas. **Fix**: `/agencia` y `/agencias` faltaban en la allowlist de `proxy.ts` (pedían login) → corregido. **Form de proveedor enriquecido** (Fase A): logo, fotos (≤12), perfil público (`suppliers.info` jsonb: acerca de, ciudad, año, redes, especialidades, km) — reusa columnas existentes, **sin migración**; **botones inteligentes** por proveedor en `/proveedores/[id]`. **Sistema de logo oficial** configurable (`/ajustes`, `app_settings.logo_url`, RPC `get_brand_logo`) en header/login/documentos/OG (wordmark; favicon se queda con el quetzal). **Modo demo** `?preview=reviews` (andamiaje de previsualización de reseñas/rating) — **eliminado 2026-07-22** (`src/lib/demo/reviews.ts` borrado + sus 3 usos en la vitrina; las reseñas reales quedan intactas tras el flag del marketplace). Migraciones aplicadas: `ketzal_public_supplier_profile`, `ketzal_list_public_suppliers`, `ketzal_get_supplier_rating`, `ketzal_app_settings_logo`; 0 errores de advisors. Sigue **fase de pruebas** (sin operación real). Nota de coordinación: si se re-aplica `get_public_service`, conservar `agency.id`.
>
> **Plan vs competidor + F1 UI (2026-07-21):** comparativo de Ketzal OS contra un back-office competidor + plan de 7 fases en **`docs/PLAN_COMPETIDOR.md`** (F1 folio cotización, F2 gastos+CxP, F3 pasajeros/manifiesto/salidas, F4 voucher, F5 metas, F6 divisas TC manual, F7 clawbot; descartados: cargo-tarjeta/PCI, créditos corp, 12 estatus, módulo bodas completo, cuentas bancarias). **F1 — COMPLETA + hard-testeada (2026-07-21).** UI: folio `COT-n` en la lista de cotizaciones, en el documento público y badge "Origen: COT-n" en la venta (null-safe). BD (migración aplicada, espejo en `db/proposed/007_folio_cotizacion.sql`): tabla **`doc_counters`** (counter genérico por (scope, serie); RLS deny-all + `no_mutar` + REVOKE; scope = agencia o `auth.uid` del agente libre, **sin FK**), RPC **`next_doc_folio`** (clon de `next_receipt_folio`, atómico sin huecos por serie), `bookings.quote_folio`, y re-apply **aditivo desde el DDL vivo** de `create_booking_with_items` (asigna folio al crear `draft`, se conserva al convertir; sigue INVOKER), `get_quote_by_token` (+`folio`) y `verificar_invariantes` (+check `folio_cot_duplicado`, agrupado por scope). Hard-test end-to-end (revertido, bajo agencias QA): COT consecutivos por agencia, venta directa sin folio, convertir conserva el folio, aislamiento entre agencias, invariantes=0, advisors 0 ERROR. **Coordinación:** `create_booking_with_items`/`get_quote_by_token`/`verificar_invariantes` se re-aplicaron aditivamente — si el otro agente los re-aplica desde su fuente, conservar `quote_folio` / la key `folio` / el check `folio_cot_duplicado`.
>
> **F2 — Gastos + CxP a mayoristas (light) — COMPLETA + hard-testeada (2026-07-21, rama UI/UX).** Ledger de egresos append-only para sacar **utilidad** real y **cuentas por pagar** a las agencias dueñas cuyos viajes se revenden. BD (migración aplicada `ketzal_expenses_v1`, espejo en `db/proposed/008_gastos.sql`): tabla **`ketzal.expenses`** (`kind` egreso|reverso + `reverses_expense_id`; categoría corta operacion/transporte/hospedaje/alimentos/**mayorista**/marketing/otro con CHECK `mayorista ⇒ provider_supplier_id not null`; `amount_mxn>0`; `booking_id` opcional; `spent_at`; RLS **calco de payments** `my_supplier_id()` + `is_active`; `no_mutar` trigger + REVOKE update/delete/truncate ⇒ **corrección = contra-asiento**, nunca UPDATE/DELETE). RPCs (INVOKER salvo resúmenes): **`create_expense`**, **`reverse_expense`** (falla si no existe / ya es reverso / ya revertido; inserta espejo kind='reverso'), **`expenses_summary(from,to)`** DEFINER (total neto egreso−reverso, por_categoria, por_mes), **`payables_summary()`** DEFINER (CxP por agencia dueña: `debo = Σ(total−comisión)` de reventas confirmed/paid, `comisión = round(total*owner.commission_rate/100,2)`, `pagado = Σ` gastos category='mayorista' egreso−reverso, `saldo = debo−pagado`). Decisión: **pagos a mayorista = filas de `expenses`** (un solo ledger ⇒ utilidad sin doble contabilidad); NO tabla `supplier_payments`. `verificar_invariantes` re-aplicado con **+2 checks**: `gasto_reverso_incoherente`, `gasto_doble_reverso` (cxp_sobrepago omitido a propósito). Hard-test en vivo (revertido, agencias QA): gasto→reverso neto 0, doble-reverso bloqueado, mayorista-sin-proveedor bloqueado, DELETE directo bloqueado por trigger, payables corre, invariantes=0 (7 checks), advisors 0 ERROR. **App** (rama UI/UX): ruta **`/gastos`** (admin) — lista con reverso (`window.prompt` motivo, solo egresos no revertidos), form de nuevo gasto (proveedor requerido si mayorista), KPIs del mes + sección **CxP** con "Registrar pago" prellenado (`?category=mayorista&provider=<owner_id>`); nav "Gastos" (adminOnly) + `/gastos` en `ADMIN_HREFS`; `/reportes` gana cards **"Gastos"** y **"Utilidad"** (= vendido − gastos del rango, siempre derivada) + esos campos en el CSV. Casts `as never` para los RPCs nuevos; `database.types.ts` intacto; tsc+build limpios. **Coordinación:** `verificar_invariantes` se re-aplicó aditivamente (ahora 7 checks) — conservar `gasto_reverso_incoherente` / `gasto_doble_reverso` (además de los de F1) si el otro agente lo re-aplica. **Siguiente:** F3 (pasajeros + manifiesto + vista de salida) según `docs/PLAN_COMPETIDOR.md`.
>
> **F3 — Pasajeros + manifiesto + vista de salida — COMPLETA + hard-testeada (2026-07-22, worktree `worktree-f3-pasajeros-salidas`).** Saber quién va en cada salida y sacar el manifiesto del camión (equivalente "tour" del expediente de grupo). Junta ventas↔salida por `(service_id, travel_date = departs_on)` (igual que `tg_booking_capacity`; NO hay FK booking→departure). BD (migración aplicada `ketzal_pasajeros_salidas` + `_filtro`, espejo `db/proposed/011_pasajeros_salidas.sql`): tabla **`ketzal.booking_passengers`** (`full_name`, `passenger_type`, `doc_id` opc.; **EDITABLE** — no es dinero, sin ledger/no_mutar; RLS `bp_sel/ins/upd/del` vía **EXISTS a bookings** = misma visibilidad que la venta + `is_active` en escritura). RPCs **`list_departures(from)`** y **`get_departure_detail(id)`** DEFINER con **guard por agencia dueña del servicio** (`services.supplier_id`) o superadmin (raise si no). **Manifiesto cross-tenant a propósito**: lista TODOS los pax del camión (incl. reventas de otras agencias), pero el **dinero** (total/cobrado/saldo) SOLO de las ventas propias del que llama (`is_own` = selling=mío ∨ sold_by=uid ∨ superadmin; ajeno ⇒ null). Asientos tomados = `status in (reserved,confirmed,paid)` (draft = cotización, no cuenta). Dinero derivado (regla de oro #2: cobrado = Σ payment−refund COMPLETED). **App**: sección **Pasajeros** en `/ventas/[id]` (captura rápida nombre/tipo/doc, contador X/num_pax; acciones en `pasajeros-actions.ts` aparte para no chocar con `ventas/[id]/actions.ts`); **`/salidas`** (lista con ocupación + progreso de captura), **`/salidas/[id]`** (KPIs ocupación/pax/vendido-saldo propio + ventas del camión con reventas visibles y dinero ajeno privado), **`/salidas/[id]/manifiesto`** (documento interno imprimible **con sesión** — PII, SIN token público — lista plana pase de abordar + aviso de ventas sin pax); nav **"Salidas"** (ruta general; `list_departures` ya la acota). Hard-test adversarial en vivo (rollback, agencias QA + reventa sintética): guard bloquea agencia no-dueña, dinero aislado (vendido_propio excluye reventa, reventa total=null), manifiesto completo (pax_capturados), `list_departures` scope (Beta no ve salida de Alfa), RLS pax entre agencias, draft/cancelled excluidos, salida vacía, agente libre → []. `tsc`+`build` limpios, advisors **0 ERROR**. **Coordinación:** todo en worktree aislado; solo edición mínima/localizada en `ventas/[id]/page.tsx` (fetch pasajeros + `<PasajerosSection>`) y `nav-items.ts` (item Salidas + flag `superadminOnly` ya existía). **NO** se tocó `verificar_invariantes` (el check opcional `pax_vs_num_pax` queda como follow-up para no re-aplicar la función compartida). **Siguiente:** F4 (voucher de servicio foliado) según `docs/PLAN_COMPETIDOR.md`.
>
> **F4 — Voucher de servicio foliado — COMPLETA + hard-testeada (2026-07-22, worktree `f4-voucher`).** Comprobante que **acredita el servicio** (para presentar al operador/hotel), foliado por agencia; **NO expone dinero**. BD (migración aplicada `ketzal_vouchers_v1`, espejo `db/proposed/012_vouchers.sql`): tabla **`ketzal.vouchers`** (`id` = token público, **un voucher por venta** `booking_id unique`, `folio` único por agencia `unique(supplier_id,folio)`; **append-only desde la app** = REVOKE update/delete/truncate; RLS `vouchers_sel/ins` = visibilidad de la venta). RPCs: **`emit_voucher(booking)`** INVOKER **idempotente** (si ya existe lo regresa; maneja carrera con `unique_violation`), solo `reserved/confirmed/paid`, folio vía `next_doc_folio(coalesce(selling,auth.uid),'voucher')` (reusa la infra atómica de F1); **`get_voucher_public(id)`** DEFINER anon **fail-closed** (null si cancelada o no existe), **sin montos** — devuelve agencia/logo/contacto (de `suppliers` como `get_receipt_public`), folio, cliente, servicio, fecha de viaje, pax y lista de pasajeros. **App**: ruta pública **`/voucher/[voucherId]`** (documento imprimible calco de `/recibo`, sin dinero; + `loading`), card **"Voucher de servicio"** en `/ventas/[id]` (emitir idempotente / ver / copiar link; solo ventas `reserved/confirmed/paid`; acción en `voucher-actions.ts` aparte), **`/voucher/` en la allowlist de `proxy.ts`** (público sin login). Hard-test en vivo (rollback): idempotente (emitir 2× = mismo voucher), folios consecutivos por agencia (1,2), draft bloqueado (raise), público sin dinero (0 keys de montos), trae servicio/pax/pasajeros, cancelada ⇒ `get_voucher_public` = null. `tsc`+`build` limpios, advisors **0 ERROR**. **Coordinación:** worktree aislado; solo edición mínima en `ventas/[id]/page.tsx` (fetch voucher + `<VoucherBoton>`) y `proxy.ts` (1 línea). Sin tocar `database.types.ts` ni `verificar_invariantes`. **Siguiente:** F5 (metas por agente + conversión) según `docs/PLAN_COMPETIDOR.md`.
>
> **F5 — Metas por agente + conversión — COMPLETA + hard-testeada (2026-07-22, worktree `f5-metas`).** Meta de venta mensual (agencia + por agente) con avance, y tasa de conversión cotización→venta (habilitada por el `quote_folio` de F1). BD (migración aplicada `ketzal_sales_goals_v1`, espejo `db/proposed/013_sales_goals.sql`): tabla **`ketzal.sales_goals`** (meta mensual por `agent_id` o por agencia `agent_id null`; uniques parciales por (supplier,agent,month) y (supplier,month); **escritura solo vía RPC** = RLS deny insert/upd/del + guard admin en el RPC; lectura por agencia `sg_sel`). RPCs DEFINER: **`upsert_sales_goal(agent,month,amount)`** / **`delete_sales_goal(agent,month)`** (guard `is_superadmin() or role='admin'`; el admin solo su agencia), **`goals_progress(month)`** (meta vs vendido real del mes = Σ total de bookings reserved/confirmed/paid creados en el mes, por agente + agregado agencia), **`conversion_summary(from,to)`** (cotizadas = bookings con `quote_folio` creados en rango, convertidas = las que están reserved/confirmed/paid, tasa; global + por agente). **Decisión de coordinación clave: NO se re-aplicó el hub compartido `reports_summary`** — la conversión va en un RPC nuevo e independiente (cero mutación del hub ⇒ cero colisión con el otro agente; el read del DDL vivo de reports_summary fue rechazado y se rodeó así). **App**: sección **"Metas del mes"** en `/equipo` (fija meta de agencia y de cada agente con avance; `metas-actions.ts` + `metas-section.tsx`); cards **"Conversión (cotización→venta)"** y **"Meta del mes"** en `/reportes` (`conversion-meta.tsx`). Hard-test en vivo (rollback): upsert pisa, agente (role user) denegado por guard, RLS aislada entre agencias (A no ve metas de B), goals_progress OK, conversión 2 cot / 1 conv = 50%. `tsc`+`build` limpios, advisors **0 ERROR**. **Coordinación:** worktree aislado; edición localizada en `equipo/page.tsx` y `reportes/page.tsx`; sin tocar `database.types.ts`/`reports_summary`/`verificar_invariantes`. **Follow-up cerrado (2026-07-22):** conversión + meta del mes también en el CSV de `/reportes` (secciones "Conversión (cotización→venta)" y "Meta del mes", global + por agente; cambio de presentación, sin DDL). **Siguiente:** F6 (divisas USD, TC manual) según `docs/PLAN_COMPETIDOR.md`.
>
> **F6 — Divisas USD (TC manual light) — COMPLETA + hard-testeada (2026-07-22, worktree `f6-divisas`).** Vender en USD con tipo de cambio manual; **el motor sigue 100% MXN (autoritativo)**: al vender en USD el FORM convierte a MXN con el TC y manda MXN al RPC de venta EXISTENTE — **NO se toca `create_booking_with_items`** (decisión clave: evita re-aplicar el RPC core compartido + su read en vivo). BD (migración aplicada `ketzal_currency_usd`, espejo `db/proposed/014_currency_usd.sql`): **`bookings.exchange_rate numeric(12,4)`** + **CHECK `bookings_currency_rate_chk`** (`currency='MXN'⇒rate null`; `'USD'⇒rate not null and >0` — cubre `divisa_sin_tc` en la BD); RPC **`set_booking_currency(booking,cur,rate)`** INVOKER (anota divisa+TC en la propia venta vía RLS `bookings_upd`; bloquea si la venta ya tiene abonos COMPLETED). El USD se **deriva** para mostrar (usd = mxn/tc); payments/reportes/cobranza/invariantes **intactos** (todo MXN). **App**: `/ventas/nueva` gana selector **MXN/USD** + input **TC** (precios en USD con conversión a MXN en vivo + validación TC; al guardar convierte líneas+descuento × TC); **`createBooking` aditivo** (acepta `currency`+`exchangeRate`, tras crear la venta MXN llama `set_booking_currency`); `/ventas/[id]` muestra "Divisa original: USD · TC · (≈ US$ · MXN autoritativo)". Hard-test en vivo (rollback): USD $1000 @17.50 ⇒ 17500 MXN y derivado 1000; USD sin TC denegado, divisa inválida (EUR) denegada, RLS entre agencias, CHECK bloquea `USD+rate null`; venta MXN sin regresión. `tsc`+`build` limpios, advisors **0 ERROR**. **Coordinación:** edición aditiva/quirúrgica al form de venta + `createBooking` (compartidos) — rebase limpio; sin tocar `create_booking_with_items`/`database.types.ts`/`verificar_invariantes`. **Follow-up cerrado (2026-07-22, worktree `f6-usd-docs`):** nota "USD · TC" en documentos públicos. Los importes se muestran SIEMPRE en MXN (autoritativo) en recibo/cotización/estado + sus OG (antes una venta USD formateaba el monto MXN con símbolo USD = mislabel; el recibo ahora muestra la cantidad con letra siempre); cuando la venta se pactó en USD se agrega `<NotaDivisa>` ("Operación pactada en USD al TC $X MXN/USD, total ≈ US$Y; los importes están en MXN, la moneda autoritativa"). BD: RPC **NUEVO e independiente** `get_public_doc_currency(kind,id)` (DEFINER, anon, **LANGUAGE sql** para que `check_function_bodies` valide al aplicar; devuelve divisa+TC solo si USD, resolviendo por el mismo token de cada documento) — **NO re-aplica** `get_receipt_public`/`get_quote_by_token`/`get_statement_by_token` (evita el riesgo del re-apply compartido; anon-safe: expone menos que los hermanos). Espejo `db/proposed/016`. El voucher no lleva montos ⇒ no aplica. tsc+build limpios, advisors 0 ERROR. **Siguiente:** F7 (Clawbot: 3 reglas nuevas) según `docs/PLAN_COMPETIDOR.md`.
>
> **F7 — Clawbot: 3 reglas operativas — COMPLETA + hard-testeada (2026-07-22, worktree `f7-clawbot`). Con esto el plan competidor de 7 fases queda 7/7.** Amplía el motor de recordatorios sin re-escribirlo. BD (migración aplicada `ketzal_clawbot_reglas_v2`, espejo `db/proposed/015_clawbot_reglas_v2.sql`): extiende el CHECK de `kind` (4 → 7) y crea una función **NUEVA e independiente** **`clawbot_reglas_operativas()`** (DEFINER, `search_path` fijo, REVOKE public/anon + GRANT authenticated/service_role) con 3 reglas — **decisión de coordinación clave: NO se tocó** `clawbot_generar_recordatorios`/`clawbot_resumen`/`clawbot_bandeja` (cero colisión con el otro agente). Reglas: **`saldo_sin_plan`** (venta de **contado** con saldo ≥3 días — hueco real: hoy solo se persigue a quien tiene plan; nudge al cliente por WhatsApp, dedupe semanal `IYYY-IW`), **`viaje_manana_operativo`** (viaje mañana, **interno** al agente: pax capturados X/Y + revisa manifiesto; depende de F3; `channel='interno'`, sin teléfono), **`pago_sin_recibo`** (abono `COMPLETED` sin recibo tras 24h, **interno**, dedupe por id de pago). Descartada `cupo_por_llenarse` (sin datos para calibrar umbral). Todas **idempotentes** por `dedupe_key`; reusa la columna `clawbot_reminders.channel` (ya existía, default `whatsapp`). **App**: cron `/api/clawbot/tick` llama `clawbot_reglas_operativas` **además** del motor (log aparte, idempotente; contrato del cron intacto); `clawbot/data.ts` gana los 3 `kind` en `ClawbotKind`; `clawbot/clawbot-list.tsx` gana chips de los 3 tipos y para los **internos** (viaje_manana_operativo, pago_sin_recibo) muestra la nota como texto de lectura + botón **"Ver venta"** (link a `/ventas/[id]`) en vez del envío por WhatsApp (`saldo_sin_plan` sigue el flujo WhatsApp). Hard-test en vivo (rollback, agencias QA): 1er tick 1 recordatorio por regla, 2º tick idempotente (mismos conteos, sin duplicados). `tsc`+`build` limpios, advisors **0 ERROR**. **Coordinación:** worktree aislado; sin tocar `database.types.ts` (casts `as never`), `verificar_invariantes`, ni el motor Clawbot existente. **Plan competidor COMPLETO (7/7).** Follow-ups menores **todos cerrados (2026-07-22)**: conversión/meta en el CSV de `/reportes` (F5) ✅; nota "USD · TC" en documentos públicos (F6) ✅ — recibo/cotización/estado muestran MXN autoritativo + nota USD vía RPC nuevo `get_public_doc_currency` (LANGUAGE sql, DEFINER anon; **sin re-aplicar** los RPCs públicos compartidos; espejo `db/proposed/016`); modo demo `?preview=reviews` eliminado ✅ (se borró `src/lib/demo/reviews.ts` y sus 3 usos en la vitrina; reseñas reales intactas tras el flag).
>
> **SaaS — capa delegada de agencias (2026-07-23).** El OS se vuelve multi-tenant operable por las propias agencias, sin shell nuevo: el shell `(ops)` YA es el shell del admin de agencia (admin de agencia = `role='admin'` + `supplier_id`; las 4 capas —RLS por `my_supplier_id()`, rol, gating nav/proxy, guards en RPCs— ya modelan el multi-tenant). Modelo elegido: **"Delegado"** — el superadmin crea la agencia + invita a su admin; ese admin invita a sus propios agentes; al primer login (email verificado por el proveedor OAuth/magic-link) el invitado se **auto-une** a su agencia con el rol invitado. **P0 (ya en main):** escalación de auto-UPDATE de `profiles` cerrada (`b017_profiles_lockdown`, REVOKE insert/update/delete de `authenticated`; toda escritura de profiles va por RPC DEFINER) + `/salud` y `/ajustes` movidos a `superadminOnly` en el nav (plataforma, no agencia; PRs #53/#56). **P1 — Invitaciones + delegación de rol — COMPLETA + hard-testeada (2026-07-23, rama `saas-p1-invitations`).** BD (migración aplicada `ketzal_agency_invitations`, espejo `db/proposed/b018_agency_invitations.sql`): tabla **`ketzal.agency_invitations`** (`email`, `supplier_id`→suppliers, `role` CHECK in(user,admin), `status` pending/accepted/revoked; unique parcial `(lower(email),supplier_id) where pending`; RLS `agency_invitations_sel` = superadmin ∨ `supplier_id=my_supplier_id()`; **escritura solo vía RPC** = REVOKE insert/update/delete). RPCs DEFINER (search_path fijo, REVOKE public/anon): **`is_agency_admin(supplier)`** (¿caller es admin ACTIVO de esa agencia?), **`invite_agent(email,role,supplier)`** (superadmin→cualquier agencia; admin→SOLO la suya, rol user|admin, nunca superadmin/cross-agencia; upsert de pendiente), **`accept_pending_invitation()`** (auto-une al primer login por email verificado, **SOLO si `supplier_id` es null** — no arrebata a un ya-asignado), **`list_agency_invitations()`** / **`revoke_invitation(id)`** (scope agencia o superadmin), **`set_agency_member_role(user,role)`** (delega user↔admin DENTRO de la agencia; nunca superadmin, nunca cross-agencia). **App**: `/auth/callback` llama `accept_pending_invitation()` tras `ensure_profile` (no-op para compradores del marketplace y para quien ya tiene agencia; RPC nuevo ⇒ cast `as never`). Hard-test adversarial en vivo (rollback, agencias QA Alfa/Beta, 10 checks): admin invita a su agencia ✓, admin→otra agencia denegado ✓, admin invita superadmin denegado ✓, superadmin invita a cualquiera ✓, accept auto-une (user activo) ✓, accept NO arrebata a un ya-asignado ✓, admin promueve user→admin en su agencia ✓, promover cross-agencia denegado ✓, poner superadmin denegado ✓, RLS: agencia B no ve invitaciones de A ✓; advisors **0 ERROR** (WARN 107→113 = 6 funciones DEFINER nuevas, baseline). **Coordinación:** todo objetos nuevos + grants aditivos; sin tocar `database.types.ts`/`verificar_invariantes`/RPCs compartidos. **P2 — UI de gestión delegada en `/equipo` — COMPLETA (2026-07-23, rama `saas-p2-equipo`).** Sin BD nueva (consume los RPCs de P1). Card **"Invitar agentes"** (`invitaciones-section.tsx`): form email + rol (Agente/Admin) + —solo superadmin— selector de agencia destino (obligatorio); lista de **invitaciones pendientes** con **Revocar** (`list_agency_invitations`/`revoke_invitation`). **Delegación de rol para el admin de agencia** en `miembro-acciones.tsx`: botón **"Hacer admin"/"Hacer agente"** (`set_agency_member_role`, user↔admin) visible solo para admins (el superadmin ya tiene el selector de 3 roles), oculto en la fila propia (anti auto-degradación), en libres y en superadmins; `viewerId` fluye page→`equipo-list`→`miembro-acciones`. Server actions en `invitaciones-actions.ts` (casts `as never`; el guard vive en los RPCs). `tsc`+`build` limpios. **P3 — Onboarding de agencia en un paso (superadmin) — COMPLETA (2026-07-23, rama `saas-p3-onboarding`).** Sin BD nueva. Card **"Crear agencia"** en `/equipo` (superadmin; `crear-agencia-section.tsx`): nombre + correo del admin + comisión % → acción **`crearAgenciaEInvitarAdmin`** (en `invitaciones-actions.ts`) que **inserta la agencia** (`suppliers` type='agency', RLS solo-superadmin; contact_email = correo del admin si no se da otro) y de inmediato **`invite_agent(admin, 'admin', nuevaAgencia)`**. Cierra el funnel Delegado: crear agencia + invitar a su admin que antes eran dos pantallas (`/proveedores/nuevo` + selector en `/equipo`). Parcial resiliente: si la agencia se crea pero la invitación falla, no revierte (la agencia ya existe, se invita después) y se avisa como `warning`. `tsc`+`build` limpios. **Dashboard del admin de agencia:** NO se construye — `/dashboard` ya está scopeado por RLS (`my_supplier_id`), así que el admin de agencia ya ve solo lo suyo; un dashboard aparte sería redundante. **Capa SaaS delegada COMPLETA (P0→P3).** Un superadmin da de alta una agencia + su admin en un paso; el admin gestiona su equipo, sus ventas y su dinero, aislado por agencia a nivel BD. **Validado en prod end-to-end (2026-07-23)** con cuenta real (`wal@gorillabs.dev`): crear agencia (sembrada "Agencia Prueba (P3)") → invitar → login → auto-join a **admin**, aislado por agencia (Proveedores muestra solo la propia; 6 agencias en el sistema, el admin ve 1); chequeo adversarial desde esa cuenta (invita a su agencia ✓, a otra denegado ✓, ponerse superadmin denegado ✓). **Dos fixes salieron al probar:** (a) `suppliers.contact_email` es UNIQUE y `crearAgenciaEInvitarAdmin` usaba el correo del admin como contacto → **campo de contacto opcional + error accionable** (**#60**); (b) **auto-join también en login por contraseña** (**#61**): `accept_pending_invitation` vivía solo en `/auth/callback` (magic-link/Google); el login por password (`signInWithPassword` directo) lo saltaba, así que un agente existente invitado se logueaba pero no se unía — ahora se llama tras el login por password también. **Siguiente:** lo que el fundador priorice.

> **Finanzas de plataforma — ledger balance-0 + Mercado Pago Split — CONSTRUIDO (2026-08-04, carril `finanzas-split`, b052–b053, commit `e20cb46`, doc en `docs/FINANZAS_PLATAFORMA.md`).** Resuelve "Ketzal devenga pero nunca cobra": **`ledger_entries`** (doble partida — cada grupo suma 0, validado en `ledger_post`, ÚNICA vía de escritura; append-only + deny-all) con cuentas por actor (plataforma/agencia/embajador/viajero). **Espeja, no recrea**: trigger sobre `commission_lines` (+backfill verificado: 10 asientos, suma $0.00, Ketzal +$1,850.50 por cobrar); los `credits` de cancelaciones NO se recrean (método 'credito' = transferencia interna). Página **/cuentas** (nav adminOnly): saldos con movimientos + Liquidar (superadmin, `settle_ledger`). **MP Split**: `mp_accounts` deny-all (tokens OAuth JAMÁS en suppliers.info) + `/api/mp/oauth/*` (state firmado HMAC, guard admin); con cuenta conectada el checkout usa el token del VENDEDOR + `marketplace_fee` ⇒ dinero directo a la agencia y fee separado AL COBRAR (`fee_cobrado_split` cierra el devengo); sin cuenta ⇒ `cobro_por_cuenta` con **payout a 7 días** (`available_at`); webhook con fallback de tokens de vendedor (split da 404 con token de plataforma); SPEI directo deja el cargo del fee visible como por-cobrar. `confirm_online_payment` re-aplicado (firma intacta; ledger best-effort logueado). Hard-tests: backfill en vivo + 4/4 rollback. Coordinación respetada con el carril cancelaciones (b047–b051). **Split ACTIVADO y validado en vivo (2026-08-10):** `MP_CLIENT_ID`/`MP_CLIENT_SECRET` puestas en Vercel producción (app `Ketzal_app` id `8055388991453386`, credenciales productivas del fundador vía MCP de Mercado Pago, nunca impresas a pantalla) + Redirect URI configurado a mano en el panel de MP (`.../api/mp/oauth/callback` — sin endpoint de API para esto, es manual una vez por app). Primer connect real: **Wanderlust Travels Jrz** vía `/proveedores/[id]` → botón → autorización MP → `mp_accounts` con `mp_user_id=479630144` (mismo user que el pago SPEI de prueba validado en 2026-07-10), deny-all confirmado (RLS on, 0 policies, sin GRANT anon/authenticated). Regresión post-connect: `verificar_invariantes` 0, `ledger_entries` suma $0.00 sin cambio (el connect no mueve dinero), advisors security 0 ERROR, `tsc`+vitest (75) limpios. Pendiente: conectar a Border Travels (y demás agencias) + validar `fee_cobrado_split` con una venta real cobrada en línea.
>
> **Operación de viaje + pagos SPEI + notificaciones — COMPLETA + validada por el fundador en prod (2026-08-03/04, migraciones b034–b046, doc en `docs/OPERACION_VIAJE.md`).** El marketplace pasó de "cobrar en línea" a operación turística completa. **Pagos**: SPEI directo a la CLABE de cada agencia (en `suppliers.info`, validador de dígito de control) + depósito en efectivo en cajero BBVA (tarjeta con Luhn), **comprobante obligatorio** (imagen → `receipt_url`), pendiente en `payment_intents` (sin status nuevo de booking), aprobación del admin en /cobranza (+card en la venta +KPI en Panel), rechazadas visibles/reabribles; **un solo camino de dinero** (`confirm_online_payment` +`p_method`, webhook MP intacto). **Notificaciones (b036)**: campana in-app casi-tiempo-real + Web Push con app cerrada (VAPID en Vercel; tabla `notifications` del scaffold REUSADA — shape `message`/`action_url`); 6 eventos best-effort. **Plan de pagos**: checklist verde/ámbar/rojo contra el pagado real (viajero + admin), plan congelado con pagos, fecha límite automática = última del plan. **Viajeros/asientos**: el comprador registra acompañantes (misma tabla F3 ⇒ manifiesto gratis) y elige asiento en layout por `services.transport_type` (autobús 2+2/sprinter/van/avión; total = cupo de la salida; unique(salida,asiento) anti-carrera; guard dual con **coalesce(false)** — lección: guard SQL sin coalesce evalúa NULL con ajenos y no dispara). **Voucher**: asientos + QR firmado (HMAC del uuid, llave derivada del service key) → **/abordaje**: escáner (BarcodeDetector) + check-in por pasajero (`boarded_at/by`, staff-only, idempotente). **Vitrina/precios**: ficha con calendario de salidas (pasadas tachadas), **temporadas** (`price_pct` por salida, autoritativo con snapshot), precio "desde" **derivado** del pack más barato (campo manual eliminado). **Buslist/Roomlist** por salida (RPC nuevo `departure_lists`, guard dueña; buslist por asiento con abordaje, roomlist por ocupación para el hotel). Re-applies aditivos documentados en el doc (conservar keys); hard-tests SQL en rollback por capa (2 huecos de seguridad cazados antes de deploy); 75 tests. **Contabilidad en pruebas**: ventas QA activas pendientes de reversar con el fundador.
>
> **Tests de app — primera red sobre las rutas de dinero (2026-07-23, P0 del re-FODA).** La app tenía **0 tests** (el dinero solo estaba cubierto por los SQL hard-tests en la BD). Se montó **vitest 3** (`pnpm test` = `vitest run`; `vitest.config.ts` environment node, `include src/**/*.test.ts`; devDep + lockfile) y se escribió la red en `src/lib/domain/` — **53 tests en verde**. **Enfoque:** solo **lógica pura** (determinística, sin BD — respeta que la BD de prod es compartida; el comportamiento de los RPCs sigue cubierto por `supabase/tests/*.sql`). **Patrón senior:** cada helper vive **puro en `domain/` y su ruta lo importa de vuelta**, para que el test cubra el código que corre (no una copia que diverja). Módulos: **`pricing`** (9: importe de venta Σcant×precio−descuento), **`balance`** (8: **regla de oro #2** saldo derivado total−pagos+reembolsos, solo COMPLETED), **`packs`** (7: `limpiarPacks` valida/dedup/orden/label/redondeo) — PR **#62**; **`monto-en-letra`** (13: cantidad con letra del recibo, **extraída de `/recibo`**), **`currency`** (7: `round2`/`toMxn`/`toUsd` de F6, **usados ahora por el form de venta y el detalle**), **`payment-plan`** (9: `conSaldoCorrido` saldo corrido —lo usa la tabla del plan— + `planCuadra` invariante suma=total; la aritmética del calendario sigue en el RPC) — PR **#63**. Refactors behavior-preserving; `tsc`+`build` limpios; sin tocar `database.types.ts` ni la BD. **Ampliación + CI (2026-07-23, PR #65):** guard de cobro **`validarCobro`** (`domain/abono.ts`, monto `>0` y `≤ saldo`, extraído de `abonos.tsx`) + **CI en GitHub Actions** (`.github/workflows/test.yml`: `tsc --noEmit` + `pnpm test` en cada PR y en `main`; Node 22/pnpm 10, frozen lockfile). **Suite total: 57 tests**, y ahora la red **bloquea automáticamente** cualquier PR que la rompa. El CI quedó **en verde** tras destrabar un candado de billing de la cuenta de GitHub (tarjeta vencida/sin saldo → *authorization hold failed* → runners bloqueados; el fundador actualizó/recargó la tarjeta y Actions arrancó). Repo público ⇒ Actions gratis. **Cobranza/comisiones NO se testearon en TS a propósito:** su dinero (atraso, `comisión=round(total·rate/100)`) se calcula en los RPCs (`cobranza`, `commissions_summary`), no en el cliente — testear una copia TS divergiría del RPC autoritativo; ya cubiertos por los SQL hard-tests. **Follow-ups:** subir a integración de server actions.

> **FODA de UI/UX — corte marketplace, ciclo 11 (2026-08-10, worktree `marketplace-ux`, doc en `docs/UI_UX_FODA.md`).** Auditoría en vivo (no solo código) de `/explora`, `/servicio/[id]`, `/agencias` contra producción real. **Hallazgo P0 (dato, no código):** un listing de QA ("TEST compra Menny", $5, sin foto) estaba **publicado y visible a cualquier visitante** — despublicado con confirmación del fundador. **4 fixes de UI (código, con permiso "P1 del marketplace completo"):** overlay de precio **generado por el sistema** en toda tarjeta de `/explora` (antes el único precio grande dependía de que la agencia lo quemara en su flyer, con formato inconsistente); normalización de títulos TODO-MAYÚSCULAS a Capitalizado para mostrar (`lib/display-title.ts` `tituloVisible`, solo visual — metadata/SEO cruda intacta) en tarjeta y ficha; placeholder de marca (`BrandMark` reusado) para servicios sin foto — cierra un hueco no detectado antes: la ficha (`carrusel.tsx`) renderizaba **nada** sin fotos; tarjeta CTA "¿Tienes una agencia?" en el directorio `/agencias` (dashed, enlaza a `/login`) para que 2 agencias no se lean como vacío. Verificado en vivo con `pnpm dev` (no solo build): catálogo 3→2 tras despublicar, overlay consistente, título normalizado en tarjeta+ficha (tab title sigue crudo), CTA renderiza. `tsc`+`build`+`vitest` (75) limpios. Pendientes anotados en el FODA: pulido de secciones nuevas (Cuentas/Gastos/Salidas/Comisiones) con los primitivos de ciclos 1–10, y filtros de `/explora` a un Sheet en móvil.

> **Pulido UI/UX — Cuentas/Gastos/Salidas/Comisiones, ciclo 12 (2026-08-10, worktree `ops-polish`).** Seguimiento del pendiente P2 del ciclo 11: repasar las secciones nuevas contra los primitivos de ciclos 1–10. **La mayoría ya estaba alineada** (PageHeader/EmptyState/DataList/toasts son el default incluso en carriles de backend). 3 fixes concretos: `/salidas/[id]` tenía la única tabla cruda de 5 columnas fuera de documentos imprimibles (scroll horizontal en móvil) → migrada a `DataList`; "Revertir gasto" en `/gastos` usaba `window.prompt()` nativo para el motivo → formulario inline (`Textarea` + Confirmar/Cancelar); "Liquidar" en `/cuentas` usaba `window.confirm()` → confirmación inline con el monto. Comisiones sin hallazgos. No se pudo verificar visualmente autenticado (Cuentas/Gastos/Salidas piden login, a diferencia de la vitrina del ciclo 11) — verificado por `tsc`+`build`+`vitest` (75) reusando primitivos ya probados. Pendiente anotado: mismo antipatrón `window.confirm` en `/cobranza` (`spei-pendientes.tsx`), fuera de alcance de este ciclo.

> **Remate UI/UX — Sheet de filtros + `/cobranza` sin diálogos nativos, ciclo 13 (2026-08-10, worktree `ui-remate`).** Cierra los 2 pendientes de los ciclos 11-12. **`/explora`**: diagnóstico corregido en vivo (viewport móvil real) — el problema no era una fila densa (ya iba apilada) sino 5-6 controles de ancho completo empujando los resultados fuera de pantalla. Ahora móvil solo muestra buscador + botón "Filtros" (badge con conteo), el resto vive en un `Sheet` bottom (mismo patrón del "Más" del tab bar) con "Limpiar"/"Ver N viajes"; desktop intacto, mismo bloque JSX reusado (no duplicado en lógica). **`/cobranza`** (`spei-pendientes.tsx`): las 3 acciones que usaban `window.confirm()` (aprobar/rechazar SPEI, reabrir rechazada) pasan al mismo patrón de confirmación inline de ciclo 12. Verificado en vivo con viewport móvil real (390×844): Sheet abre/filtra/cierra correctamente. `tsc`+`build`+`vitest` (75) limpios. **FODA de UI/UX del corte marketplace + back-office: cerrado (ciclos 11→13).**

> **b054 — Comisión por AGENTE individual (2026-08-10, worktree `comision-agente`, doc en `docs/COMISIONES_MOTOR.md`).** Extiende el motor de comisiones (b019+) y el ledger balance-0 (b052) con un 4º `payee_type`/`account_type`: **`agente`** (por `profile_id`, calco exacto de embajador) + una 4ª `basis`: **`hibrido`** (% de la venta + fijo por pasajero, LOS DOS a la vez — pedido explícito del fundador). **Auto-generación por venta**: nuevo bloque en `tg_commission_snapshot` que resuelve tarifa para `bookings.sold_by` (opt-in — sin tarifa configurada, no pasa nada, igual que embajador); el "a cargo" en el ledger sigue siendo la agencia vendedora (mecánica ya genérica del trigger). Tarifa **por agente, no por servicio** (una sola, YAGNI). `tg_ledger_mirror_commission` reescrito de un `else` implícito (asumía "todo lo que no es plataforma/agencia es embajador") a un `case` explícito por tipo — ya no es seguro con 4 payee_type. Funciones re-aplicadas aditivamente (DDL vivo leído antes): `commission_amount`, `resolve_commission_rule`, `set_commission_rule` (+guard: admin de la MISMA agencia del agente, o superadmin), `tg_commission_snapshot`, `tg_ledger_mirror_commission`, `ledger_statement`/`settle_ledger` (+`agente` en listas blancas). `ledger_summary` no necesitó cambios (ya genérico por `auth.uid()`). RPC nuevo `list_agents_for_commission` (agentes de la agencia + su tarifa vigente, RLS de `commission_rules` no deja leer `agente` directo). **App**: card "Tarifa de agentes" en `/comisiones` (solo admin de agencia, no superadmin — decisión sobre su propio margen); `/cuentas` deja de ser `adminOnly` en el nav (un agente con tarifa propia necesita ver su saldo; la protección real siempre vivió en los RPCs, nunca estuvo en `ADMIN_HREFS`). **Hard-test en vivo en prod** (agencias reales, limpiado después vía `set request.jwt.claim.sub` — técnica ya usada en los hard-tests adversariales de este repo): 5%+$50/pax sobre venta de 2 pax×$1,000 → comisión $200.00 exacto → ledger espeja correcto (suma global $0.00) → self-view del agente funciona → limpieza completa (cancelar + reverso de comisión + tarifa de prueba desactivada). `verificar_invariantes` 0 antes/después, advisors 0 ERROR, `tsc`+`build`+`vitest` (75) limpios. No se pudo verificar la UI visualmente (mismo límite de sesión que ciclos 12/13: rutas piden login). **Pendiente:** superadmin sin agencia propia no puede configurar tarifas de agente hoy (necesitaría selector de agencia, YAGNI); tarifa por servicio (hoy agencia-wide, fácil de agregar después). Espejo `db/proposed/b054_comision_agente.sql`.

> **MCP de Ketzal OS — operar el sistema en lenguaje natural (2026-08-19, worktree `mcp-server`, PR #68, doc en `mcp/README.md`).** Servidor **MCP** (`mcp/`, paquete aparte al estilo de `wa-sender/`) que expone Ketzal OS a cualquier agente IA de terminal (Claude Code, Cursor, Codex, Windsurf, Zed): *"¿a quién le cobro esta semana?"*, *"registra un abono de $2,000 a la venta de Meny y emite el recibo"*. **Cero migraciones, cero cambios de BD** — consume los RPCs que ya existen. **Tesis de seguridad (heredada del MCP de `pokedex-manager`, mejorada):** se autentica como **usuario real** contra Supabase Auth y opera con su JWT ⇒ la RLS por agencia y los guards de los RPCs deciden qué ve y qué puede hacer; **nunca service role key**. Del disco sólo sale el `refresh_token`, en `~/.config/ketzal/session.json` (0600) — la contraseña no se guarda y el config del cliente MCP queda sin secretos (pokedex ponía `POKEDEX_PASSWORD` en texto plano; para una cuenta con dinero real no aplica). Otras mejoras sobre pokedex: TypeScript publicable a npm (`npx -y ketzal-mcp`, sin venv ni rutas absolutas) y **32 tools curados sobre 111 RPCs** en vez de exponerlos 1:1 (cada schema vive en el contexto del LLM en cada turno). **Transporte:** `fetch` crudo a GoTrue + PostgREST con `Content-Profile: ketzal`, portado de `supabase/tests/concurrencia.mjs` ⇒ **sin dependencia de `@supabase/supabase-js`** (deps totales: `@modelcontextprotocol/server` v2 + `zod`) y sin importar el `database.types.ts` stale. **Frenos de dinero** (ledger append-only): `confirmar: true` obligatorio en las 8 tools de dinero; `ketzal_cancelar_venta` exige **repetir la penalización** del preview (la pena sube por tramos de fecha ⇒ un preview viejo cae en otro tramo); tope de 20 escrituras por proceso (anti-bucle); **las devoluciones de Mercado Pago se rechazan a propósito** (el dinero sale primero por la API de MP, que vive en la app — asentar sólo el ledger diría "devuelto" con la tarjeta aún cobrada). **Bug atrapado al validar contra el esquema vivo:** `p_down_pct` de `preview/generate_payment_plan` es **fracción** (default `0.20`), no porcentaje — la app manda `pct/100`; el MCP mandaba `20` crudo = enganche de 20 veces el total. **Verificación:** 38 tests, incluido un **handshake MCP real contra el binario** (lo único que caza un `console.log` suelto, que corrompe stdout y tumba la sesión en todos los clientes); contra la BD de prod (sólo lecturas de metadatos) los 38 RPCs existen, son ejecutables por `authenticated` y sus parámetros coinciden, y las 80+ columnas referenciadas existen; `tsc`+`build` raíz limpios, 75 tests de dominio intactos. **Riesgo pre-existente que deja al descubierto:** autenticarse como usuario real da RLS **pero no los gates de UI** (`isAdminRoute`, `navItemsForRole`, el gate de persona viven sólo en TS) — un JWT `role='user'` ya puede hoy llamar por PostgREST cualquier RPC con `grant execute to authenticated` sin guard de rol en SQL, desde la consola del navegador y sin MCP. **El MCP no crea el hueco; lo vuelve trivial en lenguaje natural.** Por eso **no filtra tools por rol** (sería teatro) y el README lo dice textual; auditar esos guards es carril aparte, recomendado antes de repartir el MCP a agentes de agencia. **Superficies compartidas tocadas (mínimo):** `tsconfig.json` (+`"mcp"` en `exclude`: el `include` raíz es `**/*.ts` y compilaría el paquete con la config de Next), `.vercelignore` (+`mcp/`), `.github/workflows/test.yml` (job propio: install→typecheck→**build**→test; el build va antes porque el handshake arranca `dist/index.js`). `pnpm-workspace.yaml` sin tocar: `mcp/` tiene su propio lockfile ⇒ el del repo no cambia y el `--frozen-lockfile` del CI sigue verde. **Fuera de v1 a propósito:** alta/edición de servicios (el importador con Groq vision se estaba probando en vivo en otro carril), equipo/invitaciones/roles, ajustes de plataforma, `settle_ledger`, transporte HTTP remoto. **Mergeado y validado en vivo (2026-08-19, `63d454f` + `4852dfc`):** sesión real del fundador (superadmin), las 11 tools de lectura responden contra la BD y los números cuadran (7 clientes, 3 cotizaciones, ledger $0.00, invariantes 0); por el protocolo MCP real, un abono sin `confirmar` se rechaza en la validación del schema y un `P0001` llega verbatim. **Dos fixes salieron al probarlo:** `readline` se colgaba sin stdin (ahora correo y código van como argumentos, y sin TTY lo dice en vez de esperar) y la plantilla de correo del proyecto es la de **Magic Link** — manda liga, no código de 6 dígitos ⇒ `login "<liga>"` extrae el `token_hash` y lo canjea por POST contra GoTrue, sin navegador ni tocar la config de auth de producción. **Pendiente:** `{{ .Token }}` en la plantilla de Magic Link del dashboard (para que el correo traiga también código), reservar `ketzal-mcp` en npm (hoy libre — quien lo squattee ejecuta código en la máquina de quien siga el README) y el secret `CLAUDE_API_KEY` (sin él `security-review.yml` se cuelga hasta el timeout de 6h; esta revisión se corrió a mano, 0 hallazgos tras verificación adversarial).

> **MCP v0.2 — el MCP ya crea y edita catálogo (2026-08-23).** De 33 a 38 tools: `crear_servicio`, `editar_servicio`, `crear_salida`, `editar_salida`, `editar_cliente`. Cierra el "fuera de v1 a propósito" del alta/edición de servicios (el riesgo era colisionar con el carril del importador con Groq vision) y **retira del README el workaround de `carga.mjs`**, que llamaba `insert`/`update` crudos desde un script suelto. **Cero migraciones, cero RPCs nuevos:** escribe a `services` / `service_departures` / `customers` por PostgREST y la RLS decide (`services_insert/update` = agencia dueña o superadmin; `service_departures_owner` vía EXISTS al servicio). **La edición es PARCIAL**, a diferencia de la app, que manda el formulario completo: sólo viajan los campos que el agente mandó, así un LLM que manda medio formulario no borra la descripción ni el itinerario. Las listas (`paquetes`, `incluye`, `itinerario`, `faqs`) sí se reemplazan enteras y el README lo dice. El precio "desde" se sigue **derivando** del pack más barato (b046), nunca se escribe a mano. **Dos frenos nuevos:** el tope anti-bucle se partió en dos cupos — `MAX_WRITES` 20 para dinero, `MAX_DATA_WRITES` 100 para ediciones — porque cargar un catálogo de 12 viajes con sus salidas agotaba el cupo del ledger; y `spendWrite()` tiene default `dinero`, para que una tool nueva que olvide declararse caiga en el cupo estricto, no en el ancho. Los errores de constraint que llegaban genéricos (23505 unique de fecha, 23514 cupo por debajo de lo vendido) se pre-chequean para que el agente reciba un mensaje accionable en vez de "no cumple una restricción". **Hard-test en vivo contra prod con limpieza** (servicio + salida + cliente bajo Border Travels): 18 checks verdes — precio derivado, edición parcial que no pisa lo demás, fecha pasada / inexistente / duplicada bloqueadas, id ajeno no responde ok, cupo por debajo de lo vendido bloqueado. 51 tests (eran 38). **Hallazgo:** `customers` **no tiene policy de DELETE** (la app tampoco borra clientes) ⇒ un hard-test que da de alta un cliente deja residuo que la propia sesión no puede quitar; hay que borrarlo con `service_role`. Se hizo el mismo día (migración `limpieza_datos_prueba_20260823`), junto con las 3 cuentas QA y el servicio `TEST compra Menny`. **Sigue fuera:** fotos y video (hay que subir el archivo a Storage), equipo/invitaciones/roles, ajustes de plataforma, `settle_ledger`.

> **Ficha pública — compartir, carrusel automático, logo de agencia, LADA y ojito (2026-08-24, carril frontend).** Cuatro pedidos del fundador sobre `/servicio/[id]` mientras backend movía el carrito, más el ojito de contraseñas a media tarea. **Compartir** (`src/components/public/compartir.tsx`): WhatsApp, Facebook, X, Telegram, copiar link y la hoja nativa del sistema donde el navegador la soporta (se detecta tras montar, si no rompe la hidratación); el mensaje **reusa `descripcionSocial(s)`**, la misma línea del preview social, para no tener una segunda fuente redactando cifras. Lucide ya no trae íconos de marca, así que en vez de inventar paths de SVG se usa un glifo correcto por construcción (la "f", la X de dos trazos) o el ícono genérico que de verdad corresponde (Telegram ES un avión de papel). **Carrusel automático**: 5 s por foto, se detiene con puntero encima / foco dentro / pestaña oculta / navegación manual (ahí gana la intención y ya no se reanuda), nunca arranca con `prefers-reduced-motion` y lleva botón de pausa (WCAG 2.2.2). **`AgenciaLogo`** (`src/components/public/agencia-logo.tsx`): el bloque logo+inicial estaba **copiado** en `/agencias` y `/agencia/[id]`; la ficha necesitaba una tercera medida ⇒ primitivo con 3 tamaños y las dos copias migradas (neto: menos código). **Bug que ni `tsc` ni `next build` ven:** el logo iba dentro del `<p>` de "Ofrecido por" y un `<div>` ahí es HTML inválido ⇒ **error de hidratación**; sólo aparece en el log del navegador. Ahora es un `<span> inline-flex`. **LADA por país — casi un pisotón:** `PhoneInput` **ya existía** (`b40453d`, MX/US/CA) y lo usan 3 formas de ops (nueva venta, cliente, proveedor); la primera versión de este carril lo reescribió y **le cambió el formato de guardado** (de `"+52 656 123 4567"` a 10 dígitos pelones). Se detectó porque `git status` lo marcó `M` y no `??`. Se restauró y se **extendió**: 27 países con banderas (emoji derivado del ISO, cero assets), mismo contrato y mismo formato; sus `parse`/`compose` bajaron a **`lib/domain/phone.ts`** (patrón del repo: helper puro + la ruta lo importa de vuelta) y ahí salió el riesgo real — con 27 ladas `+1` puede comerse un `+591`; el orden por longitud ya lo cubría pero **nada lo verificaba**. El diff del componente quedó en −6 líneas. `/entrar` y el perfil del viajero pasaron de input pelón a ese selector. **`PasswordInput`** con ojito en los **6** campos de contraseña; el botón va fuera del tabulado (desde la contraseña se pasa al botón de enviar, no a un control opcional) y usa `aria-pressed`, porque quien no ve el ojo necesita saber si la contraseña está a la vista. **Verificado en vivo con el navegador, no sólo con el build**: auto-avance contra el reloj, los 5 destinos de compartir con su payload, logo inline, selector sin recorte a 96px, ojito alternando `type`/`aria-pressed` (sin capturar la contraseña real en pantalla). 92 tests, `tsc`+build limpios. **Coordinación:** se tocó `comprar/[serviceId]/comprador-forms.tsx` (2 líneas, sólo el campo de contraseña) que es del carril del carrito.

> **b069 — Conectar WhatsApp desde `/ajustes` (2026-08-24).** El pareo del número dedicado vivía en la box: `pm2 logs` para ver el QR y un `update app_settings` a mano para prender el gate. Ahora se opera desde la app (superadmin). **El problema de fondo y su solución:** la app está en Vercel y el bridge de Baileys corre en una box **detrás de NAT** ⇒ la app **no puede llamar a la box**. Pero el bridge ya tenía cliente de Supabase con service role (lo usa para el opt-out entrante STOP/BAJA), así que la tabla nueva **`ketzal.wa_session`** (fila única) es el buzón en los dos sentidos: la box publica `state`/`qr`/`wa_number`/`last_seen_at` y lee `command`. Nada de túneles ni de un secreto nuevo. **Seguridad:** lectura sólo superadmin (el QR autoriza ligar un dispositivo a la cuenta de WhatsApp), escritura sólo `service_role` + el RPC **`wa_send_command`** con guard (`restart` | `logout`, lista blanca — un comando inventado se rechaza); `authenticated` no tiene INSERT/UPDATE de tabla (la familia #1 de bugs de este repo). El QR **rota cada ~20 s** por diseño de Baileys ⇒ la UI sondea cada 4 s mientras espera, 30 s ya conectada, y **descarta uno más viejo de un minuto**; el `command` también lo borra, para que no quede un QR muerto en pantalla mientras la box reinicia. **`last_seen_at` es load-bearing:** sin latido no se distingue "desconectado" de "la box está apagada", que es la diferencia entre esperar y ir a prenderla. **App:** tarjetas *Número de WhatsApp* (estado, latido, QR, Generar QR / Desligar con confirmación inline) y *Envío automático de Clawbot* (switch del gate, tope diario, y "Generar recordatorios" que corre el mismo motor que el cron — idempotente por `dedupe_key`). **Prender el gate manda WhatsApps reales a clientes reales**, así que pide confirmación explícita y dice cuántos van a salir; el conteo del outbox cruza agencias ⇒ va con service role **después** del guard de superadmin, nunca antes (el service role se salta la RLS). El QR se convierte a imagen en el servidor para que `qrcode` no entre al bundle del cliente. **Bridge** (`wa-sender/bridge.mjs`): publica en cada transición, latido cada 30 s, sondeo de comandos cada 6 s, y **consume el comando borrándolo ANTES de actuar** — si `logout` mata el proceso, PM2 lo revive y no queremos que lo repita en bucle. Todo best-effort: sin service key en la box el bridge se comporta **exactamente** como antes (se opera por los logs de PM2). Hard-test en vivo con rollback: privilegios correctos, superadmin ve la fila y el admin de agencia no, admin bloqueado del RPC, comando inventado rechazado, `restart` borra el QR viejo (ojo al probar RLS: sin `set local role authenticated` la RLS no aplica porque `postgres` es dueño ⇒ falso positivo). Espejo `db/proposed/b069_wa_session.sql`; runbook actualizado en `wa-sender/DEPLOY_STATUS.md`. **No verificado a ojo:** `/ajustes` pide sesión y esta sesión no tiene navegador autenticado — igual que `/usuarios` (b066) y los ciclos 12/13. **Sigue pendiente lo de siempre:** el número dedicado y pegar el `SUPABASE_SERVICE_ROLE_KEY` en la box; hasta entonces la tarjeta dice "servidor sin señal", que es justo lo que debe decir.

> **b066 — hCaptcha en Auth + tracker de usuarios (2026-08-23).** Nace de la cuenta ajena del 2026-07-19 (`hi.huchi0099@gmail.com`): alguien creó un usuario golpeando directo `POST /auth/v1/signup` con la publishable key —que viaja en el bundle del navegador por diseño— y pidió recuperación 110 ms después. Inofensivo (sin fila en `profiles` la RLS no da nada) pero gratis, y **reconstruir su origen tomó media hora de SQL forense**: `auth.audit_log_entries` está en **0 filas**, así que Auth no deja rastro propio y la única evidencia con IP vive en `auth.sessions`, que se borra al cerrar sesión. **(a) hCaptcha** en los 5 puntos de Auth de la app (magic link y contraseña en `/login`, contraseña y alta en `/entrar`, alta en `/comprar`, recuperación en `/recuperar`; Google OAuth no lo necesita). Componente único `src/components/auth/captcha.tsx`: **sin `NEXT_PUBLIC_HCAPTCHA_SITE_KEY` no renderiza nada y el token va vacío**, así que la app se comporta igual antes y después de prender el switch — el orden obligatorio es variable en Vercel + redeploy **primero**, switch de Supabase después, o Auth rechaza todos los logins hasta que llegue el deploy. El token es de un solo uso: cada formulario resetea el widget tras un intento fallido, o el siguiente envío va con uno quemado y el error que ve la persona es el equivocado. **Ojo con el MCP:** con la protección prendida, `ketzal-mcp login` deja de funcionar (Supabase protege `/otp`, `/token` y `/recover`, no `/verify` ni el refresh) — las sesiones ya guardadas siguen vivas indefinidamente porque el refresh no está protegido. **(b) Tracker**: tabla **`ketzal.user_events`** (append-only: RPC-only-write + trigger propio `tg_bitacora_inmutable` —no se reusó `tg_ledger_inmutable` porque su mensaje habla de asientos y refunds—; **SIN foreign key a `profiles` a propósito**: el valor de una bitácora es sobrevivir al borrado de la cuenta, que es justo lo que se perdió con huchi; snapshot del correo por lo mismo) + RPC `log_user_event` (guard: sobre uno mismo, sobre tu agencia si eres su admin, o cualquiera si eres superadmin; `service_role` pasa por el claim para el alta del comprador, que corre sin sesión). Se registran login por contraseña (vía **`/api/track/login`**, endpoint y no llamada directa **porque la IP sólo se conoce en el servidor**), login por enlace/Google (en `/auth/callback`), alta de comprador, y cambios de rol/agencia/activación desde `/equipo` — todos best-effort vía `src/lib/tracker.ts`: una auditoría que puede tumbar un cambio de rol se acaba quitando. **Expediente**: `user_account_detail` (perfil + `auth.users` con proveedores, `recovery_sent_at` e `invited_at` —los campos que delataron a huchi— + sesiones vivas con IP), `user_timeline` (une la bitácora con **13 fuentes derivadas**: ventas, compras, pagos, devoluciones, recibos, clientes, comisiones, ledger, solicitudes, invitaciones, notificaciones — **no duplica ni un dato de negocio**) y `list_users`. **App**: `/usuarios` (lista con búsqueda y filtros) y `/usuarios/[id]` (expediente), `adminOnly` **y no superadminOnly**: el admin de agencia audita a su propio equipo y `can_view_user` lo acota a su agencia; + botón "Expediente" en cada fila de `/equipo`. Hard-test adversarial en vivo con rollback (11 checks): agente raso bloqueado para escribir bitácora ajena pero no la propia, expediente e historial ajenos denegados, `list_users` devuelve 1 al agente raso y 4 al superadmin, DELETE sobre la bitácora bloqueado. Residuo 0, `verificar_invariantes` 0, advisors **0 ERROR**, 80 tests. Espejo `db/proposed/b066_user_tracker.sql`. **Superficie compartida tocada:** `package.json`/lockfile (dep nueva `@hcaptcha/react-hcaptcha`), `nav-items.ts` y `access.ts` (+`/usuarios`).

> **b056 — F3: el ledger espeja los créditos del viajero (2026-08-19).** Cierra el pendiente F3 de `docs/FINANZAS_PLATAFORMA.md`. Los créditos por cancelación ya existían (b049) pero el ledger balance-0 (b052) no los reflejaba: el viajero no tenía cuenta en `/cuentas` y la deuda entre agencias por canje cruzado no se veía. **Se espeja, no se recrea** (mismo criterio que `commission_lines`): dos triggers nuevos y **cero cambios a `cancel_booking_v2` y `redeem_credit`**. Emisión (trigger sobre `credits`): viajero **+monto** / agencia emisora **−monto**. Canje (trigger sobre `payments` con `credit_id not null`): viajero **−monto** / agencia vendedora **+monto**. Al netear un canje cruzado queda emisora −X y vendedora +X ⇒ **la deuda inter-agencias sale derivada**, sin reporte aparte. **Sin doble conteo**: `cancel_booking_v2` inserta el refund de emisión con método `credito` pero **sin `credit_id`** (sólo `redeem_credit` lo pone), así que el trigger de canje no lo ve — verificado leyendo el DDL vivo de ambos. **No hizo falta columna nueva ni re-aplicar `ledger_post`**: la trazabilidad ya es derivable (canje → `payment_id` → `payments.credit_id`; emisión → `booking_id` → `credits.booking_origen_id`). `ledger_summary`/`ledger_statement` **no se tocaron**: ya contemplaban `viajero` desde b052 y resuelven la self-view por `account_profile_id`. **Línea roja cerrada**: `settle_ledger` ahora **rechaza `viajero`** — el crédito es redimible en Ketzal, no retirable; antes de b056 no había saldos de viajero así que era imposible en la práctica, ahora que existen había que blindarlo o el superadmin podía convertir un crédito en salida de efectivo (territorio fintech/CNBV que se decidió no pisar). `/cuentas` gana las etiquetas de los 2 kinds nuevos y deja de ofrecer "Liquidar" en cuentas de viajero. **Hueco conocido y documentado**: la cuenta del viajero se nombra con `customers.marketplace_customer_id`; un cliente dado de alta por un agente puede no tenerlo ⇒ no se espeja (WARNING en el log), el crédito sigue válido y usable, sólo no aparece en `/cuentas`. **Hard-test en vivo con rollback garantizado** (venta $1,000 en Wanderlust cancelada a crédito + canje **parcial** de $600 en una venta de **Border**): viajero **+400.00** (= saldo real del crédito), Wanderlust **−1,000.00**, Border **+600.00**, **balance global $0.00**, `settle_ledger('viajero')` **bloqueado**; rollback verificado (todo a 0), invariantes 0, advisors **0 ERROR**. Los advisors sí destaparon que las funciones de trigger quedaban ejecutables por `anon` vía PostgREST ⇒ `REVOKE` (no apaga el trigger: Postgres verifica el permiso al **crear** el trigger, no al dispararlo). Queda igual el mismo advisor heredado en `tg_ledger_mirror_commission` de b052. Espejo `db/proposed/b056_ledger_creditos_viajero.sql`.

> **Reset a 0 para operación real (2026-08-19).** Segundo reset (el primero fue 2026-08-08). A diferencia de aquel, este **conserva el catálogo**: se borró solo la capa transaccional en un DO block atómico que bajó los 8 guards `no_mutar`/`ledger_no_mutar` y los re-armó — bookings 19→0 (y en cascada booking_items, booking_passengers, payment_schedule, seat_assignments, vouchers, clawbot_reminders), payments 10→0, payment_intents 13→0, receipts 3→0, customers 7→0 (los 7 eran de prueba: Walfre, Jimmy Traveler, QA Comisión Agente y Manuel Escapite duplicado), commission_lines 10→0, ledger_entries 20→0, expenses 2→0, ratings, notifications 31→0, y los folios (`receipt_counters`, `doc_counters`) vaciados ⇒ el próximo recibo/cotización arranca en 1 (ambos RPCs hacen `insert … on conflict do nothing` + `+1`). **Conservado:** 14 servicios y sus 9 salidas (el otro carril estaba cargando el catálogo real de Border Travels en ese momento), 2 agencias, 4 perfiles, `app_settings` y la conexión de Mercado Pago de Wanderlust (`mp_accounts`). Verificado después: todo en 0, catálogo intacto, `verificar_invariantes` 0, los 8 guards activos y mordiendo (un DELETE sobre `payments` vuelve a levantar *"ledger append-only"*), y las tools del MCP confirman 0 desde la sesión real. **Queda vivo un residuo de QA sin efecto:** la `commission_rule` de b054 (agente, híbrido 5%+$50/pax) sigue en la tabla pero con `active=false`.

> **b055 — Cobranza: solo ventas cerradas, no cotizaciones (2026-08-19).** Salió al contrastar el MCP contra la BD: `/cobranza` reportaba $13,000 de saldo y $2,700 de atraso que eran **3 cotizaciones abiertas**. El filtro de `ketzal.cobranza()` era `status <> 'cancelled'`, que dejaba entrar `draft` — una cotización todavía no es una venta, nadie se comprometió a pagarla. Ahora es lista blanca explícita `in ('reserved','confirmed','paid')`: si mañana entra un estado nuevo al enum, no se cuela solo a la cobranza. Re-aplicación **aditiva desde el DDL vivo** (sigue `LANGUAGE sql STABLE` e INVOKER — la RLS por agencia es la que acota, no hay guard que preservar; misma forma del jsonb, mismas keys, mismo orden; sólo cambia el WHERE). Las cotizaciones no se tocan: siguen en `/cotizaciones` con su folio COT-n, el Panel las sigue contando y la regla de Clawbot `cotizacion_sin_cerrar` las sigue persiguiendo. **Sin cambio de firma ⇒ cero cambios de código** (la consumen `src/app/(ops)/cobranza/data.ts` y el MCP, ambas sin argumentos; ninguna otra función de la BD la llama, verificado contra `pg_proc`). Hard-test con rollback garantizado (RAISE dentro de un DO block): antes 3 ventas/$13,000/$2,700 → después 0/$0/$0, control de ventas cerradas con saldo = 0 ✓, y el **caso positivo** — la misma cotización promovida a `reserved` vuelve a contar ($4,500) y el rollback la dejó en `draft`. Invariantes 0, advisors **0 ERROR**. Espejo `db/proposed/b055_cobranza_solo_ventas_cerradas.sql`.

> **WhatsApp auto-envío + server (box) — estado (2026-07-23).** Motor que manda los recordatorios de Clawbot (`ketzal.clawbot_reminders`) por WhatsApp **sin API oficial** (Baileys + PM2 en una box fuera de Vercel, número dedicado), todo tras el gate `app_settings.wa_auto_enabled` (**OFF por default** ⇒ hoy cero envíos reales). Código en **`wa-sender/`** (`bridge.mjs` socket Baileys + HTTP loopback `POST /send`; `poller.mjs` lee el outbox, respeta gate+ventana hábil MX+cap 24h+blocklist `wa_optout`+claim atómico+jitter); runbook vivo en **`wa-sender/DEPLOY_STATUS.md`**. **Esta sesión (backend, mi carril):** (1) **la capa BD entró al ledger** — antes vivía solo por `execute_sql`/espejo; migración **`ketzal_wa_autosend`** idempotente (verificada contra el DDL vivo: `wa_optout`, `app_settings.wa_auto_enabled`/`wa_daily_cap`, `clawbot_claim_pendientes`/`clawbot_marcar_bot`, status check ya estaban live). (2) **`saldo_sin_plan` (F7) agregado al allowlist** de `clawbot_claim_pendientes` (BD + espejo `db/proposed/016_wa_autosend.sql` + DRY-RUN del poller) — es kind dirigido al comprador; los otros 2 de F7 (`viaje_manana_operativo`, `pago_sin_recibo`) siguen fuera a propósito por ser **internos**. (3) **matcher de opt-out entrante STOP/BAJA** en `bridge.mjs` (`messages.upsert`, solo 1-a-1, mensaje = `STOP|BAJA|ALTO|CANCELAR|UNSUBSCRIBE|NO MORE`) → inserta el teléfono a 10 dígitos en `wa_optout` vía service-role; best-effort (sin `SERVICE_ROLE_KEY` es no-op y el bridge sigue enviando). advisors **0 ERROR** (WARN 113, baseline sin cambio). **Pendiente = en la box, NO desde esta sesión (no hay ssh a la box aquí):** pegar `SUPABASE_SERVICE_ROLE_KEY` en `/opt/ketzal-wa-sender/.env` → `pm2 start` + parear QR con el número dedicado → `/health` CONNECTED → `poller --dry-run`/`--test-phone` → prender el gate (`update ketzal.app_settings set wa_auto_enabled=true where id=1`). El matcher STOP toma efecto al reiniciar el bridge tras pegar el service key. **⏸️ PAUSADO a propósito (2026-07-23):** aún no hay número de WhatsApp definitivo. Verificado al pausar: gate OFF, 0 en vuelo, box sin arrancar ⇒ cero efecto en el resto (Clawbot in-app / cobranza / dinero / cron del outbox intactos). Todo (código, BD en el ledger, allowlist, matcher STOP) queda listo y verificado; se retoma desde *Checkpoint 1* de `wa-sender/DEPLOY_STATUS.md` cuando haya número. Al retomar: depurar los pendientes viejos del outbox (~116 al pausar) antes de prender el gate.

> **b057 — Salidas: precio especial por pack, además del % uniforme (2026-08-19).** Salió al hard-testear el registro del catálogo real de Border Travels vía WhatsApp/Claude-in-Chrome: varios "tours" eran el mismo viaje repetido solo por fecha (Creel y Barrancas ×3, Huasteca Potosina en Avión ×3, mismo precio en las 3) — consolidables en 1 servicio con N salidas usando `service_departures.price_pct` (b045). Pero la 4ª variante, "Creel New Year", subía cuádruple/triple/doble **$300/$300/$200** — 12.5%/11.5%/7.2%, no un mismo %; forzarla al `price_pct` uniforme habría cobrado mal en 2 de 3 tarifas. **Fix additive, no reemplazo**: columna nueva `service_departures.pack_price_overrides jsonb` (nullable; `{"cuadruple":2699,...}`) + función `ketzal.valid_pack_price_overrides` (CHECK: claves ∈ {sencilla,doble,triple,cuadruple}, valores >0) + re-apply aditivo de `create_marketplace_order`/`get_public_service` (DDL vivo leído antes) con resolución `override[pack] ?? price*(1+pct/100)` — mismo patrón de coalesce en los dos lugares donde ya se calculaba el precio por pack. `price_pct` sigue siendo el camino por default (el 99% de las salidas no necesita overrides); el override es la excepción explícita. **App**: `precioDePack` puro en `domain/pricing.ts` (+5 tests, 80 en verde), tipos/validación en `servicios/actions.ts`, UI en `salidas-editor.tsx` vía `<details>` nativo (cero estado nuevo para el toggle) — inputs solo para los packs que el servicio realmente ofrece (prop `packs` nueva, ya se armaba en la page); checkout (`/comprar`) y ficha pública (`/servicio/[id]`) resuelven el mismo cálculo para mostrar precio. Hard-test en vivo con rollback (CHECK acepta/rechaza correcto, fórmula de resolución exacta), `verificar_invariantes` 0, advisors 0 ERROR (1 WARN de search_path mutable cazado y cerrado en la propia función nueva). **Dato migrado**: Creel New Year pasó a ser la 4ª salida (30 dic 2026) de "Creel y Barrancas del Cobre" con el override exacto; el servicio duplicado se borró (0 ventas). Con Huasteca (3→1 servicio, 3 salidas, sin overrides — mismo precio en las 3) y Creel (4→1 servicio, 4 salidas), el catálogo de prueba de Border Travels bajó de 17 a 12 servicios sin perder ni un precio real. Espejo `db/proposed/b057_departure_pack_price_overrides.sql`.

**Infra/deploy:** Next.js 16 (App Router) · React 19 · TS · Tailwind 4 · shadcn base-nova (sobre `@base-ui/react`, no radix) · pnpm · **vitest** (tests de dominio, `pnpm test`). Repo `walfro90-gorilla/ketzal-OS` (SSH) → Vercel `ketzal-os` (push a `main` auto-despliega). Prod: **https://ketzal-os.vercel.app**. Migraciones NO versionadas en el repo (Supabase es la fuente, vía `apply_migration`). `middleware.ts`→`proxy.ts` en Next 16; `next build` no falla por lint.

**Auth + tenancy:** magic link / contraseña / Google OAuth / recuperación. Dos tipos de vendedor: **agente de agencia** (`profiles.supplier_id`) y **agente Ketzal libre** (`supplier_id` null, vende todo, comisión de plataforma). Nuevos usuarios nacen **pendientes** (`active=false`) → aprobación de admin. RLS reescrito y probado adversarialmente (spoof/fugas cross-tenant/anon cubiertos). **Escalación de auto-UPDATE — encontrada y cerrada (2026-07-23, `b017_profiles_lockdown`):** `authenticated` tenía GRANT UPDATE de tabla completa sobre `profiles` y `profiles_update_own` no restringía columnas ⇒ un autenticado podía PATCH su propia fila y ponerse `role='superadmin'`/`active=true` por PostgREST, saltándose los RPCs con guard. Se **revocó insert/update/delete de `authenticated`** sobre `profiles` (la app nunca escribe profiles desde el cliente; todas las mutaciones van por RPCs `SECURITY DEFINER` que corren como owner). Hard-testeado (rolled back) + advisors 0 ERROR. Helpers: `my_supplier_id`, `is_superadmin`, `is_active`, `ensure_profile`. **Escritura de profiles = solo vía RPC DEFINER** (`set_user_active`/`set_user_role`/`assign_user_agency`/`ensure_profile`).

**Flujo de venta (RPCs atómicos):** catálogo de servicios → **cotización** (link público `/cotizacion/[token]` + PDF + convertir) → **venta** con líneas (opciones de pasajero + habitación/add-ons) → **abonos** (ledger append-only, saldo derivado) → **recibo** interno (folio atómico por agencia) → **comisiones** (reventa entre agencias / plataforma para libres). Cancelaciones, vencimientos, editor de itinerario.

**Cancelaciones + crédito (b047–b051, 2026-08-04 — plan C0–C6 en `docs/PLAN_CANCELACIONES.md`, marco legal y decisiones en `docs/POLITICA_CANCELACION.md`).** La política **se congela en la venta** (`bookings.cancellation_policy` jsonb, snapshot idempotente) resolviendo en cascada `suppliers.info` → `app_settings`; la **aceptación** queda con evidencia (`policy_accepted_at/meta`: canal checkout con ip/ua, cotización anon por token, o registro del agente) — es la defensa anti-contracargo, porque **MP no cubre servicios** en su Protección al Vendedor. `preview_cancellation` calcula `pena = max(tramo% × total, enganche)` (tramos 10/25/50/75/100, tope el total); `cancel_booking_v2(booking, motivo, modo, waive)` cancela en modo **crédito** (pena 0, emite crédito atómico) o **efectivo** (registra `cancel_fee_mxn`; devolver es acto aparte), con `waive` para cancelación de la agencia/fuerza mayor (motivo obligatorio, espejo NOM). Devolución total (`refund_payment`) o **parcial** (`refund_payment_partial`, MP incluido con `{amount}`); un pago admite **UNA** devolución ligada (`uq_payments_refund_of`). **Crédito UNIVERSAL** (`ketzal.credits`): canjeable en cualquier viaje de Ketzal por la misma persona (`customers.marketplace_customer_id`), **saldo derivado** de `payments.credit_id`, expiración lazy; lo aplica el **titular** desde `/mis-compras` o la **agencia emisora** — nunca una agencia ajena (fix de seguridad b051). Un abono método `credito` **no se devuelve en efectivo**. Página pública `/politica-cancelacion`. Deuda inter-agencias por canje cruzado: derivable del ledger (emisor ≠ vendedor), reporte pendiente.

**Pagos — más allá del v1 original (ampliado con acuerdo del fundador):**
- **Cobro en línea (Mercado Pago Checkout Pro)**: **VALIDADO en producción (2026-07-10)** — pago SPEI real de $20 confirmado end-to-end (webhook `approved` → abono en el ledger). El bloqueo era el token en TEST; con `APP_USR-` de prod cobra bien. (El sandbox de MP nunca sirvió; se validó directo en prod, como se acordó.)
- **Estado de cuenta del cliente** compartible por WhatsApp (link público `/estado/[token]`).
- **Recibo** rediseñado + público/compartible (`/recibo/[uuid]`, cantidad con letra, sello "Liquidada").
- **Plan de pagos (abonos)**: enganche % configurable (default 20%) + abonos semanal/quincenal/mensual hasta la fecha final; invariante suma=total. Tabla `payment_schedule` + RPCs `preview/generate/clear_payment_plan`; `bookings.payment_type`.

**Operación / institucional:** Panel (KPIs + "Requiere atención") · **Reportes** (`/reportes`, gráficas + exportar CSV) · **búsqueda + filtros + ordenar por columna** en todas las listas · **buscador global ⌘K** · **sidebar de escritorio colapsable** · PWA · dark mode · toasts · mobile-first (campo-primero) · borrados con confirmación + guardas de integridad · **tour de onboarding** (`src/components/shell/tour/`: overlay propio con **spotlight** —oscurece el fondo, resalta el ítem del nav vía `data-tour={href}` y auto-scrollea hasta él, con la tarjeta anclada al lado; los pasos generales van centrados. Se auto-abre 1× por dispositivo vía `localStorage` `ketzal_tour_seen_v1` y se reabre desde el botón "?" del header; pasos por sección filtrados por rol, sin backend).

**Automatización / cobranza / salud (2026-07-10):**
- **Cobranza** (`/cobranza`): a quién cobrar / quién va atrasado (cruza el plan de pagos con los abonos reales).
- **Clawbot** — motor de automatización: reglas diarias (abono por vencer/vencido, cotización sin cerrar, viaje próximo) → outbox de recordatorios que el agente **envía por WhatsApp con 1 clic** (`/clawbot`) + digest en el Panel. Cron `/api/clawbot/tick` (`vercel.json`, protegido `CRON_SECRET`). Diseñado para subir a envío 100% automático (WhatsApp Business API) sin rehacer el motor.
- **Salud del sistema** (`/salud`, superadmin): chequeo de invariantes de dinero (0 violaciones) + log de eventos (cron, webhook). El cron corre el chequeo a diario.

> **Env vars nuevas:** `CRON_SECRET` (cron de Clawbot). Ya existentes: `MP_ACCESS_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`.
> **Multi-agente:** varios agentes editan el árbol en paralelo. Convención: RPCs nuevos se llaman con cast `supabase.rpc('nombre' as never)` para NO tocar `database.types.ts` (un solo dueño); cada quien commitea SOLO sus archivos (`git add` explícito — ojo: rutas con brackets `app/x/[id]/` son glob en pathspecs de git, stagea por directorio y revisa `git status`). **Espejos de migraciones en `db/proposed/` usan prefijo por carril: `bNNN_` (backend/dinero) y `mNNN_` (marketplace/viajero), cada uno con su propio contador — el contador `b` va en **b053** (2026-08-04), el siguiente es `b054_`. Con 2 agentes en paralelo el número se puede pisar (pasó con b046: salidas y cancelaciones lo tomaron a la vez) ⇒ **antes de nombrar el espejo, `ls db/proposed/` y revisar `supabase_migrations.schema_migrations`**; si ya está tomado, recorre el tuyo (es solo renombrar el archivo).** Ver `docs/WORKTREES.md` y `db/proposed/README.md`.

**Modelo de 2 agentes (dev):** UI/UX (Fable) dueño de la capa presentacional; backend (Opus) dueño de `actions.ts`, RPCs, RLS, dinero. Ver `docs/UI_UX_PLAN.md` §7.

**Roadmap pendiente (v2+):** notificaciones (WhatsApp/email), facturación CFDI/SAT, catálogo público/marketplace (primer paso B2C). **Pagos:** MP ya validado en prod; a futuro **Openpay** (es de BBVA) para cobrar SPEI conciliable a la cuenta BBVA sin el fee de tarjeta de MP — el campo ya está listo (`payment_intents.provider`, sin cambio de schema). **Por lo pronto: solo MP** (nada de scaffolding de Openpay hasta decidirlo, YAGNI). Detalle en `docs/ROADMAP.md`.

