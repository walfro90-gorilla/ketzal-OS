import Link from 'next/link'
import { Building2Icon, MegaphoneIcon, UsersRoundIcon } from 'lucide-react'
import { AgenciaLogo } from '@/components/public/agencia-logo'

// Cabecera del panel para el SUPERADMIN. Él no pertenece a ninguna agencia:
// las administra todas, así que "tu agencia" no le dice nada — y hasta ahora el
// panel llegaba a ofrecerle "Solicitar entrar" a sus propias agencias, porque el
// RPC de agente libre no distingue "sin agencia" de "dueño de todo".
//
// En su lugar responde la pregunta que sí es suya: **quién se está sumando a
// Ketzal**. Tres cifras y tres filas —agencias, embajadores, viajeros— para
// verlo de un vistazo desde el teléfono.
//
// Los carruseles son scroll horizontal con snap: CSS puro, sin librería y sin
// JS. Con dos o tres logos se ven como una fila normal; cuando sean veinte, el
// gesto ya está.

export type AgenciaResumen = { id: string; nombre: string; logo: string | null }
export type PersonaResumen = { id: string; nombre: string; avatar: string | null }

function Cifra({
  n,
  uno,
  varios,
  icon: Icon,
  href,
}: {
  n: number
  uno: string
  varios: string
  icon: typeof Building2Icon
  href: string
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-1.5 rounded-lg px-2 py-1 transition-colors hover:bg-muted/60"
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="text-xl font-semibold tabular-nums">{n}</span>
      <span className="text-xs text-muted-foreground">{n === 1 ? uno : varios}</span>
    </Link>
  )
}

/** Fila deslizable. `vacio` se muestra mientras no hay nadie. */
function Carrusel({
  titulo,
  vacio,
  hay,
  children,
}: {
  titulo: string
  vacio: string
  hay: boolean
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{titulo}</p>
      {hay ? (
        <ul className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {children}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
          {vacio}
        </p>
      )}
    </div>
  )
}

/** Foto de la persona, o su inicial. Casi nadie sube foto todavía. */
function Cara({ persona }: { persona: PersonaResumen }) {
  return (
    <li className="w-[4.5rem] shrink-0 snap-start">
      <div className="flex flex-col items-center gap-1 p-1 text-center">
        {persona.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={persona.avatar}
            alt=""
            className="size-11 rounded-full border object-cover sm:size-12"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span
            aria-hidden
            className="flex size-11 items-center justify-center rounded-full border bg-primary/10 text-lg font-bold text-primary sm:size-12"
          >
            {persona.nombre.trim().charAt(0).toUpperCase()}
          </span>
        )}
        <span className="line-clamp-2 text-[0.7rem] leading-tight">
          {persona.nombre}
        </span>
      </div>
    </li>
  )
}

export function ResumenPlataforma({
  agencias,
  embajadores,
  viajeros,
  totalEmbajadores,
  totalViajeros,
}: {
  agencias: AgenciaResumen[]
  embajadores: PersonaResumen[]
  viajeros: PersonaResumen[]
  totalEmbajadores: number
  totalViajeros: number
}) {
  return (
    <section
      aria-label="Quién se está sumando a Ketzal"
      className="space-y-3 rounded-2xl border bg-card p-3.5 sm:p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div>
          <p className="font-display text-lg leading-tight font-semibold tracking-[-0.01em]">
            Ketzal
          </p>
          <p className="text-xs text-muted-foreground">Quién se está sumando</p>
        </div>
        <div className="-mx-2 flex flex-wrap items-center">
          <Cifra
            n={agencias.length}
            uno="agencia"
            varios="agencias"
            icon={Building2Icon}
            href="/proveedores"
          />
          <Cifra
            n={totalEmbajadores}
            uno="embajador"
            varios="embajadores"
            icon={MegaphoneIcon}
            href="/comisiones"
          />
          <Cifra
            n={totalViajeros}
            uno="viajero"
            varios="viajeros"
            icon={UsersRoundIcon}
            href="/viajeros"
          />
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3 lg:gap-6">
      <Carrusel
        titulo="Agencias"
        hay={agencias.length > 0}
        vacio="Todavía no hay agencias dadas de alta."
      >
        {agencias.map((a) => (
          <li key={a.id} className="w-[4.5rem] shrink-0 snap-start">
            <Link
              href={`/proveedores/${a.id}`}
              className="flex flex-col items-center gap-1 rounded-xl p-1 text-center transition-colors hover:bg-muted/60"
            >
              <AgenciaLogo url={a.logo} nombre={a.nombre} tamano="md" className="size-11 sm:size-12" />
              <span className="line-clamp-2 text-[0.7rem] leading-tight">
                {a.nombre}
              </span>
            </Link>
          </li>
        ))}
      </Carrusel>

      <Carrusel
        titulo="Embajadores"
        hay={embajadores.length > 0}
        vacio="Nadie está promoviendo todavía. Da de alta a tu primer embajador en Comisiones."
      >
        {embajadores.map((e) => (
          <Cara key={e.id} persona={e} />
        ))}
      </Carrusel>

      <Carrusel
        titulo="Últimos viajeros"
        hay={viajeros.length > 0}
        vacio="Nadie ha creado su cuenta de viajero todavía."
      >
        {viajeros.map((v) => (
          <Cara key={v.id} persona={v} />
        ))}
      </Carrusel>
      </div>
    </section>
  )
}
