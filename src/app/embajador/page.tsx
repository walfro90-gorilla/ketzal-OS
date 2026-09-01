import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { ComoGanas } from './como-ganas'
import type { TarifaEmbajador } from '@/lib/domain/embajador'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { LinkReferido } from '@/components/data/link-referido'
import { pasosActivacion } from '@/lib/domain/embajador'
import { TarjetaPerfil } from './tarjeta-perfil'
import { Checklist } from './checklist'
import { InvitaAmigos } from './invita-amigos'
import { InstalarApp } from '@/components/shell/instalar-app'
import { ConfetiPrimeraVenta } from './confeti'
import { ViajesParaCompartir, type ViajeCompartible } from './viajes-para-compartir'

const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })

const ESTADO: Record<string, string> = {
  reserved: 'Reservada',
  confirmed: 'Confirmada',
  paid: 'Pagada',
}

type Venta = {
  servicio: string | null
  fecha: string | null
  status: string
  comision: number
}
type Earnings = {
  referral_code: string | null
  devengado: number
  /** Solo comisiones, sin el bono por reclutar (b085). */
  comisiones: number
  /** Lo ganado por invitar a otros embajadores. */
  bonos: number
  num_reclutas: number
  pagado: number
  saldo: number
  num_ventas: number
  ventas: Venta[]
}

