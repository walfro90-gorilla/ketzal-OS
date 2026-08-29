import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/data/page-header'
import { EncuestaForm } from '../../encuesta-form'
import type { Poll } from '../../tipos'

export default async function EditarEncuestaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from('polls' as never)
    .select('id, supplier_id, question, options, month_from, month_to, status, closes_at, created_at')
    .eq('id', id)
    .maybeSingle()

  if (!data) notFound()
  const poll = data as unknown as Poll

  return (
    <div className="space-y-6">
      <PageHeader
        title="Editar encuesta"
        description={
          poll.status === 'draft'
            ? 'Sigue en borrador: todavía puedes cambiar destinos y meses.'
            : 'Ya está publicada: solo la pregunta y la fecha de cierre son editables.'
        }
        backHref={`/investigacion/${poll.id}`}
        backLabel="Encuesta"
      />
      <EncuestaForm poll={poll} />
    </div>
  )
}
