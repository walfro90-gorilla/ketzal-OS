'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setServicioPublicado } from './actions'
import { badgeVariants } from '@/components/ui/badge'

/**
 * Toggle inline en la lista de Servicios para prender/apagar la publicación en
 * el catálogo público. stopPropagation: la fila navega al detalle; el badge no.
 */
export function PublicarToggle({
  id,
  publicado,
}: {
  id: string
  publicado: boolean
}) {
  const [pending, start] = useTransition()
  const router = useRouter()

  function toggle(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    start(async () => {
      await setServicioPublicado(id, !publicado)
      router.refresh()
    })
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      title={publicado ? 'Quitar del catálogo público' : 'Publicar en el catálogo'}
      className={`${badgeVariants({ variant: publicado ? 'default' : 'outline' })} cursor-pointer disabled:opacity-50`}
    >
      {publicado ? 'Público' : 'Privado'}
    </button>
  )
}
