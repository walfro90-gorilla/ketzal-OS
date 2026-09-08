'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

// Índice lateral de la ficha de servicio. El formulario creció hasta el punto
// de que encontrar una sección costaba scroll a ciegas; esto la nombra y salta.
//
// Escrito a mano en vez de traer una librería de scrollspy: son ~40 líneas y un
// `IntersectionObserver`, que es justo lo que haría la librería.
//
// SOLO EN ESCRITORIO (`hidden lg:block` donde se monta). En celular la columna
// no cabe, y el formulario ya es una sola columna donde el pulgar recorre
// rápido; una barra horizontal pegajosa robaría alto de pantalla a los campos,
// que es lo escaso ahí.
//
// El salto es un ancla `<a href="#id">` de toda la vida, así que funciona sin
// JavaScript y el teclado lo recorre solo. El observador únicamente pinta cuál
// está activa; si nunca corre, el índice sigue navegando.

export type SeccionFicha = { id: string; label: string }

export function IndiceSecciones({ secciones }: { secciones: SeccionFicha[] }) {
  const [observada, setObservada] = useState<string | null>(null)
  const [ultimaVisible, setUltimaVisible] = useState(false)

  // La última sección MANDA cuando se ve, y se decide al pintar, no escribiendo
  // el mismo estado desde dos lados (eso era una carrera: los dos disparaban en
  // el mismo scroll y ganaba el que corriera al final — medido, quedaba
  // "Salidas" encendida estando en "Zona de peligro").
  const ultima = secciones[secciones.length - 1]?.id ?? null
  const activa = ultimaVisible ? ultima : observada

  useEffect(() => {
    const nodos = secciones
      .map((s) => document.getElementById(s.id))
      .filter((n): n is HTMLElement => n !== null)
    if (!nodos.length) return

    // `rootMargin` recorta la ventana a una franja alta: sin él, con secciones
    // cortas hay varias visibles a la vez y la marca parpadea entre ellas.
    const obs = new IntersectionObserver(
      (entradas) => {
        const visibles = entradas
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visibles[0]) setObservada(visibles[0].target.id)
      },
      { rootMargin: '-140px 0px -55% 0px', threshold: 0 },
    )
    for (const n of nodos) obs.observe(n)

    // Segundo observador SOLO para la última sección, sin recorte inferior.
    // El de arriba nunca la enciende: al llegar al final ya no queda scroll,
    // así que jamás alcanza la franja de arriba. Y no se puede resolver mirando
    // `window.scrollY`: en esta app la ventana NO hace scroll — lo hace un
    // contenedor del shell (`div.min-h-0.flex-1.overflow-y-auto`), medido en el
    // navegador. Un observador no necesita saber quién scrollea.
    const fin = nodos[nodos.length - 1]!
    const obsFin = new IntersectionObserver(
      ([e]) => setUltimaVisible(Boolean(e?.isIntersecting)),
      { threshold: 0 },
    )
    obsFin.observe(fin)

    return () => {
      obs.disconnect()
      obsFin.disconnect()
    }
  }, [secciones])

  return (
    <nav aria-label="Secciones de la ficha" className="sticky top-32">
      <p className="px-3 pb-2 text-xs font-medium text-muted-foreground">
        En esta ficha
      </p>
      <ul className="space-y-0.5 border-l">
        {secciones.map((s) => {
          const esActiva = activa === s.id
          return (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                aria-current={esActiva ? 'true' : undefined}
                className={cn(
                  '-ml-px block border-l-2 py-1.5 pl-3 text-sm transition-colors',
                  esActiva
                    ? 'border-primary font-medium text-foreground'
                    : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
                )}
              >
                {s.label}
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
