import type { ReactNode } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ImprimirBoton } from '@/components/imprimir-boton'
import { CompartirRecibo } from './compartir-recibo'

// Recibo imprimible PÚBLICO (sin sesión): el agente comparte el link por
// WhatsApp y el cliente final lo abre sin login. Los datos pasan por el RPC
// get_receipt_public (callable por anon); misma receta que /estado/[token].
// El botón "Imprimir / Guardar PDF" usa el diálogo del navegador.
//
// Diseño: documento tipo papel (siempre claro, incluso en dark mode). Los
// acentos teal de marca van SIEMPRE acompañados de peso/regla/borde para que
// el recibo lea perfecto en impresión blanco y negro. La regla teal superior
// es un border (no background) porque los fondos no se imprimen por defecto.

// El RPC devuelve jsonb: tipamos el resultado localmente y casteamos.
type Recibo = {
  agencia: string
  logo: string | null
  email: string | null
  telefono: string | null
  folio: number
  fecha: string // ISO timestamp (issued_at)
  cliente: string | null
  concepto: string
  metodo: string | null
  tipo: 'payment' | 'refund'
  monto: number // monto de ESTE recibo
  total: number // total de la venta
  pagado: number
  saldo: number // puede ser <= 0 (liquidada / a favor)
  moneda: string // 'MXN'
}

const dateFmt = new Intl.DateTimeFormat('es-MX', { dateStyle: 'long' })

function fmtDate(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? s : dateFmt.format(d)
}

const METHOD_LABELS: Record<string, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  deposito: 'Depósito',
  tarjeta: 'Tarjeta',
  mercado_pago: 'Mercado Pago',
  mercadopago: 'Mercado Pago',
  otro: 'Otro',
}

// —— Cantidad con letra (convención mexicana: "DOS MIL PESOS 00/100 M.N.") ——
// Puramente presentacional: se deriva del monto real, sin tocar datos.

const UNIDADES = [
  '', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho',
  'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince',
  'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte',
]
// Irregulares con acento / apócope al concatenar "veinti…".
const VEINTIS: Record<number, string> = {
  21: 'veintiún', 22: 'veintidós', 23: 'veintitrés', 26: 'veintiséis',
}
const DECENAS = [
  '', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta',
  'setenta', 'ochenta', 'noventa',
]
const CENTENAS = [
  '', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos',
  'seiscientos', 'setecientos', 'ochocientos', 'novecientos',
]

function decenasALetras(n: number): string {
  if (n <= 20) return UNIDADES[n]
  if (n < 30) return VEINTIS[n] ?? `veinti${UNIDADES[n - 20]}`
  const d = Math.floor(n / 10)
  const u = n % 10
  return u === 0 ? DECENAS[d] : `${DECENAS[d]} y ${UNIDADES[u]}`
}

function centenasALetras(n: number): string {
  if (n === 100) return 'cien'
  const c = Math.floor(n / 100)
  const r = n % 100
  return [CENTENAS[c], r ? decenasALetras(r) : ''].filter(Boolean).join(' ')
}

function enteroALetras(n: number): string {
  if (n === 0) return 'cero'
  const millones = Math.floor(n / 1_000_000)
  const miles = Math.floor(n / 1000) % 1000
  const resto = n % 1000
  const partes: string[] = []
  if (millones) {
    partes.push(millones === 1 ? 'un millón' : `${centenasALetras(millones)} millones`)
  }
  if (miles) partes.push(miles === 1 ? 'mil' : `${centenasALetras(miles)} mil`)
  if (resto) partes.push(centenasALetras(resto))
  return partes.join(' ')
}

