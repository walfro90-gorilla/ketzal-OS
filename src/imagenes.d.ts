// Tipos de los imports estáticos de imágenes (`import foto from './x.png'`).
// Localmente los trae `next-env.d.ts`, que Next genera y git ignora; en CI
// `tsc --noEmit` corre en un clon limpio, sin ese archivo, y el import del
// hero fallaba con TS2307. Esta referencia es la misma línea que Next mete
// ahí, pero versionada.
/// <reference types="next/image-types/global" />
