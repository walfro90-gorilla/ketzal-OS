'use client'

import { useEffect } from 'react'
import { toast } from 'sonner'
import { lanzarConfeti } from '@/lib/confeti'

// Celebra que la agencia terminó "Primeros pasos": pasó de no poder vender a
// poder hacerlo. Es el momento que de verdad vale, más que entrar por primera
// vez, y hasta ahora no se marcaba de ninguna forma: la tarjeta simplemente
// desaparecía del Panel.
//
// No pinta nada. Va montado aparte de `ChecklistArranque` justamente porque esa
// tarjeta sólo existe mientras `pendientes > 0`: cuando llega a cero se
// desmonta, así que desde ahí no hay nada que pueda celebrar su propio final.

const CLAVE = 'ketzal_onboarding_pendientes_v1'

/**
 * Celebra sólo la TRANSICIÓN de "faltaban cosas" a "no falta nada".
 *
 * Guardar únicamente "ya se celebró" no basta: alguien que se une a una agencia
 * ya lista vería confeti por un trabajo que no hizo. Comparando contra lo que
 * este navegador vio la última vez, sólo festeja quien estaba viendo pendientes
 * y ahora no.
 *
 * `anterior` null = primera vez que este navegador mira el Panel: no se celebra,
 * porque no hay transición que probar.
 */
export function debeCelebrar(anterior: number | null, actual: number): boolean {
  return anterior !== null && anterior > 0 && actual === 0
}

export function CelebracionArranque({ pendientes }: { pendientes: number }) {
  useEffect(() => {
    let anterior: number | null = null
    try {
      const raw = localStorage.getItem(CLAVE)
      const n = raw === null ? NaN : Number(raw)
      anterior = Number.isInteger(n) ? n : null
      localStorage.setItem(CLAVE, String(pendientes))
    } catch {
      // ponytail: modo privado o storage bloqueado ⇒ no se celebra. El techo es
      // que la marca es por navegador: quien termine el checklist en la compu y
      // luego abra el Panel en el celular no ve confeti allá (bien), pero
      // tampoco lo ve si termina justo en un navegador nuevo (aceptable para un
      // adorno). Subirlo a la BD pediría una columna en `suppliers`.
      return
    }
    if (!debeCelebrar(anterior, pendientes)) return
    void lanzarConfeti()
    toast.success('Tu agencia ya está lista para vender.', {
      description: 'Terminaste los primeros pasos. El checklist desaparece del Panel.',
    })
  }, [pendientes])

  return null
}
