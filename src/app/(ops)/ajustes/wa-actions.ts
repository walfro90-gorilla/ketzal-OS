'use server'

import QRCode from 'qrcode'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { safeError } from '@/lib/errors'

// Conexión de WhatsApp (b069). El bridge de Baileys corre en una box con PM2,
// fuera de Vercel y detrás de NAT: la app no puede llamarlo. La box publica su
// estado en `ketzal.wa_session` con service role y lee de ahí los comandos.
//
// El QR se convierte a imagen AQUÍ y no en el navegador: así `qrcode` no entra
// al bundle del cliente, que sólo recibe un data URL ya listo.

/** El QR de Baileys rota cada ~20 s; más viejo que esto ya no sirve para nada. */
const QR_VIGENCIA_MS = 60_000
/** Sin latido reciente la box está apagada, no "desconectada". */
const LATIDO_MS = 90_000

export type EstadoWa = {
  /** Estado que reportó la box. */
  estado: 'DESCONOCIDO' | 'STARTING' | 'UNPAIRED' | 'CONNECTED' | 'STOPPED'
  /** Número conectado, cuando lo hay. */
  numero: string | null
  /** QR listo para pintar, sólo si está fresco. */
  qr: string | null
  /** ¿La box dio señales de vida hace poco? */
  viva: boolean
  ultimoLatido: string | null
  comandoPendiente: string | null
  nota: string | null
  /** Gate del envío automático (app_settings). */
  envioAuto: boolean
  topeDiario: number
  /** Cuántos recordatorios están esperando salir. */
  enEspera: number
}

async function soySuperadmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { supabase, ok: false as const }
  const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return { supabase, ok: data?.role === 'superadmin' }
}

export async function estadoWhatsApp(): Promise<{ error: string } | EstadoWa> {
  const { supabase, ok } = await soySuperadmin()
  if (!ok) return { error: 'Solo el superadmin puede ver la conexión de WhatsApp.' }

  const [sesionRes, ajustesRes] = await Promise.all([
    // RLS: `wa_session_sel` ya exige superadmin; esto es la vista, no el guard.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('wa_session').select('*').eq('id', 1).maybeSingle(),
    supabase
      .from('app_settings')
      .select('wa_auto_enabled, wa_daily_cap')
      .eq('id', 1)
      .maybeSingle(),
  ])

  const s = sesionRes.data as {
    state?: string
    qr?: string | null
    qr_at?: string | null
    wa_number?: string | null
    last_seen_at?: string | null
    command?: string | null
    note?: string | null
  } | null
  const ajustes = ajustesRes.data as { wa_auto_enabled?: boolean; wa_daily_cap?: number } | null

  // El outbox cruza agencias, así que el conteo va con service role — después
  // del guard de arriba, nunca antes.
  const svc = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count } = await (svc as any)
    .from('clawbot_reminders')
    .select('id', { count: 'exact', head: true })
    .is('sent_at', null)

  const fresco = (iso: string | null | undefined, ventana: number) =>
    Boolean(iso) && Date.now() - new Date(iso as string).getTime() < ventana

  const qrCrudo = fresco(s?.qr_at, QR_VIGENCIA_MS) ? (s?.qr ?? null) : null

  return {
    estado: (s?.state as EstadoWa['estado']) ?? 'DESCONOCIDO',
    numero: s?.wa_number ?? null,
    qr: qrCrudo ? await QRCode.toDataURL(qrCrudo, { margin: 1, width: 280 }) : null,
    viva: fresco(s?.last_seen_at, LATIDO_MS),
    ultimoLatido: s?.last_seen_at ?? null,
    comandoPendiente: s?.command ?? null,
    nota: s?.note ?? null,
    envioAuto: ajustes?.wa_auto_enabled ?? false,
    topeDiario: ajustes?.wa_daily_cap ?? 0,
    enEspera: count ?? 0,
  }
}

/**
 * Le pide algo a la box: `restart` para generar un QR nuevo, `logout` para
 * desligar el teléfono. `null` cancela un comando que quedó colgado.
 */
export async function comandoWhatsApp(
  comando: 'restart' | 'logout' | null
): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient()
  // El guard vive en el RPC (`wa_send_command` exige superadmin).
  const { error } = await supabase.rpc('wa_send_command' as never, {
    p_command: comando,
  } as never)
  if (error) return { error: safeError(error) }
  revalidatePath('/ajustes')
  return { ok: true }
}

/**
 * Prende o apaga el envío automático. **Prenderlo hace que salgan mensajes de
 * WhatsApp reales a clientes reales**, así que la UI lo confirma antes.
 */
export async function guardarEnvioAuto(
  encendido: boolean,
  tope: number
): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient()
  const cap = Math.max(0, Math.min(2000, Math.trunc(Number(tope) || 0)))

  // RLS: `app_settings_write = is_superadmin()`. Cero filas = sin permiso.
  const { data, error } = await supabase
    .from('app_settings')
    .update({ wa_auto_enabled: encendido, wa_daily_cap: cap } as never)
    .eq('id', 1)
    .select('id')
    .single()
  if (error || !data) {
    return { error: safeError(error, 'No se pudo guardar o no tienes permiso.') }
  }
  revalidatePath('/ajustes')
  return { ok: true }
}

/**
 * Corre el motor de Clawbot ahora mismo, lo mismo que hace el cron a diario:
 * llena el outbox con los recordatorios que tocan. Es idempotente (dedupe por
 * `dedupe_key`), así que correrlo dos veces no duplica nada.
 *
 * Va con service role porque `clawbot_generar_recordatorios` sólo se lo permite
 * a él — por eso el guard de superadmin se verifica ANTES, aquí en la app: el
 * service role se salta la RLS.
 */
export async function generarRecordatorios(): Promise<
  { error: string } | { ok: true; motor: number; operativas: number }
> {
  const { ok } = await soySuperadmin()
  if (!ok) return { error: 'Solo el superadmin puede correr el motor.' }

  const svc = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cliente = svc as any
  const { data: motor, error: e1 } = await cliente.rpc('clawbot_generar_recordatorios')
  if (e1) return { error: safeError(e1) }
  // Reglas operativas (F7): función aparte del motor, también idempotente.
  const { data: operativas, error: e2 } = await cliente.rpc('clawbot_reglas_operativas')
  if (e2) return { error: safeError(e2) }

  revalidatePath('/ajustes')
  revalidatePath('/clawbot')
  return { ok: true, motor: Number(motor ?? 0), operativas: Number(operativas ?? 0) }
}
