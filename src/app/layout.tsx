import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
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
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
