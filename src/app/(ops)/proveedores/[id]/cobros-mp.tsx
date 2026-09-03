import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { DesconectarMp } from './desconectar-mp'

// El callback del OAuth de MP vuelve con `?mp=<resultado>`. Sin esto la
// pantalla se ve idéntica haya funcionado o no: el usuario solo percibe un
// refresh, y un fallo pasa por éxito (ADR-0024).
const MENSAJES_MP: Record<string, { texto: string; ok: boolean }> = {
  conectado: { texto: 'Autorización actualizada con Mercado Pago.', ok: true },
  cancelado: { texto: 'Cancelaste la autorización. No cambió nada.', ok: false },
  error: { texto: 'Mercado Pago rechazó la autorización. No cambió nada; vuelve a intentar.', ok: false },
}

export type AvisoMp = { texto: string; ok: boolean }

export function avisoMp(mp: string | undefined): AvisoMp | undefined {
  return mp ? MENSAJES_MP[mp] : undefined
}

// b053: cuenta de Mercado Pago de la agencia (split al cobrar). Misma tarjeta
// en /ajustes (la agencia se configura a sí misma) y en /proveedores/[id]
// (el superadmin configura cualquier agencia).
export function CobrosMp({
  supplierId,
  conectado,
  mpUserId,
  aviso,
}: {
  supplierId: string
  conectado: boolean
  mpUserId: string | null
  aviso?: AvisoMp
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cobros en línea (Mercado Pago)</CardTitle>
        <CardDescription>
          Con la cuenta MP de la agencia conectada, cada venta en línea se
          divide al momento del cobro: el dinero cae directo a la agencia y
          la comisión de Ketzal se separa sola. Sin cuenta conectada, las
          ventas en línea se depositan a la agencia a los 7 días.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {aviso && (
          <p
            className={`rounded-lg px-3 py-2 text-sm ${
              aviso.ok
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
            }`}
          >
            {aviso.texto}
          </p>
        )}
        {conectado ? (
          <div className="space-y-2">
            <p className="text-sm">
              <span className="font-medium text-emerald-600 dark:text-emerald-500">
                ✓ Cuenta conectada
              </span>{' '}
              <span className="text-muted-foreground">
                (MP user {mpUserId ?? '—'})
              </span>
            </p>
            {/* Reconectar rota los tokens: el callback hace upsert sobre el
                mismo supplier_id, así que los viejos dejan de servir. Es la
                salida si se filtraron o si MP revocó el permiso. */}
            <a
              href={`/api/mp/oauth/start?supplier=${supplierId}`}
              className="inline-flex items-center text-sm font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Reconectar
            </a>
            <p className="text-xs text-muted-foreground">
              Vuelve a autorizar con Mercado Pago y reemplaza los permisos
              actuales. Úsalo si cambiaste de cuenta o si sospechas que el
              acceso quedó expuesto.
            </p>
            {/* b092: quitar la cuenta sin poner otra (se conectó la equivocada,
                la agencia deja de cobrar en línea). Borra la copia de Ketzal;
                revocar en MP sigue siendo del vendedor (ADR-0024). */}
            <DesconectarMp supplierId={supplierId} />
          </div>
        ) : (
          <a
            href={`/api/mp/oauth/start?supplier=${supplierId}`}
            className="inline-flex items-center rounded-lg border border-[#009E7E]/40 bg-[#009E7E]/10 px-3 py-2 text-sm font-semibold text-[#00805F]"
          >
            Conectar mi Mercado Pago →
          </a>
        )}
      </CardContent>
    </Card>
  )
}
