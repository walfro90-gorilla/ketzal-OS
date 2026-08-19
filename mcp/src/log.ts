/**
 * En stdio, **stdout es el cable del protocolo MCP**: un `console.log` suelto
 * inyecta basura entre los mensajes JSON-RPC y tumba la sesión. Todo diagnóstico
 * sale por stderr, que el cliente MCP muestra en sus logs sin romper nada.
 */
export function log(...parts: unknown[]): void {
  process.stderr.write(`[ketzal-mcp] ${parts.map(String).join(' ')}\n`)
}
