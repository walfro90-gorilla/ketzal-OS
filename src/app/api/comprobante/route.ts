import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

// b088 · Comprobante de transferencia SPEI, servido firmado.
//
// Antes vivía en el bucket público: la foto de la transferencia de un cliente
// —su nombre, su banco, el monto— se descargaba sin sesión, y el bucket entero
// se podía listar con la publishable key. Ahora vive en `ketzal-privado`, que no
// tiene policy de SELECT: sólo se llega por aquí.
//
// El guard no se reinventa, se hereda: se lee `payment_intents` con el cliente
// del USUARIO, así que decide `payment_intents_sel` (superadmin, quien lo creó,
// o la agencia dueña). Si la RLS no te lo muestra, esto responde 404 igual que
// si no existiera — sin confirmar ni negar que el intent exista.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const BUCKET = 'ketzal-privado'

// `receipt_url` guarda hoy el path (`spei/{booking}/archivo.jpg`), pero los
// registros de antes de b088 traen la URL pública entera del bucket viejo. Los
// bytes son los mismos objetos, movidos: de ambas formas sale el mismo path.
function aPath(receipt: string): string | null {
  const crudo = receipt.startsWith('http')
    ? (receipt.split(/\/ketzal-(?:assets|privado)\//)[1] ?? '')
    : receipt
  const path = decodeURIComponent(crudo.split('?')[0])
  return /^spei\/[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,120}$/i.test(path) ? path : null
}

export async function GET(req: NextRequest) {
  const noHay = NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const intent = req.nextUrl.searchParams.get('intent')
  if (!intent || !UUID.test(intent)) return noHay

  const supabase = await createClient()
  // `payment_intents` no vive en database.types.ts (tiene un solo dueño): el cast
  // es la convención del repo, no un atajo. La RLS sigue siendo la del usuario.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('payment_intents')
    .select('receipt_url')
    .eq('id', intent)
    .maybeSingle()
  if (!data?.receipt_url) return noHay

  const path = aPath(data.receipt_url)
  if (!path) return noHay

  const { data: firma } = await createServiceClient()
    .storage.from(BUCKET)
    .createSignedUrl(path, 60)
  if (!firma?.signedUrl) return noHay

  return NextResponse.redirect(firma.signedUrl, 302)
}
