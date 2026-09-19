import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prisma's better-sqlite3 adapter contains a native Node.js binding. Keeping
  // both packages external prevents Next.js from relocating the binding into a
  // server chunk where Node can no longer resolve the native .node file.
  serverExternalPackages: [
    "@prisma/adapter-better-sqlite3",
    "better-sqlite3",
  ],
};

export default nextConfig;
