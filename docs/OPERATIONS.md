# NETAj ERP production operations

## Backup and recovery

- Keep encrypted daily backups for 35 days and weekly backups for 12 months in storage separate from the application host.
- Create a consistent SQLite copy with `node --import tsx scripts/backup-database.mjs <destination.db>` or use the permission-controlled admin download endpoint.
- Verify every backup with `node scripts/verify-restore.mjs <backup.db>`. Verification always works on a temporary copy and checks SQLite integrity, foreign keys, and applied migration history.
- Restore only during a declared maintenance window: stop application writers, retain the current database as a rollback copy, verify the candidate, replace the database atomically, run `prisma migrate status`, then execute production smoke tests.
- Never restore over the live database while the application is writing.

## PostgreSQL migration readiness

SQLite remains the preserved NETAj production data source. Never convert it in place.

1. Generate and inspect a source manifest with `npm run postgres:manifest`.
2. Provision a completely empty PostgreSQL rehearsal database and set `POSTGRES_DATABASE_URL`.
3. Set `ALLOW_POSTGRES_MIGRATION=1` only after confirming that the target is disposable and empty, then run `npm run postgres:migrate`.
4. The command refuses a non-empty target, generates the PostgreSQL schema from the current canonical Prisma schema, copies rows while resolving FK dependencies, resets sequences, checks all row counts and tenant/company keys, and reports accounting/inventory control totals.
5. Run the complete tests, production build, smoke and reconciliation against the rehearsal database before scheduling a cutover. Preserve the SQLite backup and a rollback window.

The executable migration code is complete. Running it against managed PostgreSQL remains external activation pending until an approved provider URL is supplied.

## Background work

Run the durable, tenant-aware worker independently from the web process:

- `npm run worker` runs continuously; `npm run worker:once` drains one available batch for health checks and scheduled jobs.
- Deploy at least one worker with the same database and `INTEGRATION_ENCRYPTION_KEY` as the web service. Scale cautiously while SQLite is active; PostgreSQL supports multiple workers more safely.
- Large imports and webhook deliveries are queued, idempotent, retry with backoff, recover expired leases, and execute inside their recorded tenant/company scope.
- Monitor `/settings/jobs`; failed jobs retain their error and retry history rather than disappearing.

## Private object storage

- Local storage is the safe default and uses `ATTACHMENT_STORAGE_DIR` (default `storage/attachments`). Existing attachment paths remain readable.
- For S3-compatible production storage set `ATTACHMENT_STORAGE_PROVIDER=s3`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY`.
- Production S3 endpoints must use HTTPS. Objects are private and are read only through authenticated, tenant-scoped application routes.
- Validate uploads/downloads/deletes against a non-production bucket before cutover. Provider credentials and bucket lifecycle policies are external activation items.

## External party portal

- Create or refresh a portal identity in `/portal-admin`; the one-time activation token is returned only during that operation and expires after 48 hours.
- The party activates and signs in at `/portal`. Portal sessions are independent, opaque, HTTP-only, expiring sessions and cannot reuse internal ERP authorization.
- Every workspace query is bound to the identity's tenant, company and party; direct IDs cannot widen access.

## Required production secrets

- Set `AUTH_BOOTSTRAP_TOKEN`, `MFA_ENCRYPTION_KEY`, `INTEGRATION_ENCRYPTION_KEY`, and provider credentials through the deployment secret manager, never in source control.
- Keep `NETAJ_LEGACY_CONTEXT` disabled in production. It exists only for controlled compatibility/test execution.
- Run `npm run test:production` and `npm run test:e2e` after each production build and before traffic is switched.
