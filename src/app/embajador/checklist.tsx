import { CheckIcon, CircleIcon } from 'lucide-react'
import type { PasoActivacion } from '@/lib/domain/embajador'

// Los primeros pasos para dejar el perfil listo y poder vender. Cada paso se
// DERIVA de un dato real (`pasosActivacion`): no hay palomitas que el embajador
// marque solo. Un checklist que se completa sin hacer nada mide obediencia, no
// activación — y miente en el primer corte, cuando el que "completó todo" no ha
// traído una venta.
//
// Se esconde solo cuando ya está todo hecho: cumplido su trabajo, estorba.

export function Checklist({ pasos }: { pasos: PasoActivacion[] }) {
  const hechos = pasos.filter((p) => p.hecho).length
  if (hechos === pasos.length) return null

  return (
    <section className="rounded-2xl border bg-card p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">Para empezar a vender</h2>
        <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
          {hechos} de {pasos.length}
        </span>
      </div>

      <ol className="mt-3 space-y-2.5">
        {pasos.map((p) => (
          <li key={p.clave} className="flex gap-3">
            {p.hecho ? (
              <CheckIcon
                className="mt-0.5 size-4 shrink-0 text-primary"
                aria-hidden
              />
            ) : (
              <CircleIcon
                className="mt-0.5 size-4 shrink-0 text-muted-foreground/50"
                aria-hidden
              />
            )}
            <div className="min-w-0">
              <p
                className={`text-sm ${p.hecho ? 'text-muted-foreground line-through' : 'font-medium'}`}
              >
                {p.titulo}
              </p>
              {!p.hecho && (
                <p className="text-xs text-muted-foreground">{p.pista}</p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
