'use client'

import Script from 'next/script'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { captureFirstTouch } from '@/lib/marketing/attribution'
import { esRutaMedible } from '@/lib/marketing/rutas-medibles'

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void
    gtag?: (...args: unknown[]) => void
  }
}

/** Pixel de Meta (solo PageView) + gtag de GA4 + captura first-touch.
 *  Montado en el root layout; env-gated: sin NEXT_PUBLIC_META_PIXEL_ID /
 *  NEXT_PUBLIC_GA_ID no renderiza nada. Las conversiones (Purchase,
 *  InitiateCheckout) NO salen de aquí — viven server-side (ADR-0025); el
 *  trabajo del pixel es remarketing por URL y plantar _fbp/_fbc.
 *  OJO: el pixel no aparece en `curl` del HTML (next/script inyecta tras
 *  hidratar); se verifica en la pestaña Network (fbevents.js + /tr/). */
export function Trackers() {
  const pathname = usePathname()
  const first = useRef(true)
  const medible = esRutaMedible(pathname)
  // Sticky: si el usuario aterrizó en el back-office, los scripts nunca cargan;
  // si en algún momento pisó el marketplace, quedan cargados y el envío de
  // PageView se gatea por ruta.
  const [cargar, setCargar] = useState(false)
  useEffect(() => {
    if (medible) setCargar(true)
  }, [medible])

  useEffect(() => {
    captureFirstTouch()
  }, [])

  // El snippet ya manda el PageView de la carga inicial; esto cubre las
  // navegaciones de cliente del App Router (GA4 las cubre solo con
  // "enhanced measurement" — historial — por eso aquí solo va fbq).
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    if (!medible) return
    window.fbq?.('track', 'PageView')
  }, [pathname, medible])

  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID
  const gaId = process.env.NEXT_PUBLIC_GA_ID
  if (!cargar) return null

  return (
    <>
      {pixelId && (
        <Script
          id="meta-pixel"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixelId}');fbq('track','PageView');`,
          }}
        />
      )}
      {gaId && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
            strategy="afterInteractive"
          />
          <Script
            id="ga4-init"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=gtag;gtag('js',new Date());gtag('config','${gaId}');`,
            }}
          />
        </>
      )}
    </>
  )
}
