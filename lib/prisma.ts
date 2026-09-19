import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { getVerifiedDataScope, scopedModels, scopePrismaArgs } from "@/lib/data-scope";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./prisma/netaj.db",
});

function createPrismaClient() {
  return new PrismaClient({ adapter }).$extends({
    name: "tenant-company-isolation",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!scopedModels.has(model)) return query(args);
          const scope = await getVerifiedDataScope();
          return query(scopePrismaArgs(operation, args, scope));
        },
      },
    },
  });
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? (createPrismaClient() as unknown as PrismaClient);

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
