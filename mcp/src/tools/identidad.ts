/**
 * Quién soy y qué puedo hacer.
 *
 * Es la primera herramienta que debería llamar el agente: la RLS acota por agencia
 * y los guards de los RPCs por rol, así que saber quién es la sesión explica de
 * antemano por qué unas cosas se ven y otras no.
 */
import { q, rpc, select } from '../rest.js'
import { getAuthUser } from '../session.js'
import { writesLeft } from '../guard.js'
import { READ_ONLY } from '../config.js'
import type { ToolDef } from './registry.js'

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
]
