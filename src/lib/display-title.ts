/** Si el título viene TODO EN MAYÚSCULAS (dato del agente sin normalizar), lo
 *  muestra en Capitalizado; si ya trae minúsculas, lo respeta tal cual. */
export function tituloVisible(s: string): string {
  const letras = s.replace(/[^\p{L}]/gu, '')
  if (letras.length < 2 || letras !== letras.toUpperCase()) return s
  return s.toLowerCase().replace(/(^|[\s\-/])\p{L}/gu, (m) => m.toUpperCase())
}
