import type { ReactNode } from 'react'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import QRCode from 'qrcode'
import Link from 'next/link'
import { getVoucher } from './data'
import { firmarVoucher, verificarCert } from '@/lib/voucher-cert'
import { createClient } from '@/lib/supabase/server'
import { getBrandLogo } from '@/lib/brand'
import { BrandMark } from '@/components/brand-mark'
import { PoweredByKetzal } from '@/components/data/powered-by-ketzal'
import { ImprimirBoton } from '@/components/imprimir-boton'
import { CompartirWhatsApp } from '@/components/data/compartir-whatsapp'

// Voucher de servicio PÚBLICO (sin sesión): acredita el servicio ante el
// operador/hotel. NO expone dinero (el RPC ya lo omite). Mismo lenguaje de
// documento-papel que /recibo, print-friendly (regla teal como border-t).

const dateFmt = new Intl.DateTimeFormat('es-MX', { dateStyle: 'long' })
function fmtDate(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s.length <= 10 ? `${s}T12:00:00` : s)
  return Number.isNaN(d.getTime()) ? s : dateFmt.format(d)
}

const ESTADO: Record<string, string> = {
  reserved: 'Reservada',
  confirmed: 'Confirmada',
  paid: 'Pagada',
}

const PAX_LABEL: Record<string, string> = {
  adulto: 'Adulto',
  'niño': 'Niño',
  infante: 'Infante',
  'adulto mayor': 'Adulto mayor',
}

function Campo({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold tracking-[0.14em] text-neutral-500 uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-[15px] leading-snug font-medium text-pretty">
        {children}
      </dd>
    </div>
  )
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ voucherId: string }>
}): Promise<Metadata> {
  const { voucherId } = await params
  const v = await getVoucher(voucherId)
  if (!v) return { title: 'Voucher', robots: { index: false } }
  const folio = String(v.folio).padStart(4, '0')
  const title = `Voucher #${folio} — ${v.agencia}`
  const description = [v.servicio, v.cliente ? `Para ${v.cliente}` : null, fmtDate(v.fecha_viaje)]
    .filter(Boolean)
    .join(' · ')
  return {
    title,
    description,
    robots: { index: false },
    openGraph: { title, description, type: 'website' },
    twitter: { card: 'summary_large_image', title, description },
  }
}

function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="text-center">
        <BrandMark className="mx-auto mb-4 size-10 text-primary" />
        <h1 className="text-2xl font-semibold">Voucher no disponible</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          El enlace no es válido o el servicio ya no está vigente. Pide a tu
          agencia que te comparta un enlace nuevo.
        </p>
      </div>
    </main>
  )
}

