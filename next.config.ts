import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // El lector de volantes sube PDF/imágenes por server action; el default
    // de 1 MB no alcanza. El action topa el archivo en 6 MB, esto deja aire
    // para el overhead de multipart.
    serverActions: { bodySizeLimit: "8mb" },
  },
};

export default nextConfig;
