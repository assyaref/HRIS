import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Enables `forbidden()` from next/navigation so RBAC guards render
    // app/forbidden.tsx with a real HTTP 403 (RBAC, Phase 4).
    authInterrupts: true,
  },
};

export default nextConfig;