export default async function VoucherPage({
  params,
  searchParams,
}: {
  params: Promise<{ voucherId: string }>
  searchParams: Promise<{ c?: string | string[] }>
}) {
  const { voucherId } = await params
  const { c } = await searchParams
  const v = await getVoucher(voucherId)
  if (!v) return <NotFound />

  const logo = await getBrandLogo()
  const folio = String(v.folio).padStart(4, '0')
  const estado = ESTADO[v.estado] ?? v.estado

  // b042: QR único con certificado digital (HMAC del uuid). El staff lo
  // escanea al abordar: abre esta misma página con ?c=<firma> y el badge
  // confirma "verificado" (o "inválido" si el documento fue alterado).
  const cert = firmarVoucher(voucherId)
  const h = await headers()
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ?? `https://${h.get('host') ?? 'ketzal-os.vercel.app'}`
  const qrUrl = `${origin}/voucher/${voucherId}${cert ? `?c=${cert}` : ''}`
  const qrDataUrl = await QRCode.toDataURL(qrUrl, { margin: 1, width: 320 })
  const verificado = verificarCert(voucherId, c)

  // b043: si quien abre es STAFF logueado (escaneó con la cámara del sistema),
  // ofrecer el modo abordaje. El comprador (viajero) no lo ve.
  let esStaff = false
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: prof } = await (supabase as any)
      .from('profiles')
      .select('type')
      .eq('id', user.id)
      .maybeSingle()
    esStaff = prof?.type === 'agente'
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 print:max-w-none print:p-0">
      <div className="mb-4 flex flex-wrap items-center justify-end gap-2 print:hidden">
        {esStaff && (
          <Link
            href={`/abordaje/${voucherId}${typeof c === 'string' ? `?c=${c}` : ''}`}
            className="mr-auto rounded-lg border border-[#009E7E]/40 bg-[#009E7E]/10 px-3 py-1.5 text-sm font-semibold text-[#00805F]"
          >
            Modo abordaje →
          </Link>
        )}
        <CompartirWhatsApp
          mensaje="Aquí está tu voucher de servicio:"
          toastOk="Link del voucher copiado"
        />
        <ImprimirBoton />
      </div>

      {verificado != null && (
        <div
          role="status"
          className={`mb-4 rounded-lg border px-4 py-3 text-sm font-semibold print:hidden ${
            verificado
              ? 'border-emerald-300 bg-emerald-500/10 text-emerald-700'
              : 'border-red-300 bg-red-500/10 text-red-700'
          }`}
        >
          {verificado
            ? '✓ Certificado digital verificado — voucher auténtico.'
            : '⚠ Certificado inválido — este voucher NO se pudo verificar. Confirma con la agencia antes de permitir el abordaje.'}
        </div>
      )}

      <article className="overflow-hidden rounded-xl border border-t-4 border-neutral-200 border-t-[#009E7E] bg-white p-6 text-neutral-900 shadow-sm sm:p-10 print:rounded-none print:border-x-0 print:border-b-0 print:p-0 print:pt-8 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-x-8 gap-y-5 break-inside-avoid">
          <div className="flex min-w-0 items-center gap-4">
            {v.logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={v.logo}
                alt={`Logo de ${v.agencia}`}
                className="h-14 w-auto max-w-[150px] shrink-0 object-contain"
              />
            )}
            <h1 className="text-[22px] leading-tight font-bold tracking-tight text-balance">
              {v.agencia}
            </h1>
          </div>
          <div className="ml-auto text-right">
            <p className="text-[11px] font-semibold tracking-[0.22em] text-[#00805F] uppercase">
              Voucher de servicio
            </p>
            <p className="mt-1.5 text-[26px] leading-none font-bold tracking-tight tabular-nums">
              Folio #{folio}
            </p>
            <p className="mt-1.5 text-xs text-neutral-500">
              Emitido {fmtDate(v.fecha_emision)}
            </p>
            <span className="mt-2.5 inline-flex items-center rounded-full border border-[#009E7E]/30 bg-[#009E7E]/10 px-2.5 py-0.5 text-[11px] font-semibold tracking-[0.08em] text-[#00805F] uppercase print:bg-transparent">
              {estado}
            </span>
          </div>
        </header>

        <dl className="mt-8 grid grid-cols-1 gap-x-10 gap-y-6 border-t border-neutral-200 pt-7 break-inside-avoid sm:grid-cols-2">
          <Campo label="Servicio">{v.servicio}</Campo>
          <Campo label="Fecha de viaje">{fmtDate(v.fecha_viaje)}</Campo>
          <Campo label="Titular">{v.cliente ?? '—'}</Campo>
          <Campo label="Pasajeros">{v.pax}</Campo>
        </dl>

        {v.pasajeros.length > 0 && (
          <section className="mt-8 border-t border-neutral-200 pt-7 break-inside-avoid">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-neutral-500 uppercase">
              Lista de pasajeros
            </p>
            <ol className="mt-3 divide-y divide-neutral-200 rounded-lg border border-neutral-200">
              {v.pasajeros.map((p, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                >
                  <span className="font-medium">
                    <span className="mr-2 tabular-nums text-neutral-400">{i + 1}.</span>
                    {p.full_name}
                  </span>
                  <span className="flex items-center gap-2 text-xs text-neutral-500">
                    {p.passenger_type
                      ? PAX_LABEL[p.passenger_type] ?? p.passenger_type
                      : ''}
                    {p.seat != null && (
                      <span className="rounded-md border border-[#009E7E]/30 bg-[#009E7E]/10 px-1.5 py-0.5 font-semibold tabular-nums text-[#00805F]">
                        Asiento {p.seat}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* b042: QR único con certificado digital — el staff lo escanea al
            abordar y la página confirma la autenticidad. */}
        <section className="mt-10 flex items-center justify-center gap-5 border-t border-neutral-200 pt-7 break-inside-avoid">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrDataUrl}
            alt="QR del voucher (certificado digital)"
            className="size-32 shrink-0"
          />
          <div className="max-w-56 text-xs text-neutral-500">
            <p className="font-semibold tracking-[0.14em] text-neutral-600 uppercase">
              Pase de abordaje
            </p>
            <p className="mt-1">
              El staff escanea este QR al abordar para verificar la
              autenticidad del voucher.
            </p>
            {cert && (
              <p className="mt-1.5 font-mono text-[10px] text-neutral-400">
                Cert. {cert}
              </p>
            )}
          </div>
        </section>

        <div className="mt-10 flex justify-center break-inside-avoid print:mt-12">
          <div className="w-60 border-t border-neutral-300 pt-2 text-center">
            <p className="text-[10px] tracking-[0.16em] text-neutral-400 uppercase">
              Sello / firma de la agencia
            </p>
          </div>
        </div>

        <footer className="mt-10 border-t border-neutral-200 pt-5 text-center break-inside-avoid">
          <p className="text-xs font-semibold text-neutral-700">{v.agencia}</p>
          {(v.email || v.telefono) && (
            <p className="mt-1 text-xs text-neutral-500">
              {[v.email, v.telefono].filter(Boolean).join(' · ')}
            </p>
          )}
          <p className="mt-3 text-[10px] text-neutral-500">
            Comprobante de servicio — no es una factura fiscal (CFDI).
          </p>
          <p className="mt-1 text-[10px] text-neutral-400">
            <PoweredByKetzal logoUrl={logo} />
          </p>
        </footer>
      </article>
    </main>
  )
}
