import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { logSistema } from '@/lib/system-log'

// Clawbot tick — lo llama Vercel Cron a diario (ver vercel.json). (1) genera los
// recordatorios del día en el outbox (idempotente); (2) corre el chequeo de
// invariantes de dinero (monitoreo). Todo queda en system_log. Protegido con
// CRON_SECRET (Vercel Cron manda `Authorization: Bearer <CRON_SECRET>`).
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, reason: 'unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  // 1. Generar recordatorios del día.
  const { data: pendientes, error: genErr } = await supabase.rpc(
    'clawbot_generar_recordatorios' as never
  )
  if (genErr) {
    await logSistema(supabase, 'clawbot_tick', 'error', 'fallo al generar recordatorios', {
      message: genErr.message,
    })
    return NextResponse.json({ ok: false, reason: genErr.message }, { status: 500 })
  }
  await logSistema(supabase, 'clawbot_tick', 'info', 'recordatorios generados', {
    pendientes,
  })

  // 2. Chequeo de invariantes de dinero (monitoreo diario).
  const { data: inv, error: invErr } = await supabase.rpc(
    'verificar_invariantes' as never
  )
  if (invErr) {
    await logSistema(supabase, 'invariantes', 'error', 'fallo al verificar invariantes', {
      message: invErr.message,
    })
  } else {
    const n = (inv as { violaciones?: number } | null)?.violaciones ?? 0
    await logSistema(
      supabase,
      'invariantes',
      n > 0 ? 'critical' : 'info',
      n > 0 ? 'violaciones de dinero detectadas' : 'invariantes OK',
      inv
    )
  }

  return NextResponse.json({ ok: true, pendientes, invariantes: inv })
}
