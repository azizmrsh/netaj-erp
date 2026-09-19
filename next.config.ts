import type { NextConfig } from "next";

const scriptPolicy = process.env.NODE_ENV === "production"
  ? "script-src 'self' 'unsafe-inline'"
  : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";

const nextConfig: NextConfig = {
  // Prisma's better-sqlite3 adapter contains a native Node.js binding. Keeping
  // both packages external prevents Next.js from relocating the binding into a
  // server chunk where Node can no longer resolve the native .node file.
  serverExternalPackages: [
    "@prisma/adapter-better-sqlite3",
    "better-sqlite3",
  ],
  async headers() {
    return [{ source: "/(.*)", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=(self)" },
      { key: "Content-Security-Policy", value: `default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; ${scriptPolicy}; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'` },
    ] }];
  },
};

export default nextConfig;
