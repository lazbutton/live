import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: false,
  },
  experimental: {
    // Exclude base_components from compilation
  },
  // Autoriser les requêtes cross-origin depuis ngrok et autres tunnels de développement
  allowedDevOrigins: [
    "indemonstrable-noncurrent-adella.ngrok-free.dev",
    // Ajoutez d'autres domaines ngrok ici si nécessaire
    // Pattern pour autoriser tous les sous-domaines ngrok-free.dev
    "*.ngrok-free.dev",
    "*.ngrok.io",
    // Cloudflare Tunnel
    "*.trycloudflare.com",
    // localtunnel
    "*.loca.lt",
  ],
};

export default nextConfig;
