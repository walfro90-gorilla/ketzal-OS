import { PageHeader } from '@/components/data/page-header'
import { EncuestaForm } from '../encuesta-form'

export default function NuevaEncuestaPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Nueva encuesta"
        description="Nace en borrador: la abres cuando el anuncio esté listo."
        backHref="/investigacion"
        backLabel="Investigación"
      />
      <EncuestaForm />
    </div>
  )
}
