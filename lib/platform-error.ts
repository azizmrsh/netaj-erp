export class PlatformError extends Error {
  constructor(message: string, public readonly code: string, public readonly status = 400) { super(message); }
}
