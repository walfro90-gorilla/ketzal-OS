// Tipos de la sección Investigación de mercado (m002). Las tablas `polls` y
// `poll_votes` no están en database.types.ts (dueño único) ⇒ se leen con cast.

export type PollOption = { id: number; label: string }

export type PollStatus = 'draft' | 'open' | 'closed'

export type Poll = {
  id: string
  supplier_id: string
  question: string
  options: PollOption[]
  month_from: string
  month_to: string
  status: PollStatus
  closes_at: string | null
  created_at: string
}

export type PollVote = {
  id: string
  poll_id: string
  option_id: number
  preferred_month: string
  suggestion: string | null
  contact: string | null
  meta: Record<string, string> | null
  created_at: string
}

export type EncuestaInput = {
  question: string
  options: string[]
  month_from: string
  month_to: string
  closes_at?: string | null
  /** Solo lo usa el superadmin, que no tiene agencia propia. Al admin de
   *  agencia se le ignora: su encuesta la fija el default `my_supplier_id()`. */
  supplier_id?: string | null
}

export type AgenciaOpcion = { id: string; name: string }

export const ESTADO_LABEL: Record<PollStatus, string> = {
  draft: 'Borrador',
  open: 'Abierta',
  closed: 'Cerrada',
}
