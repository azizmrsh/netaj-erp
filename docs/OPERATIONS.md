# NETAj ERP production operations

## Backup and recovery

- Keep encrypted daily backups for 35 days and weekly backups for 12 months in storage separate from the application host.
- Create a consistent SQLite copy with `node --import tsx scripts/backup-database.mjs <destination.db>` or use the permission-controlled admin download endpoint.
- Verify every backup with `node scripts/verify-restore.mjs <backup.db>`. Verification always works on a temporary copy and checks SQLite integrity, foreign keys, and applied migration history.
- Restore only during a declared maintenance window: stop application writers, retain the current database as a rollback copy, verify the candidate, replace the database atomically, run `prisma migrate status`, then execute production smoke tests.
- Never restore over the live database while the application is writing.

## PostgreSQL migration readiness

SQLite remains the preserved NETAj production data source for this run. For larger SaaS deployments, rehearse a separate non-production export/import into PostgreSQL, convert Prisma provider/configuration, validate decimal/date semantics and unique indexes, run the complete test suite, then perform a controlled cutover with a final delta and rollback window. Do not convert the live NETAj database in place.

## Background work

Large imports, exports, webhook deliveries, control scans, and backups expose durable batch/delivery records. Move their runners to a transactional queue before horizontal scaling; API requests should enqueue work and workers must retain tenant/company scope and idempotency keys.
