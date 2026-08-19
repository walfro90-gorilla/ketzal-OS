/**
 * Prompts: los flujos reales del día. En Claude Code aparecen como slash
 * commands (`/mcp__ketzal__cierre_del_dia`).
 *
 * Cada uno describe el trabajo, no el detalle de las herramientas: el agente ya
 * tiene los schemas. Lo que sí se repite aquí es la regla que más importa —
 * ningún número se calcula, todos se leen del sistema.
 */
import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'

const texto = (t: string) => ({
  messages: [{ role: 'user' as const, content: { type: 'text' as const, text: t } }],
})

export function registrarPrompts(server: McpServer): number {
  server.registerPrompt(
    'cierre_del_dia',
    {
      title: 'Cierre del día',
      description: 'Qué se vendió, qué se cobró y qué quedó pendiente hoy.',
    },
    () =>
      texto(
        'Haz el cierre del día de la agencia:\n' +
          '1. ketzal_panel para los indicadores de hoy y las alertas de dinero.\n' +
          '2. ketzal_cobranza para lo que quedó por cobrar y las transferencias por aprobar.\n' +
          '3. ketzal_salidas para ver si hay viaje mañana y si faltan pasajeros por capturar.\n\n' +
          'Devuélveme un resumen corto y accionable: qué requiere atención HOY y qué puede esperar. ' +
          'Los montos vienen ya calculados por el sistema: repórtalos tal cual, no los recalcules ni los sumes.',
      ),
  )

  server.registerPrompt(
    'a_quien_cobrar',
    {
      title: 'A quién cobrar',
      description: 'Lista priorizada de cobranza con un mensaje listo para cada cliente.',
      argsSchema: z.object({
        solo_atrasados: z.string().optional().describe('"si" para ver únicamente los que ya van tarde.'),
      }),
    },
    ({ solo_atrasados }) =>
      texto(
        `Corre ketzal_cobranza${solo_atrasados === 'si' ? ' con solo_atrasados: true' : ''} y ármame la ronda de cobranza.\n\n` +
          'Ordena por urgencia real (días de atraso primero, luego monto) y para cada cliente dame ' +
          'un mensaje de WhatsApp breve, cordial y en español de México, con su nombre, el monto y la fecha. ' +
          'No inventes montos ni fechas: usa exactamente los que devuelve el sistema. ' +
          'No registres ningún abono — esto es sólo preparar los mensajes.',
      ),
  )

  server.registerPrompt(
    'revisar_salida',
    {
      title: 'Revisar una salida',
      description: 'Checklist operativo antes de que salga el camión.',
      argsSchema: z.object({
        salida: z.string().optional().describe('Id de la salida, o déjalo vacío para la más próxima.'),
      }),
    },
    ({ salida }) =>
      texto(
        (salida
          ? `Revisa la salida ${salida}.`
          : 'Busca con ketzal_salidas la salida más próxima y revísala.') +
          '\n\nQuiero saber: ocupación contra cupo, cuántos pasajeros faltan por capturar, qué ventas ' +
          'traen saldo, y si la buslist y la roomlist están completas.\n\n' +
          'Ojo: el camión es cross-tenant. Aparecen pasajeros de reventas de otras agencias y el dinero ' +
          'de esas ventas llega en null a propósito — repórtalo como "no visible", nunca lo estimes.',
      ),
  )

  server.registerPrompt(
    'estado_del_negocio',
    {
      title: 'Estado del negocio',
      description: 'Vendido, gastos, utilidad, metas y conversión de un periodo.',
      argsSchema: z.object({
        periodo: z.string().optional().describe('Ej. "este mes", "agosto", "2026-08-01 a 2026-08-31".'),
      }),
    },
    ({ periodo }) =>
      texto(
        `Dame el estado del negocio${periodo ? ` para ${periodo}` : ' del mes en curso'}:\n` +
          '1. ketzal_reportes para vendido, metas y conversión de cotización a venta.\n' +
          '2. ketzal_gastos (resumen) para los egresos del mismo periodo.\n' +
          '3. ketzal_comisiones_cuentas para los devengos y saldos entre actores.\n\n' +
          'Di explícitamente qué periodo estás reportando. La utilidad es vendido menos gastos y ya viene ' +
          'derivada del sistema: no la recalcules. Cierra con las dos o tres cosas que más mueven la aguja.',
      ),
  )

  return 4
}
