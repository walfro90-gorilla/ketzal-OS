/**
 * Loader de Turbopack para `mcp/src/**`.
 *
 * El MCP compila con `module: NodeNext`, que EXIGE `./x.js` en los imports
 * relativos (Node ESM no adivina extensiones). Turbopack no remapea `./x.js` al
 * `x.ts` que sí existe, así que al importar las herramientas del MCP desde la
 * app (`src/lib/agente/tools.ts`, ADR-0043) el build truena con 14 "Module not
 * found". Aquí se quita la extensión solo en esos archivos; el paquete
 * publicado no cambia.
 */
module.exports = function mcpImportLoader(source) {
  return source.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)\.js(['"])/g, '$1$2$3')
}