/** "dos mil quinientos pesos 00/100 M.N." — null si el monto sale de rango. */
function montoConLetra(monto: number): string | null {
  const cents = Math.round(Math.abs(monto) * 100)
  if (!Number.isFinite(cents) || cents >= 100_000_000_000) return null
  const entero = Math.floor(cents / 100)
  const centavos = cents % 100
  const pesos = entero === 1 ? 'peso' : 'pesos'
  // "un millón DE pesos" solo cuando el entero es millón exacto.
  const de = entero >= 1_000_000 && entero % 1_000_000 === 0 ? ' de' : ''
  return `${enteroALetras(entero)}${de} ${pesos} ${String(centavos).padStart(2, '0')}/100 M.N.`
}

/** Celda etiquetada del recibo: label chico en mayúsculas + valor medium. */
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

function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Recibo no disponible</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          El enlace no es válido o el recibo ya no está disponible. Pide a tu
          agencia que te comparta un enlace nuevo.
        </p>
      </div>
    </main>
  )
}

export default async function ReciboPage({
  params,
}: {
  params: Promise<{ receiptId: string }>
}) {
  const { receiptId } = await params
  const supabase = await createClient()

  // Sin sesión, el cliente server usa la anon key: el RPC es callable por anon.
  // Un id malformado (no-uuid) hace fallar el RPC → misma pantalla de no encontrado.
  const { data, error } = await supabase.rpc('get_receipt_public', {
    p_receipt_id: receiptId,
  })

  if (error || data == null) return <NotFound />
  const r = data as unknown as Recibo

  const money = new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: r.moneda || 'MXN',
  })
  const isRefund = r.tipo === 'refund'
  const saldo = Number(r.saldo)
  const liquidada = saldo <= 0
  const folio = String(r.folio).padStart(4, '0')
  const metodo = r.metodo ? METHOD_LABELS[r.metodo] ?? r.metodo : '—'
  const letra =
    (r.moneda || 'MXN') === 'MXN' ? montoConLetra(Number(r.monto)) : null
  // Teal de interacción (AA sobre blanco) para abonos; rojo de marca para reembolsos.
  const accentText = isRefund ? 'text-[#C00017]' : 'text-[#00805F]'
  const chipTint = isRefund
    ? 'border-[#DF001A]/30 bg-[#DF001A]/5 text-[#C00017]'
    : 'border-[#009E7E]/30 bg-[#009E7E]/10 text-[#00805F]'

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 print:max-w-none print:p-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href="/ventas" className="text-sm text-muted-foreground hover:underline">
          ← Volver
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <CompartirRecibo />
          <ImprimirBoton />
        </div>
      </div>

      {/* Papel del recibo. La regla teal superior es border-t: sobrevive a la
          impresión B/N aunque el navegador omita los fondos. */}
      <article className="overflow-hidden rounded-xl border border-t-4 border-neutral-200 border-t-[#009E7E] bg-white p-6 text-neutral-900 shadow-sm sm:p-10 print:rounded-none print:border-x-0 print:border-b-0 print:p-0 print:pt-8 print:shadow-none">
        {/* Encabezado: identidad de la agencia vs. identidad del documento */}
        <header className="flex flex-wrap items-start justify-between gap-x-8 gap-y-5 break-inside-avoid">
          <div className="flex min-w-0 items-center gap-4">
            {r.logo && (
              // Logo externo (URL fuera del dominio): <img> plano a propósito.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={r.logo}
                alt={`Logo de ${r.agencia}`}
                className="h-14 w-auto max-w-[150px] shrink-0 object-contain"
              />
            )}
            <h1 className="text-[22px] leading-tight font-bold tracking-tight text-balance">
              {r.agencia}
            </h1>
          </div>
          <div className="ml-auto text-right">
            <p className={`text-[11px] font-semibold tracking-[0.22em] uppercase ${accentText}`}>
              {isRefund ? 'Recibo de reembolso' : 'Recibo de pago'}
            </p>
            <p className="mt-1.5 text-[26px] leading-none font-bold tracking-tight tabular-nums">
              Folio #{folio}
            </p>
            <p className="mt-1.5 text-xs text-neutral-500">{fmtDate(r.fecha)}</p>
            <span
              className={`mt-2.5 inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-[0.08em] uppercase ${chipTint} print:bg-transparent`}
            >
              {isRefund ? 'Reembolso' : 'Abono'}
            </span>
          </div>
        </header>

        {/* Campos del recibo */}
        <dl className="mt-8 grid grid-cols-1 gap-x-10 gap-y-6 border-t border-neutral-200 pt-7 break-inside-avoid sm:grid-cols-2">
          <Campo label="Recibí de">{r.cliente ?? '—'}</Campo>
          <Campo label="Fecha de emisión">{fmtDate(r.fecha)}</Campo>
          <Campo label="Concepto">{r.concepto}</Campo>
          <Campo label="Método de pago">{metodo}</Campo>
        </dl>

        {/* Bloque focal: el monto de ESTE recibo, con cantidad en letra */}
        <section className="mt-9 border-y border-neutral-200 py-8 text-center break-inside-avoid">
          <p className={`text-[11px] font-semibold tracking-[0.22em] uppercase ${accentText}`}>
            {isRefund ? 'Monto reembolsado' : 'Monto recibido'}
          </p>
          <p className="mt-3 text-4xl leading-none font-bold tracking-tight tabular-nums sm:text-[44px]">
            {money.format(Number(r.monto))}
            <span className="ml-2 align-baseline text-base font-semibold tracking-normal text-neutral-400">
              {r.moneda || 'MXN'}
            </span>
          </p>
          {letra && (
            <p className="mt-3 text-[11px] font-medium tracking-[0.04em] text-neutral-500 uppercase">
              ({letra})
            </p>
          )}
        </section>

        {/* Estado de la venta: sello LIQUIDADA + resumen de números */}
        <section className="mt-8 flex flex-wrap items-center justify-between gap-6 break-inside-avoid">
          {liquidada && (
            <div className="-rotate-3 rounded-lg border-4 border-double border-[#009E7E]/70 px-4 py-1.5">
              <p className="text-sm font-bold tracking-[0.28em] text-[#00805F] uppercase">
                Liquidada
              </p>
            </div>
          )}
          <dl className="ml-auto w-full max-w-[280px] space-y-2.5 text-sm">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-neutral-500">Total de la venta</dt>
              <dd className="font-medium tabular-nums">{money.format(Number(r.total))}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-neutral-500">Pagado a la fecha</dt>
              <dd className="font-medium tabular-nums">{money.format(Number(r.pagado))}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 border-t border-neutral-200 pt-2.5 text-[15px] font-semibold">
              <dt>Saldo pendiente</dt>
              <dd className={`tabular-nums ${liquidada ? 'text-[#00805F]' : ''}`}>
                {liquidada ? 'Liquidada' : money.format(saldo)}
              </dd>
            </div>
          </dl>
        </section>

        {/* Línea de sello/firma: da formalidad al comprobante impreso */}
        <div className="mt-14 flex justify-center break-inside-avoid print:mt-16">
          <div className="w-60 border-t border-neutral-300 pt-2 text-center">
            <p className="text-[10px] tracking-[0.16em] text-neutral-400 uppercase">
              Sello / firma de la agencia
            </p>
          </div>
        </div>

        {/* Pie: contacto de la agencia + aviso legal interno */}
        <footer className="mt-10 border-t border-neutral-200 pt-5 text-center break-inside-avoid">
          <p className="text-xs font-semibold text-neutral-700">{r.agencia}</p>
          {(r.email || r.telefono) && (
            <p className="mt-1 text-xs text-neutral-500">
              {[r.email, r.telefono].filter(Boolean).join(' · ')}
            </p>
          )}
          <p className="mt-3 text-[10px] text-neutral-500">
            Comprobante interno — no es una factura fiscal (CFDI).
          </p>
        </footer>
      </article>
    </main>
  )
}
