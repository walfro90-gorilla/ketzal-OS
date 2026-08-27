import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // El lector de volantes sube PDF/imágenes por server action; el default
    // de 1 MB no alcanza. 4.5 MB es el techo DURO de Vercel para el body de una
    // función (413 FUNCTION_PAYLOAD_TOO_LARGE, no se sube por config), así que
    // subir de aquí solo promete lo que la plataforma va a rechazar. El archivo
    // se topa en 4 MB (`MAX_BYTES`) y esto deja el aire del multipart.
    serverActions: { bodySizeLimit: "4.5mb" },
  },
  images: {
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
      // Proyecto viejo (Gorilla-Labs): se conserva durante la ventana de corte
      // para que el deploy no dependa del orden env-vars↔código. Quitar cuando
      // el proyecto viejo se apague (cutover paso 10).
      {
        protocol: "https",
        hostname: "wnujoyzdpdyxblgdtxjw.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
