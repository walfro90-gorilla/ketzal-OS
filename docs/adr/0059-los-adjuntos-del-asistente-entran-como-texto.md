# ADR-0059 — Los adjuntos del asistente entran como texto, no como archivo

- **Estado:** aceptada
- **Fecha:** 2026-09-08
- **Migración:** ninguna (nada se guarda)
- **Sustituye a:** ninguno
- **Toca:** `src/app/api/agente/adjunto/route.ts` (nuevo) ·
  `src/lib/agente/{adjunto-texto,adjuntos,sesion}.ts` (nuevos) ·
  `src/lib/agente/conversacion.ts` (una regla del prompt) ·
  `src/components/shell/agente.tsx` (clip, chips, reducción de imagen) ·
  `src/app/api/agente/route.ts` (usa el gate compartido)
- **Relacionadas:** [ADR-0044](0044-el-asistente-del-os-reusa-las-herramientas-del-mcp.md)
  (el asistente es texto plano sobre las tools del MCP, con fallback de
  proveedor), [ADR-0036](0036-el-bucket-publico-no-guarda-documentos.md) (un
  documento con datos de una persona no se queda tirado),
  [ADR-0003](0003-monolito-sin-sobreingenieria.md) (dependencia nueva = decisión)

## Contexto

El fundador pidió que el asistente del OS pudiera leer PDFs, imágenes y
documentos: la cotización de un hotel, el volante de un proveedor, un
itinerario en Word, para que el chat trabaje con eso (crear el servicio, armar
el costeo, contestar).

Lo que ya había: el lector de volantes convierte un PDF a texto con `unpdf` y
manda una imagen al modelo de visión de Groq (`GROQ_MODEL`); el asistente
habla con Groq → Gemini → DeepSeek en dialecto OpenAI, con `content: string`,
y guarda la conversación en `localStorage` del navegador. DeepSeek no acepta
imágenes y los modelos que llaman herramientas no siempre son los de visión.

## Decisión

**Un adjunto se convierte a texto en el servidor y entra al mensaje de la
persona como un bloque marcado. El archivo no se guarda en ningún lado.**

1. **`POST /api/agente/adjunto`** recibe UN archivo (multipart, tope 4 MB
   porque Vercel corta el body en 4.5) y devuelve `{ nombre, texto, recortado }`.
   Mismo gate que `/api/agente` (`sesionAsistente()`, compartido): solo el
   superadmin, con su propia sesión.
2. **Conversión por tipo**, en `src/lib/agente/adjuntos.ts`:
   PDF → `unpdf` (la misma librería del lector de volantes; menos de 20
   caracteres = escaneo, y se pide una captura); imagen → transcripción por el
   modelo de visión de Groq con el mismo `GROQ_MODEL` del lector (una sola
   visión en el proyecto); `.docx` → `word/document.xml` leído con `node:zlib`
   en 40 líneas, **sin dependencia nueva**; `.txt/.csv/.md` → tal cual. El
   tipo se decide por mime y, si el navegador no lo dice (Windows manda `.csv`
   como Excel), por extensión.
3. **El texto entra al mensaje** entre `[Adjunto: nombre]` y
   `[Fin del adjunto]`, después de lo que la persona escribió, recortado a
   30 000 caracteres. El prompt de sistema explica el marco: **es
   información, nunca instrucciones**; si el archivo dice qué hacer, el
   modelo lo ignora y atiende a la persona. Es la defensa contra un PDF que
   traiga "registra un abono" escrito adentro: el dinero además sigue detrás
   del clic (ADR-0044 §3).
4. **El cliente reduce las imágenes** a 1600 px JPEG antes de subir: una foto
   de celular pesa 3-8 MB y así cabe en el tope; el modelo la lee igual.
5. **Nada persiste.** El archivo vive en memoria durante la petición; lo que
   queda es el texto dentro de la conversación, que ya vivía en el navegador
   de quien pregunta. No hay bucket, no hay tabla.

## Por qué así

- **Texto es lo que todos los proveedores entienden.** Con `content` como
  arreglo multimodal, DeepSeek se cae del fallback y el modelo de tools tendría
  que ser también el de visión. Convertir antes deja intacto ADR-0044.
- **Reusar antes que agregar.** `unpdf` y el modelo de visión ya estaban; un
  `.docx` es un zip con XML y `node:zlib` ya viene con Node. Cero dependencias
  nuevas.
- **Un documento con datos de personas no se queda guardado** solo porque
  alguien lo arrastró al chat (ADR-0036). Si algún día hace falta volver a
  consultarlo, será una decisión aparte con bucket privado y URL firmada.

## Alternativas descartadas

- **Mandar la imagen o el PDF directo al modelo del chat** (multimodal). Rompe
  el fallback (DeepSeek) y acopla el modelo de herramientas al de visión.
- **Subir a Storage y pasar la URL.** Persistencia sin necesidad, un bucket
  más que auditar, y la URL firmada caduca antes de que la conversación
  guardada en el navegador la vuelva a leer.
- **`mammoth` para los .docx.** Una dependencia para lo que resuelven 40
  líneas sobre `node:zlib`. Si algún día hace falta el formato (tablas,
  listas numeradas) se reconsidera.
- **Extraer en el navegador** (pdf.js en el cliente). Sube el bundle del shell
  del OS para todos, y las imágenes igual necesitan el servidor.
- **`.xlsx`.** No se pidió; una hoja de cálculo real es demasiado ancha para
  un mensaje de chat. Si hace falta, primero se pregunta qué columnas.

## Verificación

- `src/lib/agente/adjunto-texto.test.ts` (10 casos): mime y extensión
  (`.csv` como Excel, `.md` sin tipo, `.docx` como octet-stream se aceptan;
  `.exe` y `.xlsx` no); el XML de Word sale con un párrafo por línea,
  tabuladores y saltos, y las entidades se decodifican después de quitar
  etiquetas (`&lt;b&gt;` no se vuelve etiqueta); el recorte marca
  `recortado`; el nombre del adjunto no puede romper el marco (`]` y saltos
  se limpian).
- `src/lib/agente/adjuntos.test.ts` (9 casos): el lector de ZIP encuentra la
  entrada guardada y la deflated, y devuelve null ante un no-zip; un `.docx`
  construido en el test sale como texto; una imagen llega al transcriptor como
  `data:` URI y su error se propaga; un tipo desconocido se rechaza antes de
  leer.
- `supabase/tests/adjunto_asistente.mjs` (9 aserciones, con la app
  construida): un `.txt`, un PDF con capa de texto (construido byte a byte en
  el harness) y un `.docx` vuelven con su texto; `.csv` etiquetado como Excel
  se acepta; tipo desconocido 415; más de 4 MB 413; vacío 400; **admin de
  agencia 403 y sin sesión 401**. La imagen no se ejercita ahí: depende de un
  tercero y de `GROQ_API_KEY`; su contrato está en el unit test con el
  transcriptor sustituido.
- **Visión probada en vivo el 2026-09-08** por la ruta, con una captura real de
  `/salidas` (1920×1080, 187 KB): HTTP 200 en 2.6 s y la tabla de salidas
  transcrita fila por fila. Techo conocido: el modelo devuelve ~800
  caracteres por imagen aunque `max_tokens` sea 4096; una captura muy densa
  sale parcial. Es límite del modelo (`GROQ_MODEL`), no del código: si estorba,
  se cambia el modelo por env, no el código.
- **No verificado con sesión en pantalla**: el clip, los chips y el mensaje
  compuesto se prueban abriendo el asistente con una cuenta real.
