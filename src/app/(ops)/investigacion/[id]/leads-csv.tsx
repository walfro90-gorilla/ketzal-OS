'use client'

import { DownloadIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { campoCsv } from '@/lib/domain/encuesta'
import type { PollVote } from '../tipos'

// Export de leads: el cierre del loop v1 es manual — la agencia se lleva los
// contactos y los trabaja por WhatsApp. BOM + CRLF para que Excel no destroce
// los acentos. El escapado usa `campoCsv` y no el `campo()` de /reportes:
// aquí el contenido lo escribe cualquiera con la liga del anuncio, así que
// además de comillas hay que neutralizar fórmulas.

function fila(...valores: Array<string | number | null | undefined>): string {
  return valores.map(campoCsv).join(',')
}

export function LeadsCsv({
  votos,
  etiquetas,
  nombre,
}: {
  votos: PollVote[]
  etiquetas: Record<number, string>
  nombre: string
}) {
  function handleClick() {
    const lineas = [
      fila('Fecha', 'Contacto', 'Destino', 'Mes', 'Sugerencia', 'utm_source', 'utm_campaign', 'fbclid'),
      ...votos.map((v) =>
        fila(
          v.created_at.slice(0, 10),
          v.contact ?? '',
          etiquetas[v.option_id] ?? '',
          v.preferred_month.slice(0, 7),
          v.suggestion ?? '',
          v.meta?.utm_source ?? '',
          v.meta?.utm_campaign ?? '',
          v.meta?.fbclid ?? '',
        ),
      ),
    ]
    // BOM UTF-8 para que Excel abra bien los acentos; CRLF por compatibilidad.
    const csv = '\uFEFF' + lineas.join('\r\n') + '\r\n'
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `leads-${nombre}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <Button type="button" variant="outline" onClick={handleClick} disabled={!votos.length}>
      <DownloadIcon aria-hidden="true" />
      Exportar CSV
    </Button>
  )
}
