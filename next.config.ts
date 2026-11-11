import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["10.20.0.2"],
  experimental: {
    // Enables `forbidden()` from next/navigation so RBAC guards render
    // app/forbidden.tsx with a real HTTP 403 (RBAC, Phase 4).
    authInterrupts: true,
    serverActions: {
      // Announcement attachments (3 × 10 MB) and profile photos are posted
      // through server actions; the default 1 MB cap rejected them. Each
      // action still enforces its own per-file size/type limits.
      bodySizeLimit: "32mb",
    },
  },
};

export default nextConfig;
