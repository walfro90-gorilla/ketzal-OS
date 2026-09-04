import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      // Las herramientas del asistente son las del MCP (ADR-0043); ver el loader.
      "**/mcp/src/**/*.ts": { loaders: ["./scripts/mcp-import-loader.cjs"] },
    },
  },
  experimental: {
    // El lector de volantes sube PDF/imágenes por server action; el default
    // de 1 MB no alcanza. 4.5 MB es el techo DURO de Vercel para el body de una
    // función (413 FUNCTION_PAYLOAD_TOO_LARGE, no se sube por config), así que
    // subir de aquí solo promete lo que la plataforma va a rechazar. El archivo
    // se topa en 4 MB (`MAX_BYTES`) y esto deja el aire del multipart.
    serverActions: { bodySizeLimit: "4.5mb" },
  },
  images: {
    // AVIF primero (la home lo exige para su imagen LCP, ADR-0046); WebP para
    // quien no lo soporte. Aplica a todo next/image, sin cambio visual.
    formats: ["image/avif", "image/webp"],
    // Next 16 solo sirve las calidades de esta lista; sin el 85 la home pedía
    // quality={85} y el optimizador entregaba 75 en silencio.
    qualities: [75, 85],
    // Se necesita para que el optimizador de Next (/_next/image) acepte los
    // banners/fotos que viven en Storage — sin esto rechaza el host con
    // "hostname not configured". Lo usa opengraph-image.tsx para no servir
    // el archivo tal cual subido (a veces varios MB de una foto de celular).
    remotePatterns: [
      {
        protocol: "https",
        hostname: "uznqmmeqwbbjkotbxwsw.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  // 2026-09-03 · Dominio propio. `ketzal-os.vercel.app` → `ketzal.tours` con
  // 308 para que los links ya repartidos (cotizaciones, vouchers con QR, `?ref`
  // de embajadores, recibos) sigan abriendo — en el dominio nuevo y con su
  // query intacta. `/api` y `/_next` quedan fuera: el webhook y el OAuth de
  // Mercado Pago se registraron con el host viejo y no siguen redirects.
  // `os.ketzal.tours` NO se toca: hoy sirve todo (ruteo por host sin decidir).
  async redirects() {
    return [
      {
        source: "/:path((?!api/|_next/).*)",
        has: [{ type: "host", value: "ketzal-os.vercel.app" }],
        destination: "https://ketzal.tours/:path",
        permanent: true,
      },
    ];
  },
  // No anunciar el framework: no arregla nada por sí solo, pero le ahorra al
  // escaneo automático el trabajo de saber qué CVE probar.
  poweredByHeader: false,
  // b088 · El barrido del 2026-09-02 encontró la app sirviendo dinero y datos
  // de cliente con una sola cabecera de seguridad (HSTS, que la pone Vercel).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // ponytail: `frame-ancestors` en vez de una CSP entera. Una CSP con
          // script-src exige nonces en todo el App Router y rompe en silencio
          // en producción; esto cierra el clickjacking hoy, que es el hueco que
          // el barrido encontró. La CSP completa, con nonce y en Report-Only
          // primero, cuando haya con qué medir el ruido.
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // `camera=(self)`: lo pide el escáner de QR de /abordaje.
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=(), payment=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
