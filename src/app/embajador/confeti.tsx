'use client'

import { useEffect, useState } from 'react'

// Confeti por la PRIMERA COMISIÓN, no por abrir el tour. Celebrar que alguien
// instaló algo no premia nada; celebrar su primera venta premia justo la
// conducta que quieres que repita.
//
// Sin dependencia nueva: son divs con dos animaciones CSS (ADR-0003, no
// sobre-ingeniería). Una librería de confeti son ~15 KB para doce segundos de
// alegría al año.
//
// La marca de "ya lo vio" vive en localStorage a propósito: es una cortesía por
// navegador, no un hecho del negocio. Si cambia de teléfono y lo ve otra vez,
// no pasa nada; si fuera una columna, sería estado que mantener para siempre.

const VISTO = 'kz_confeti_primera_venta'
const PIEZAS = 40
const COLORES = ['#009E7E', '#3DDE1C', '#DF001A', '#F5C518', '#4C9AFF']

export function ConfetiPrimeraVenta({ activo }: { activo: boolean }) {
  const [mostrar, setMostrar] = useState(false)

  useEffect(() => {
    if (!activo) return
    let yaVisto = false
    try {
      yaVisto = localStorage.getItem(VISTO) === '1'
    } catch {
      // Safari privado / webview: mejor no mostrarlo que reventar el portal.
      yaVisto = true
    }
    if (yaVisto) return
    try {
      localStorage.setItem(VISTO, '1')
    } catch {
      /* si no se puede marcar, se verá otra vez; no es grave */
    }
    // El linter marca `setState` dentro de un efecto, pero este ES el caso que
    // la propia regla permite: sincronizar con un sistema externo (localStorage)
    // que solo existe en el cliente. Hacerlo en el render provocaría un
    // hydration mismatch, que es un bug peor que un render de más.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMostrar(true)
    const t = setTimeout(() => setMostrar(false), 4000)
    return () => clearTimeout(t)
  }, [activo])

  if (!mostrar) return null

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-50 overflow-hidden motion-reduce:hidden"
    >
      {Array.from({ length: PIEZAS }, (_, i) => (
        <span
          key={i}
          className="absolute top-[-10vh] block size-2 rounded-[1px]"
          style={{
            left: `${(i * 97) % 100}%`,
            background: COLORES[i % COLORES.length],
            animation: `kz-caer ${2.4 + ((i * 13) % 18) / 10}s linear ${((i * 7) % 12) / 10}s forwards, kz-girar ${0.6 + ((i * 5) % 9) / 10}s linear infinite`,
          }}
        />
      ))}
      <style>{`
        @keyframes kz-caer { to { transform: translateY(115vh); opacity: 0 } }
        @keyframes kz-girar { to { rotate: 360deg } }
      `}</style>
    </div>
  )
}
