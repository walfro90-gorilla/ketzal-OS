/** Clientes de la agencia: buscar y dar de alta. */
import { z } from 'zod'
import { insert, q, rpc, select } from '../rest.js'
import { getAuthUser } from '../session.js'
import type { ToolDef } from './registry.js'

type Cliente = {
  id: string
  full_name: string
  phone: string | null
  email: string | null
  created_at: string
  num_ventas: number
  total_comprado: number
  ultima_venta: string | null
}

/** Búsqueda tolerante: sin acentos, sin mayúsculas, sin formato de teléfono. */
function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s()+-]/g, '')
}

export function filtrarClientes(rows: Cliente[], busqueda?: string): Cliente[] {
  const t = busqueda?.trim()
  if (!t) return rows
  const needle = normalizar(t)
  return rows.filter((c) =>
    [c.full_name, c.phone, c.email].some((v) => v && normalizar(v).includes(needle)),
  )
}

const esquemaBuscar = z.object({
  busqueda: z
    .string()
    .optional()
    .describe('Texto a buscar en nombre, teléfono o correo. Ignora acentos y mayúsculas.'),
  limite: z.number().int().min(1).max(200).default(50).describe('Máximo de clientes a devolver.'),
})

const esquemaAlta = z.object({
  nombre: z.string().min(1).describe('Nombre completo del cliente. Obligatorio.'),
  telefono: z.string().optional().describe('Teléfono a 10 dígitos (para WhatsApp).'),
  email: z.string().optional().describe('Correo electrónico.'),
  doc_id: z.string().optional().describe('Identificación oficial (INE, pasaporte).'),
  notas: z.string().optional().describe('Notas internas sobre el cliente.'),
})

const limpiar = (s?: string) => s?.trim() || null

export const tools: ToolDef[] = [
  {
    name: 'ketzal_clientes',
    title: 'Buscar clientes',
    description:
      'Clientes de tu agencia con su historial de compra (número de ventas, total comprado, ' +
      'última compra). Úsala para encontrar el id de un cliente antes de venderle o de ' +
      'consultar sus ventas, o para responder "¿quiénes son mis mejores clientes?". ' +
      'Si no aparece, probablemente no está dado de alta: usa ketzal_crear_cliente.',
    inputSchema: esquemaBuscar,
    handler: async (args) => {
      const a = esquemaBuscar.parse(args)
      // `list_customers` no recibe filtros y ya viene acotado por RLS a la agencia:
      // el filtro va aquí sobre lo que la BD ya autorizó a ver.
      const todos = (await rpc<Cliente[]>('list_customers')) ?? []
      const filtrados = filtrarClientes(todos, a.busqueda)
      return {
        total_encontrados: filtrados.length,
        clientes: filtrados.slice(0, a.limite),
      }
    },
  },
  {
    name: 'ketzal_crear_cliente',
    title: 'Dar de alta un cliente',
    description:
      'Registra un cliente nuevo en tu agencia. Úsala sólo después de buscarlo con ' +
      'ketzal_clientes y confirmar que no existe (nombres repetidos ensucian el historial ' +
      'de compra). Es el paso previo a registrarle una venta.',
    write: true,
    inputSchema: esquemaAlta,
    handler: async (args) => {
      const a = esquemaAlta.parse(args)
      const user = await getAuthUser()

      // La RLS exige `created_by = auth.uid()`; y sin `supplier_id` el cliente
      // sólo lo vería quien lo creó, no el resto de la agencia.
      const perfil = await select<{ supplier_id: string | null }[]>(
        'profiles',
        `select=supplier_id&id=eq.${q(user.id)}`,
      )

      return insert<Record<string, unknown>>('customers', {
        supplier_id: perfil[0]?.supplier_id ?? null,
        created_by: user.id,
        full_name: a.nombre.trim(),
        phone: limpiar(a.telefono),
        email: limpiar(a.email),
        doc_id: limpiar(a.doc_id),
        notes: limpiar(a.notas),
      })
    },
  },
]
