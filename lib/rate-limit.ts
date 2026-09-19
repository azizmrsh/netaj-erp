type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export class RateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number) { super("محاولات كثيرة، حاول مرة أخرى لاحقًا"); }
}

export function assertRateLimit(key: string, limit = 10, windowMs = 15 * 60_000) {
  const now = Date.now();
  if (buckets.size > 10_000) for (const [bucketKey, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(bucketKey);
  const existing = buckets.get(key);
  const bucket = !existing || existing.resetAt <= now ? { count: 0, resetAt: now + windowMs } : existing;
  bucket.count += 1; buckets.set(key, bucket);
  if (bucket.count > limit) throw new RateLimitError(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)));
}

export function clearRateLimit(key: string) { buckets.delete(key); }
