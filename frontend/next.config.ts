import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Cloudflare tünelinden erişim için dev kaynakları aç (aksi halde HMR/dev chunk'ları engellenir)
  allowedDevOrigins: [
    "commander-leads-uncle-spectrum.trycloudflare.com",
    "aerospace-ecommerce-playlist-cause.trycloudflare.com",
  ],
};

export default nextConfig;
