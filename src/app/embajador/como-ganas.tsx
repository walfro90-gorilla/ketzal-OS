import { CoinsIcon, ShareIcon, WalletIcon } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { explicarTarifa, type TarifaEmbajador } from '@/lib/domain/embajador'

// Lo primero que ve el embajador. Antes el portal abría con su link y tres
// números en cero: nunca decía cuánto gana ni cuándo le pagan, que es lo único
// que quiere saber alguien a quien acaban de reclutar.
//
// m008: no hay UNA tarifa. Cada agencia fija la suya y él cobra la de la
// agencia dueña del viaje que traiga — así que se listan todas. Si tiene trato
// especial (override por persona), ese gana en todas y se muestra solo.

export function ComoGanas({
  override,
  porAgencia,
}: {
  /** Trato especial para este embajador; gana sobre las tarifas de agencia. */
  override: TarifaEmbajador | null
  /** Lo que paga cada agencia a cualquier embajador. */
  porAgencia: { agencia: string; tarifa: TarifaEmbajador }[]
}) {
  const frasePropia = explicarTarifa(override)
  const listadas = porAgencia
    .map((a) => ({ agencia: a.agencia, frase: explicarTarifa(a.tarifa) }))
    .filter((a) => a.frase)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Cómo ganas</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ol className="space-y-3 text-sm">
          <li className="flex gap-3">
            <ShareIcon className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>
              <strong>Comparte tu link.</strong> Por WhatsApp, en tus historias, donde
              esté tu gente. Quien compre entrando por ahí cuenta como tuyo — sea el
              viaje de la agencia que sea.
            </span>
          </li>
          <li className="flex gap-3">
            <CoinsIcon className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>
              <strong>Ganas cuando la venta se cierra.</strong>{' '}
              {frasePropia ? (
                <>
                  {frasePropia}{' '}
                  <span className="text-muted-foreground">
                    Es tu trato especial: aplica en cualquier agencia.
                  </span>
                </>
              ) : listadas.length ? (
                <>
                  Depende de quién sea el viaje — cada agencia pone su tarifa:
                  <ul className="mt-2 space-y-1">
                    {listadas.map((a) => (
                      <li key={a.agencia}>
                        <strong>{a.agencia}:</strong> {a.frase}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <span className="text-muted-foreground">
                  Todavía no hay ninguna tarifa configurada — avísale a Ketzal antes de
                  empezar a compartir, porque hoy una venta tuya no generaría comisión.
                </span>
              )}
            </span>
          </li>
          <li className="flex gap-3">
            <WalletIcon className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>
              <strong>Te paga la agencia del viaje.</strong> Lo que ves abajo como “por
              cobrar” es lo que ya ganaste y todavía no se deposita. Cada agencia te
              dice cuándo corta.
            </span>
          </li>
        </ol>
      </CardContent>
    </Card>
  )
}
