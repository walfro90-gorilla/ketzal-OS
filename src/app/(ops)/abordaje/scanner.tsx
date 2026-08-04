'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CameraIcon, QrCodeIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// Escáner de abordaje (b043). Usa BarcodeDetector nativo (Chrome/Android —
// los teléfonos del staff) sobre la cámara trasera; en navegadores sin
// soporte queda la entrada manual (pegar el link del voucher) o escanear con
// la cámara del sistema, que abre el link directamente.

/** Extrae voucherId (+cert) de un link /voucher/... o /abordaje/... o un uuid pelón. */
function parseVoucher(text: string): { id: string; cert: string | null } | null {
  const t = text.trim()
  const m = t.match(
    /(?:voucher|abordaje)\/([0-9a-f-]{36})(?:\?c=([A-Za-z0-9_-]+))?/i
  )
  if (m) return { id: m[1], cert: m[2] ?? null }
  if (/^[0-9a-f-]{36}$/i.test(t)) return { id: t, cert: null }
  return null
}

type Detector = {
  detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]>
}

export function Scanner() {
  const router = useRouter()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [soporta, setSoporta] = useState<boolean | null>(null)
  const [activo, setActivo] = useState(false)
  const [manual, setManual] = useState('')

  useEffect(() => {
    setSoporta('BarcodeDetector' in window)
  }, [])

  function irA(v: { id: string; cert: string | null }) {
    router.push(`/abordaje/${v.id}${v.cert ? `?c=${v.cert}` : ''}`)
  }

  async function iniciar() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      })
      const video = videoRef.current
      if (!video) return
      video.srcObject = stream
      await video.play()
      setActivo(true)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detector: Detector = new (window as any).BarcodeDetector({
        formats: ['qr_code'],
      })
      const tick = async () => {
        if (!videoRef.current || videoRef.current.readyState < 2) {
          requestAnimationFrame(tick)
          return
        }
        try {
          const codes = await detector.detect(videoRef.current)
          const hit = codes.map((c) => parseVoucher(c.rawValue)).find(Boolean)
          if (hit) {
            stream.getTracks().forEach((t) => t.stop())
            irA(hit)
            return
          }
        } catch {
          /* frame no decodificable: seguir */
        }
        setTimeout(tick, 250)
      }
      tick()
    } catch {
      toast.error('No se pudo abrir la cámara. Usa la entrada manual.')
    }
  }

  function onManual(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const v = parseVoucher(manual)
    if (!v) {
      toast.error('Pega el link del voucher (o su código) para continuar.')
      return
    }
    irA(v)
  }

  return (
    <div className="space-y-4">
      {soporta ? (
        <div className="space-y-3">
          <div className="relative overflow-hidden rounded-xl border bg-black">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video ref={videoRef} className="aspect-square w-full object-cover" muted playsInline />
            {!activo && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
                <QrCodeIcon className="size-10 opacity-70" />
                <Button type="button" onClick={iniciar}>
                  <CameraIcon /> Iniciar escáner
                </Button>
              </div>
            )}
          </div>
          {activo && (
            <p className="text-center text-sm text-muted-foreground">
              Apunta al QR del voucher…
            </p>
          )}
        </div>
      ) : soporta === false ? (
        <p className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
          Este navegador no trae escáner integrado. Escanea el QR con la cámara
          del teléfono (abre el voucher directo) o pega el link aquí abajo.
        </p>
      ) : null}

      <form onSubmit={onManual} className="flex gap-2">
        <Input
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder="…o pega el link del voucher"
          aria-label="Link del voucher"
        />
        <Button type="submit" variant="outline">
          Abrir
        </Button>
      </form>
    </div>
  )
}
