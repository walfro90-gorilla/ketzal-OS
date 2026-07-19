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
};

export default nextConfig;
