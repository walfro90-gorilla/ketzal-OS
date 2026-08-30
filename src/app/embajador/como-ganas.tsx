import { CoinsIcon, ShareIcon, WalletIcon } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { explicarTarifa, type TarifaEmbajador } from '@/lib/domain/embajador'

// Lo primero que ve el embajador. Antes el portal abría con su link y tres
// números en cero: nunca decía cuánto gana ni cuándo le pagan, que es lo único
// que quiere saber alguien a quien acaban de reclutar.

export function ComoGanas({ tarifa }: { tarifa: TarifaEmbajador | null }) {
  const frase = explicarTarifa(tarifa)

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
              esté tu gente. Quien compre entrando por ahí cuenta como tuyo.
            </span>
          </li>
          <li className="flex gap-3">
            <CoinsIcon className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>
              <strong>Ganas cuando la venta se cierra.</strong>{' '}
              {frase ?? (
                <span className="text-muted-foreground">
                  Tu tarifa todavía no está configurada — pídesela a tu agencia antes de
                  empezar a compartir.
                </span>
              )}
            </span>
          </li>
          <li className="flex gap-3">
            <WalletIcon className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>
              <strong>Te pagan lo acumulado.</strong> Lo que ves abajo como “por cobrar”
              es lo que ya ganaste y todavía no se te deposita. Tu agencia te dice cuándo
              corta.
            </span>
          </li>
        </ol>
      </CardContent>
    </Card>
  )
}
