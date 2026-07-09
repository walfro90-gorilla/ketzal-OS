'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { subtotal as sumLineTotals } from '@/lib/domain/pricing'

const ITEM_TYPES = ['passenger', 'room', 'addon', 'custom'] as const
const PASSENGER_TYPES = ['adult', 'child', 'inapam'] as const

type ItemType = (typeof ITEM_TYPES)[number]
type PassengerType = (typeof PASSENGER_TYPES)[number]

export type CreateBookingLine = {
  item_type: ItemType
  passenger_type?: PassengerType | null
  description?: string | null
  qty: number
  unit_price: number
}

export type CreateBookingInput = {
  customerId?: string
  newCustomer?: { full_name: string; phone?: string }
  serviceId?: string
  travelDate?: string
  discount: number
  notes?: string
  lines: CreateBookingLine[]
  /** 'reserved' = venta (default) · 'draft' = cotización. */
  status?: 'reserved' | 'draft'
}

const round2 = (n: number) => Math.round(n * 100) / 100

export async function createBooking(
  input: CreateBookingInput
): Promise<{ error: string } | void> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // 1. Agencia del agente (RLS: la venta debe pertenecer a su supplier).
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('supplier_id')
    .eq('id', user.id)
    .single()
  if (profileError || !profile?.supplier_id) {
    return {
      error:
        'Tu perfil no tiene una agencia asignada. Pide a un administrador que configure tu supplier_id.',
    }
  }

  // 2. Validar y normalizar las líneas (defensa de UX; el RPC recalcula la autoridad final).
  const rawLines = Array.isArray(input.lines) ? input.lines : []
  if (rawLines.length === 0) {
    return { error: 'Agrega al menos una línea a la venta.' }
  }

  const lines: Array<{
    item_type: ItemType
    passenger_type: PassengerType | null
    description: string | null
    qty: number
    unit_price: number
    line_total: number
  }> = []

  for (const raw of rawLines) {
    if (!ITEM_TYPES.includes(raw.item_type)) {
      return { error: 'Una de las líneas tiene un tipo no válido.' }
    }
    const qty = Number(raw.qty)
    const unitPrice = Number(raw.unit_price)
    if (!Number.isInteger(qty) || qty < 1) {
      return { error: 'Cada línea necesita una cantidad entera de al menos 1.' }
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      return { error: 'El precio unitario de cada línea debe ser un número mayor o igual a 0.' }
    }
    const passengerType: PassengerType | null =
      raw.item_type === 'passenger'
        ? PASSENGER_TYPES.includes(raw.passenger_type as PassengerType)
          ? (raw.passenger_type as PassengerType)
          : 'adult'
        : null

    lines.push({
      item_type: raw.item_type,
      passenger_type: passengerType,
      description: raw.description?.trim() || null,
      qty,
      unit_price: round2(unitPrice),
      line_total: round2(qty * unitPrice),
    })
  }

  // Validación rápida de descuento (defensa de UX; la autoridad final es el RPC).
  const subtotal = round2(
    sumLineTotals(lines.map((l) => ({ qty: l.qty, unitPrice: l.unit_price })))
  )
  const discount = round2(Math.max(0, Number(input.discount) || 0))
  if (round2(subtotal - discount) < 0) {
    return { error: 'El descuento no puede ser mayor que el subtotal.' }
  }

  // 3. Cliente: existente o alta rápida (el RPC valida que sea de tu agencia).
  const customerId = input.customerId ?? null
  const newCustomerName = input.newCustomer?.full_name?.trim()
  if (!customerId && !newCustomerName) {
    return { error: 'Selecciona un cliente o escribe el nombre del nuevo cliente.' }
  }

  // 4. Crear venta + líneas de forma ATÓMICA vía RPC transaccional.
  //    El RPC recalcula totales, deriva selling/owner supplier y valida el cliente.
  const { data: bookingId, error: rpcError } = await supabase.rpc(
    'create_booking_with_items',
    {
      p_customer_id: customerId,
      p_new_customer: customerId
        ? null
        : { full_name: newCustomerName, phone: input.newCustomer?.phone?.trim() || null },
      p_service_id: input.serviceId || null,
      p_travel_date: input.travelDate || null,
      p_discount: discount,
      p_notes: input.notes?.trim() || null,
      p_items: lines.map((l) => ({
        item_type: l.item_type,
        passenger_type: l.passenger_type,
        description: l.description,
        qty: l.qty,
        unit_price: l.unit_price,
      })),
      p_status: input.status ?? 'reserved',
    }
  )
  if (rpcError || !bookingId) {
    return { error: rpcError?.message ?? 'No se pudo guardar la venta.' }
  }

  revalidatePath('/ventas')
  revalidatePath('/cotizaciones')
  if (input.status === 'draft') redirect('/cotizaciones')
  redirect(`/ventas/${bookingId as string}`)
}
