import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import Database from "better-sqlite3";
const source = resolve(process.argv[2] ?? "prisma/netaj.db"), directory = mkdtempSync(join(tmpdir(), "netaj-restore-verification-")), restored = join(directory, basename(source));
try { copyFileSync(source, restored); const db = new Database(restored); const integrity = db.pragma("integrity_check", { simple: true }), foreignKeys = db.pragma("foreign_key_check"), migrations = db.prepare('SELECT COUNT(*) AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL').get(); db.close(); if (integrity !== "ok" || foreignKeys.length || !migrations.count) throw new Error("Restore verification failed"); console.log(JSON.stringify({ restoredCopy: restored, integrity, foreignKeyErrors: foreignKeys.length, migrations: migrations.count })); }
finally { rmSync(directory, { recursive: true, force: true }); }
