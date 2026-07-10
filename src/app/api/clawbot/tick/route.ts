import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

// Clawbot tick — lo llama Vercel Cron a diario (ver vercel.json). Genera los
// recordatorios del día en el outbox (idempotente). Protegido con CRON_SECRET:
// Vercel Cron manda `Authorization: Bearer <CRON_SECRET>` cuando la env var está
// puesta. El proxy deja pasar `/api/*` (manejan su propia auth).
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, reason: 'unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  // `clawbot_generar_recordatorios` no está en los tipos generados a mano;
  // cast puntual del nombre (mismo patrón que src/app/(ops)/cobranza/data.ts).
  const { data, error } = await supabase.rpc(
    'clawbot_generar_recordatorios' as never
  )
  if (error) {
    return NextResponse.json({ ok: false, reason: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, pendientes: data })
}
