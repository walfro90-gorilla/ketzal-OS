# ADR-0060 — El PDF adjunto se lee en el navegador; al servidor solo llega texto

- **Estado:** aceptada
- **Fecha:** 2026-09-08
- **Migración:** ninguna
- **Sustituye a:** la alternativa "extraer en el navegador" que
  [ADR-0059](0059-los-adjuntos-del-asistente-entran-como-texto.md) descartó,
  **solo para PDF**. Lo demás de ADR-0059 sigue igual: imágenes, Word y texto
  van al servidor; el adjunto entra al mensaje como texto; nada se guarda.
- **Toca:** `src/lib/agente/pdf-cliente.ts` (nuevo) ·
  `src/components/shell/agente.tsx` (el PDF no viaja)
- **Relacionadas:** [ADR-0059](0059-los-adjuntos-del-asistente-entran-como-texto.md),
  [ADR-0003](0003-monolito-sin-sobreingenieria.md)

## Contexto

El primer PDF real que el fundador arrastró al asistente pesaba más de 4 MB
(`Rancho San Lorenzo 2026 _…_0000.pdf`, exportado de Canva) y el chat lo rechazó
con "El archivo pesa más de 4 MB". Un PDF de diseño pesa por sus fotos; su
texto son dos párrafos.

El tope no era nuestro sino de la plataforma, y se volvió a **medir** antes de
decidir: un `POST` a `/api/agente/adjunto` en producción con 6, 12 y 30 MB
devuelve `413 Request Entity Too Large` antes de que corra la función. Subir
`MAX_BYTES_ADJUNTO` habría prometido lo que Vercel va a rechazar.

`unpdf`, la librería que ya extrae el texto del PDF en el servidor, corre igual
en el navegador (el worker de pdf.js viene incrustado). ADR-0059 descartó
extraer en el cliente por el peso del bundle: eso aplica a un `import`
estático, no a uno dinámico que solo se descarga cuando alguien adjunta un PDF.

## Decisión

1. **El PDF se convierte a texto en el navegador** con `unpdf` importado de
   forma dinámica (`await import('unpdf')`, un chunk aparte de 1.6 MB que
   nadie descarga hasta adjuntar el primer PDF). El texto resultante entra al
   mensaje igual que cualquier adjunto (ADR-0059 §3), con el mismo recorte.
2. **El PDF ya no viaja al servidor.** El tope pasa a 40 MB, que es lo que la
   memoria de un navegador de celular aguanta cómodo; no lo pone Vercel.
3. **La ruta `/api/agente/adjunto` sigue aceptando PDF ≤ 4 MB** (no se rompe
   ningún cliente ni el harness), pero el asistente ya no la usa para eso.
4. Imágenes, Word y texto siguen en el servidor: las imágenes necesitan el
   modelo de visión y el resto pesa poco.

## Alternativas descartadas

- **Subir el archivo a Storage y que el servidor lo lea de ahí.** Rodea el
  413, pero mete un bucket privado, una policy por prefijo, borrado posterior y
  un barrido de restos para un archivo que solo hace falta durante dos
  segundos. Si algún día el adjunto debe **quedarse** (releerlo mañana), esa
  será la puerta, con ADR propio.
- **Subir el tope en Vercel.** No es configurable: medido, 413.
- **Pedir al fundador que comprima el PDF.** Un folleto de Canva no baja de
  4 MB sin perder las fotos, y la fricción mata el uso.

## Consecuencias

- Un PDF **escaneado** sigue sin texto: el mensaje pide una captura. Renderizar
  páginas a imagen en el navegador y mandarlas al modelo de visión es la
  siguiente rebanada si hace falta (`unpdf` ya trae `renderPageAsImage`).
- El chunk de `unpdf` para el navegador se descarga una vez por sesión y solo
  al adjuntar un PDF; el shell del OS no crece.

## Verificación

- `src/lib/agente/pdf-cliente.test.ts` (4 casos): un PDF con capa de texto
  (construido en el test) devuelve su texto; uno casi vacío se reporta como
  diseño/escaneo; bytes que no son PDF dan error legible; solo `pdf` se lee
  en el navegador.
- **Medición del tope (2026-09-08):** `curl -F` contra
  `https://os.ketzal.tours/api/agente/adjunto` con 6, 12 y 30 MB → `413
  Request Entity Too Large` los tres; con body chico → `401` (la ruta corre).
- **Pantalla con sesión:** el caso real es abrir el asistente y adjuntar un
  PDF de más de 4 MB; se anota el resultado en la bitácora al probarlo.
