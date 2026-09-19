import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import Database from "better-sqlite3";

export function databasePathFromUrl(databaseUrl = process.env.DATABASE_URL ?? "file:./prisma/netaj.db") {
  if (!databaseUrl.startsWith("file:")) throw new Error("أداة النسخ الحالية مخصصة لقاعدة SQLite؛ استخدم pg_dump عند الانتقال إلى PostgreSQL");
  const raw = databaseUrl.slice(5).split("?")[0];
  return isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
}

export async function createVerifiedDatabaseBackup(destination: string, source = databasePathFromUrl()) {
  const target = resolve(destination);
  if (target === resolve(source)) throw new Error("يجب أن تكون وجهة النسخة مختلفة عن قاعدة البيانات الأصلية");
  await mkdir(dirname(target), { recursive: true });
  const sourceDb = new Database(source, { readonly: true, fileMustExist: true });
  try { await sourceDb.backup(target); } finally { sourceDb.close(); }
  const restored = new Database(target, { readonly: true, fileMustExist: true });
  let integrity: unknown, foreignKeys: unknown[];
  try { integrity = restored.pragma("integrity_check", { simple: true }); foreignKeys = restored.pragma("foreign_key_check"); }
  finally { restored.close(); }
  if (integrity !== "ok" || foreignKeys.length) { await rm(target, { force: true }); throw new Error("فشل التحقق من سلامة النسخة الاحتياطية"); }
  const content = await readFile(target), info = await stat(target);
  return { path: target, sizeBytes: info.size, checksumSha256: createHash("sha256").update(content).digest("hex"), integrity: "ok", foreignKeyErrors: 0 };
}

export function backupFileName(prefix = "netaj") {
  return `${prefix}-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}.db`;
}
