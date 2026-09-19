import { resolve } from "node:path";
import { backupFileName, createVerifiedDatabaseBackup } from "../lib/backup.ts";
const destination = resolve(process.argv[2] ?? `backups/generated/${backupFileName()}`);
const result = await createVerifiedDatabaseBackup(destination);
console.log(JSON.stringify(result));