export default async function EmbajadorPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data, error } = await supabase.rpc('my_ambassador_earnings' as never)

  // Cuánto gana. Con m008 no hay UNA tarifa: cada agencia fija la suya y él
  // cobra la de la agencia dueña del viaje que traiga. Si tiene un trato
  // especial (override por persona), ese gana sobre todas.
  const [{ data: overrideRaw }, { data: porAgenciaRaw }] = await Promise.all([
    supabase
      .from('commission_rules' as never)
      .select('basis, rate, unit_amount')
      .eq('payee_type', 'embajador')
      .eq('scope_profile_id', user?.id ?? '')
      .eq('active', true)
      .maybeSingle(),
    supabase
      .from('commission_rules' as never)
      .select('basis, rate, unit_amount, scope_supplier_id')
      .eq('payee_type', 'embajador')
      .eq('active', true)
      .not('scope_supplier_id', 'is', null),
  ])
  const override = (overrideRaw ?? null) as TarifaEmbajador | null
  const porAgencia = (porAgenciaRaw ?? []) as unknown as (TarifaEmbajador & {
    scope_supplier_id: string
  })[]

  // Nombre de cada agencia para poder decirle "en Border ganas X". Va por el
  // RPC `list_agency_names` (DEFINER, solo id+nombre) y NO por un join a
  // `suppliers`: esa tabla trae correo, teléfono, comisión pactada y la CLABE
  // de los SPEI en `info`, y su policy solo expone la agencia propia — un
  // embajador no tiene por qué ver nada de eso para saber cuánto gana.
  // Perfil propio (foto y nombre para la tarjeta) y catálogo publicado para que
  // pueda compartir un viaje concreto, no solo la vitrina entera.
  // `services_read` deja al embajador ver SOLO lo publicado, así que no hace
  // falta filtrar aquí: la RLS ya lo acota.
  const [
    { data: agenciasRaw },
    { data: miPerfil },
    { data: catalogo },
    { data: clicsRaw },
    { data: pagosRaw },
  ] =
    await Promise.all([
      supabase.rpc('list_agency_names' as never),
      supabase
        .from('profiles' as never)
        .select('name, image')
        .eq('id', user?.id ?? '')
        .maybeSingle(),
      supabase
        .from('services' as never)
        .select('id, name, city_to, state_to, price, supplier_id')
        .eq('published', true)
        .order('name'),
      // Conteos agregados de sus links (b084). `funnel_events` es deny-all: solo
      // se lee por este RPC, y devuelve CUÁNTOS abrieron, nunca quiénes.
      supabase.rpc('my_link_clicks' as never),
      // Sus pagos recibidos (b086c): el agregado solo no se puede conciliar
      // contra el banco, y la primera duda acaba en un WhatsApp al fundador.
      supabase.rpc('my_ambassador_payments' as never),
    ])
  const nombrePorAgencia = new Map(
    ((agenciasRaw ?? []) as unknown as { id: string; name: string }[]).map((a) => [
      a.id,
      a.name,
    ]),
  )
  const tarifasAgencia = porAgencia.map((r) => ({
    agencia: nombrePorAgencia.get(r.scope_supplier_id) ?? 'Otra agencia',
    tarifa: r as TarifaEmbajador,
  }))
  const perfilPropio = miPerfil as { name: string | null; image: string | null } | null

  const clics = (clicsRaw ?? {
    total_clics: 0,
    en_cotizacion: 0,
    por_servicio: [],
  }) as unknown as {
    total_clics: number
    en_cotizacion: number
    por_servicio: { service_id: string; nombre: string | null; clics: number; cotizando: number }[]
  }
  const pagos = (pagosRaw ?? []) as unknown as {
    fecha: string
    monto: number
    concepto: string | null
    metodo: string | null
    agencia: string | null
  }[]

  const clicsPorServicio = new Map(
    (clics.por_servicio ?? []).map((c) => [c.service_id, c]),
  )

  // Origen absoluto para los links que el embajador va a copiar y mandar. Se
  // resuelve AQUÍ (servidor) y no con `window.location` en el cliente: si no,
  // el HTML del servidor y el del cliente traen `href` distintos y React marca
  // hydration mismatch. Sirve igual en local (:3115) que en producción.
  const h = await headers()
  const host = h.get('host') ?? ''
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  const origin = host ? `${proto}://${host}` : ''

  // Viajes publicados, ya con el nombre de su agencia resuelto (mismo mapa que
  // usa la sección de tarifas: no se toca `suppliers`, que trae CLABE y correo).
  const viajes: ViajeCompartible[] = (
    (catalogo ?? []) as unknown as {
      id: string
      name: string
      city_to: string | null
      state_to: string | null
      price: number | null
      supplier_id: string
    }[]
  ).map((s) => ({
    id: s.id,
    nombre: s.name,
    destino: [s.city_to, s.state_to].filter(Boolean).join(', ') || null,
    desde: s.price != null ? Number(s.price) : null,
    agencia: nombrePorAgencia.get(s.supplier_id) ?? null,
    clics: clicsPorServicio.get(s.id)?.clics ?? 0,
    cotizando: clicsPorServicio.get(s.id)?.cotizando ?? 0,
  }))

  const e = (data ?? {
    referral_code: null,
    devengado: 0,
    comisiones: 0,
    bonos: 0,
    num_reclutas: 0,
    pagado: 0,
    saldo: 0,
    num_ventas: 0,
    ventas: [],
  }) as unknown as Earnings

  return (
    <div className="space-y-6">
      <ConfetiPrimeraVenta activo={Number(e.num_ventas ?? 0) > 0} />

      <TarjetaPerfil
        profileId={user?.id ?? ''}
        nombre={perfilPropio?.name ?? null}
        imagen={perfilPropio?.image ?? null}
        codigo={e.referral_code}
        kpis={{
          devengado: Number(e.devengado ?? 0),
          comisiones: Number(e.comisiones ?? 0),
          bonos: Number(e.bonos ?? 0),
          pagado: Number(e.pagado ?? 0),
          saldo: Number(e.saldo ?? 0),
          numVentas: Number(e.num_ventas ?? 0),
        }}
      />

      <Checklist
        pasos={pasosActivacion({
          tieneCodigo: Boolean(e.referral_code),
          tieneFoto: Boolean(perfilPropio?.image),
          clics: Number(clics.total_clics ?? 0),
          ventas: Number(e.num_ventas ?? 0),
        })}
      />

      {error && (
        <p className="text-sm text-destructive">
          No se pudieron cargar tus datos: {error.message}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Tu link de referido</CardTitle>
          <CardDescription>
            Cualquiera que compre entrando por tu link te cuenta como venta.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {e.referral_code ? (
            <LinkReferido code={e.referral_code} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Aún no tienes código de referido. Pídeselo a Ketzal.
            </p>
          )}
        </CardContent>
      </Card>


      <Card>
        <CardHeader>
          <CardTitle>Comparte un viaje</CardTitle>
          <CardDescription>
            Cada link ya lleva tu código: quien compre entrando por ahí te cuenta
            como venta. Al compartirlo salen la foto y el precio del viaje.
            {clics.total_clics > 0 ? (
              <>
                {' '}
                <strong>
                  {clics.total_clics === 1
                    ? '1 persona ya abrió tus links'
                    : `${clics.total_clics} personas ya abrieron tus links`}
                </strong>
                {clics.en_cotizacion > 0
                  ? ` y ${clics.en_cotizacion === 1 ? '1 va' : `${clics.en_cotizacion} van`} a medio comprar.`
                  : '.'}
              </>
            ) : null}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ViajesParaCompartir
            viajes={viajes}
            codigo={e.referral_code}
            origin={origin}
          />
        </CardContent>
      </Card>

      {pagos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Lo que te han pagado</CardTitle>
            <CardDescription>
              Cada depósito con su fecha, para que lo puedas cotejar con tu banco.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {pagos.map((p, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="text-sm">{p.fecha}</p>
                    <p className="text-xs text-muted-foreground">
                      {[p.concepto, p.agencia, p.metodo].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {mxn.format(Number(p.monto ?? 0))}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Invita a un amigo</CardTitle>
        </CardHeader>
        <CardContent>
          <InvitaAmigos
            nombre={perfilPropio?.name ?? null}
            monto={300}
            reclutas={Number(e.num_reclutas ?? 0)}
            bonosGanados={Number(e.bonos ?? 0)}
          />
        </CardContent>
      </Card>

      <InstalarApp />

      <Card>
        <CardHeader>
          <CardTitle>Tus ventas</CardTitle>
          <CardDescription>Viajes vendidos con tu código.</CardDescription>
        </CardHeader>
        <CardContent>
          {e.ventas.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aún no tienes ventas. Comparte tu link para empezar.
            </p>
          ) : (
            <ul className="divide-y">
              {e.ventas.map((v, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {v.servicio ?? 'Viaje'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {ESTADO[v.status] ?? v.status}
                      {v.fecha ? ` · ${v.fecha}` : ''}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {mxn.format(Number(v.comision ?? 0))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Al final y colapsable: se lee una vez. Abierta solo para quien aún no
          vende — a ese sí le sirve tenerla enfrente. */}
      <ComoGanas
        override={override}
        porAgencia={tarifasAgencia}
        abiertoPorDefecto={Number(e.num_ventas ?? 0) === 0}
      />
    </div>
  )
}
