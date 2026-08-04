import { PageHeader } from '@/components/data/page-header'
import { Scanner } from './scanner'

// b043: escáner receptor de abordaje. El staff escanea el QR del voucher
// (b042) y aterriza en el panel de check-in (/abordaje/[voucherId]).
export default function AbordajePage() {
  return (
    <div className="mx-auto w-full max-w-lg space-y-6">
      <PageHeader
        title="Abordaje"
        description="Escanea el QR del voucher del cliente para verificarlo y registrar quién sube, con su asiento."
      />
      <Scanner />
    </div>
  )
}
