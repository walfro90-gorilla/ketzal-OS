/**
 * Quién soy y qué puedo hacer.
 *
 * Es la primera herramienta que debería llamar el agente: la RLS acota por agencia
 * y los guards de los RPCs por rol, así que saber quién es la sesión explica de
 * antemano por qué unas cosas se ven y otras no.
 */
import { KetzalError } from '../errors.js'
import { q, rpc, select } from '../rest.js'
import { getAuthUser } from '../session.js'
import { writesLeft } from '../guard.js'
import { READ_ONLY } from '../config.js'
import type { ToolDef } from './registry.js'
import { z } from 'zod'

type Perfil = {
  id: string
  email: string | null
  name: string | null
  role: 'user' | 'admin' | 'superadmin' | null
  type: 'agente' | 'viajero' | 'embajador' | 'proveedor' | null
  active: boolean | null
  supplier_id: string | null
}

export async function whoami() {
  const user = await getAuthUser()
  const filas = await select<Perfil[]>(
    'profiles',
    `select=id,email,name,role,type,active,supplier_id&id=eq.${q(user.id)}`,
  )
  const p = filas[0]
  if (!p) {
    return {
      user_id: user.id,
      email: user.email,
      perfil: null,
      nota: 'La cuenta existe en Auth pero no tiene perfil en Ketzal. Entra una vez a la app web para crearlo.',
    }
  }

  let agencia: string | null = null
  if (p.supplier_id) {
    agencia = await rpc<string | null>('agency_name', { p_id: p.supplier_id }).catch(() => null)
  }

  return {
    user_id: p.id,
    email: p.email,
    nombre: p.name,
    rol: p.role,
    tipo: p.type,
    activo: p.active,
    agencia: p.supplier_id ? { id: p.supplier_id, nombre: agencia } : null,
    alcance:
      p.role === 'superadmin'
        ? 'Superadmin: ve y opera todas las agencias.'
        : p.supplier_id
          ? `Acotado por RLS a la agencia ${agencia ?? p.supplier_id}. No ve datos de otras agencias.`
          : 'Agente libre de Ketzal (sin agencia): ve lo suyo y el catálogo de plataforma.',
    modo: READ_ONLY ? 'solo lectura' : 'lectura y escritura',
    escrituras_disponibles: READ_ONLY ? 0 : writesLeft(),
  }
}


// ── Agencias ─────────────────────────────────────────────────────────
// Las agencias son filas de `suppliers` con `supplier_type='agency'`. La RLS
// (`suppliers_read`) ya decide qué se ve: el superadmin todas, cualquier otro
// sólo la suya y las que cuelgan de ella (`owner_supplier_id`). Aquí no se
// filtra por sesión: sería duplicar la frontera real y desincronizarla.

const CAMPOS_AGENCIA = 'id,name,supplier_type,contact_email,phone_number,commission_rate,owner_supplier_id,created_at'

export async function agencias(a: Record<string, unknown>) {
  const id = typeof a.agencia_id === 'string' ? a.agencia_id.trim() : ''

  if (id) {
    const [filas, servicios] = await Promise.all([
      select<Record<string, unknown>[]>(
        'suppliers',
        `select=${CAMPOS_AGENCIA},address,description,referral_code&id=eq.${q(id)}`,
      ),
      select<{ id: string; published: boolean | null }[]>(
        'services',
        `select=id,published&supplier_id=eq.${q(id)}`,
      ),
    ])
    const agencia = filas[0]
    if (!agencia) {
      throw new KetzalError('No existe esa agencia, o la RLS no te la muestra (no es la tuya).')
    }
    return {
      agencia,
      servicios: {
        total: servicios.length,
        publicados: servicios.filter((s) => s.published === true).length,
      },
      nota: 'Usa `ketzal_servicios` para ver el catálogo con precios y salidas.',
    }
  }

  const limite = Math.min(200, Math.max(1, Number(a.limite ?? 50)))
  const filtros = [`select=${CAMPOS_AGENCIA}`, 'order=name', `limit=${limite}`]
  if (a.todos !== true) filtros.push('supplier_type=eq.agency')
  const texto = typeof a.texto === 'string' ? a.texto.trim() : ''
  if (texto) filtros.push(`name=ilike.${q(`*${texto}*`)}`)

  const lista = await select<Record<string, unknown>[]>('suppliers', filtros.join('&'))
  return {
    num: lista.length,
    agencias: lista,
    nota: lista.length
      ? 'Pasa `agencia_id` para el detalle y cuántos servicios tiene.'
      : 'Vacío: sólo el superadmin ve todas las agencias; los demás ven la suya (`ketzal_whoami`).',
  }
}

export const tools: ToolDef[] = [
  {
    name: 'ketzal_whoami',
    title: 'Quién soy en Ketzal',
    description:
      'Identidad de la sesión: usuario, rol (user/admin/superadmin), tipo de persona, ' +
      'agencia a la que pertenece y alcance de datos. Llámala primero cuando no sepas ' +
      'con qué cuenta estás operando o cuando una consulta devuelva menos de lo esperado ' +
      '(casi siempre es la RLS acotando por agencia).',
    handler: whoami,
  },
  {
    name: 'ketzal_agencias',
    title: 'Agencias registradas',
    description:
      'Agencias dadas de alta en Ketzal: nombre, contacto, comisión y fecha de alta. ' +
      'Sin argumentos lista las que puedes ver (el superadmin, todas; cualquier otro, la suya ' +
      'y las que cuelgan de ella); con `agencia_id` devuelve el detalle y cuántos servicios ' +
      'tiene. Úsala para "qué agencias hay", "quién opera en la plataforma" o para conseguir ' +
      'el id de una agencia por nombre.',
    inputSchema: z.object({
      agencia_id: z
        .string()
        .optional()
        .describe('Id de la agencia: devuelve su detalle en vez de la lista.'),
      texto: z.string().optional().describe('Filtra la lista por nombre (búsqueda parcial).'),
      todos: z
        .boolean()
        .optional()
        .describe('true = incluye proveedores que no son agencia (hoteles, transportistas).'),
      limite: z.number().optional().describe('Máximo a devolver (1-200, default 50).'),
    }),
    handler: agencias,
  },
]
