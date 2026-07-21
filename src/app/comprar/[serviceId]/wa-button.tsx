import { buttonVariants } from '@/components/ui/button'

/** Handoff a WhatsApp para coordinar con la agencia; sin número, cae a un aviso. */
export function WaButton({ phone, text }: { phone: string | null; text: string }) {
  const digits = phone?.replace(/\D/g, '')
  if (!digits)
    return (
      <p className="text-sm text-muted-foreground">
        La agencia no tiene WhatsApp configurado; te contactará por correo.
      </p>
    )
  return (
    <a
      href={`https://wa.me/${digits}?text=${encodeURIComponent(text)}`}
      target="_blank"
      rel="noopener noreferrer"
      className={`${buttonVariants({ variant: 'outline', size: 'touch' })} w-full`}
    >
      Coordinar por WhatsApp
    </a>
  )
}
