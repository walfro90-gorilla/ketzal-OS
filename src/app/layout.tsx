import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Bricolage_Grotesque } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Toaster } from "@/components/ui/sonner";
import { Analytics } from "@vercel/analytics/next";
import { Trackers } from "@/components/marketing/trackers";
import { SITE_URL } from "@/lib/site-url";
import Script from "next/script";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Display "La Estela": Bricolage Grotesque en titulares y wordmark. Cuerpo sigue
// siendo Geist (rápido/legible en campo). Sólo los pesos de titular para no cargar
// glifos de más. font-display: swap lo trae next/font por defecto.
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  // URL base para resolver imágenes OG a absolutas (WhatsApp/Telegram las
  // exigen). Vive en lib/site-url (la comparten sitemap/robots/llms/CAPI).
  metadataBase: new URL(SITE_URL),
  applicationName: "Ketzal OS",
  title: "Ketzal OS",
  description: "Back-office de ventas para agencias de viajes",
  // El <link rel="manifest"> lo inyecta Next automáticamente por app/manifest.ts.
  appleWebApp: {
    capable: true,
    title: "Ketzal OS",
    statusBarStyle: "default",
  },
};

// Campo-primero: el teléfono es el dispositivo principal.
// `viewportFit: 'cover'` habilita el manejo de safe-area (notch / home indicator)
// que usa el bottom tab bar. No fijamos maximumScale para no bloquear el zoom accesible.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf6" },
    { media: "(prefers-color-scheme: dark)", color: "#081512" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${bricolage.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* PWA: Chrome dispara `beforeinstallprompt` en cuanto la app es
            instalable, a veces antes de que React monte <InstalarApp>. Se
            guarda aquí (sin preventDefault: en las páginas públicas la barra
            de Chrome sigue siendo el único camino de instalación). */}
        <Script id="kz-install-prompt" strategy="beforeInteractive">
          {`window.addEventListener('beforeinstallprompt',function(e){window.__kzInstallPrompt=e})`}
        </Script>
        <Providers>
          {children}
          <Toaster />
        </Providers>
        <Analytics />
        {/* ADR-0025: pixel Meta (solo PageView) + GA4 + first-touch, solo en
            la superficie pública del marketplace y env-gated. */}
        <Trackers />
      </body>
    </html>
  );
}
