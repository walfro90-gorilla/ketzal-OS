/**
 * Catálogo completo de herramientas.
 *
 * Cada dominio vive en su propio archivo y exporta `tools: ToolDef[]`. Aquí solo
 * se concatenan, en el orden en que conviene que el agente las vea.
 */
import { tools as identidad } from './identidad.js'
import { tools as ventas } from './ventas.js'
import { tools as clientes } from './clientes.js'
import { tools as cobranza } from './cobranza.js'
import { tools as salidas } from './salidas.js'
import { tools as catalogo } from './catalogo.js'
import { tools as fotos } from './fotos.js'
import { tools as reportes } from './reportes.js'
import { tools as dinero } from './dinero.js'
import { tools as gastos } from './gastos.js'
import type { ToolDef } from './tipos.js'

export const ALL_TOOLS: ToolDef[] = [
  ...identidad,
  ...ventas,
  ...clientes,
  ...dinero,
  ...cobranza,
  ...salidas,
  ...catalogo,
  ...fotos,
  ...reportes,
  ...gastos,
]
