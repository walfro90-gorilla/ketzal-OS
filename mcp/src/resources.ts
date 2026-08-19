/**
 * Recursos: contexto que el cliente MCP puede leer sin gastar una llamada a
 * herramienta. Son las tres preguntas que el agente se hace al empezar el día.
 */
import type { McpServer } from '@modelcontextprotocol/server'
import { rpc } from './rest.js'
import { whoami } from './tools/identidad.js'

const json = (uri: URL, valor: unknown) => ({
  contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(valor, null, 2) }],
})

export function registrarRecursos(server: McpServer): number {
  server.registerResource(
    'me',
    'ketzal://me',
    {
      title: 'Mi sesión en Ketzal',
      description: 'Usuario, rol, agencia y alcance de datos de esta sesión.',
      mimeType: 'application/json',
    },
    async (uri) => json(uri, await whoami()),
  )

  server.registerResource(
    'cobranza',
    'ketzal://cobranza',
    {
      title: 'Cobranza pendiente',
      description: 'Ventas con saldo y atraso, cruzando el plan de pagos con los abonos reales.',
      mimeType: 'application/json',
    },
    async (uri) => json(uri, await rpc('cobranza')),
  )

  server.registerResource(
    'agenda',
    'ketzal://agenda',
    {
      title: 'Próximas salidas',
      description: 'Salidas por venir con su ocupación y captura de pasajeros.',
      mimeType: 'application/json',
    },
    async (uri) => json(uri, await rpc('list_departures')),
  )

  return 3
}
