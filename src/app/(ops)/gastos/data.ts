import { createClient } from '@/lib/supabase/server'

// Lecturas de Gastos (F2). La tabla `expenses` y los RPCs de resumen no están
// en los types generados ⇒ casts. RLS acota a la agencia del agente.

export type GastoRow = {
  id: string
  kind: 'egreso' | 'reverso'
  reverses_expense_id: string | null
  concept: string
  category: string
  amount_mxn: number
  method: string | null
  spent_at: string
  provider_supplier_id: string | null
  provider_name: string | null
  notes: string | null
  created_at: string
}

export type ExpensesSummary = {
  total_gastos: number
  num: number
  por_categoria: { category: string; total: number }[]
  por_mes: { mes: string; total: number }[]
}

export type Payables = {
  total_debo: number
  total_pagado: number
  total_saldo: number
  lista: {
    owner_id: string
    owner: string | null
    num_ventas: number
    vendido: number
    comision: number
    debo: number
    pagado: number
    saldo: number
  }[]
}

/** Gastos visibles (RLS), con el nombre del proveedor si es pago a mayorista. */
export async function listExpenses(): Promise<GastoRow[]> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('expenses')
    .select(
      'id, kind, reverses_expense_id, concept, category, amount_mxn, method, spent_at, provider_supplier_id, notes, created_at, provider:suppliers!expenses_provider_supplier_id_fkey(name)'
    )
    .order('spent_at', { ascending: false })
    .order('created_at', { ascending: false })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    kind: r.kind,
    reverses_expense_id: r.reverses_expense_id,
    concept: r.concept,
    category: r.category,
    amount_mxn: Number(r.amount_mxn),
    method: r.method,
    spent_at: r.spent_at,
    provider_supplier_id: r.provider_supplier_id,
    provider_name: r.provider?.name ?? null,
    notes: r.notes,
    created_at: r.created_at,
  }))
}

export async function getExpensesSummary(
  from: string,
  to: string
): Promise<ExpensesSummary> {
  const supabase = await createClient()
  const { data } = await supabase.rpc('expenses_summary' as never, {
    p_from: from,
    p_to: to,
  } as never)
  return (
    (data as unknown as ExpensesSummary) ?? {
      total_gastos: 0,
      num: 0,
      por_categoria: [],
      por_mes: [],
    }
  )
}

export async function getPayables(): Promise<Payables> {
  const supabase = await createClient()
  const { data } = await supabase.rpc('payables_summary' as never)
  return (
    (data as unknown as Payables) ?? {
      total_debo: 0,
      total_pagado: 0,
      total_saldo: 0,
      lista: [],
    }
  )
}
