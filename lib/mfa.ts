import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Prisma } from "@prisma/client";

export class MfaError extends Error {
  constructor(message: string, public readonly code = "MFA_INVALID", public readonly status = 400) { super(message); }
}

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32Encode(buffer: Buffer) {
  let bits = "";
  for (const byte of buffer) bits += byte.toString(2).padStart(8, "0");
  let output = "";
  for (let index = 0; index < bits.length; index += 5) output += alphabet[Number.parseInt(bits.slice(index, index + 5).padEnd(5, "0"), 2)];
  return output;
}
function base32Decode(value: string) {
  let bits = "";
  for (const character of value.replace(/=+$/g, "").toUpperCase()) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new MfaError("سر MFA غير صالح");
    bits += index.toString(2).padStart(5, "0");
  }
  return Buffer.from(Array.from({ length: Math.floor(bits.length / 8) }, (_, index) => Number.parseInt(bits.slice(index * 8, index * 8 + 8), 2)));
}
function key() {
  const configured = process.env.MFA_ENCRYPTION_KEY;
  if (!configured) throw new MfaError("يجب ضبط MFA_ENCRYPTION_KEY قبل تفعيل المصادقة المتعددة", "MFA_KEY_REQUIRED", 409);
  return createHash("sha256").update(configured).digest();
}
function encrypt(value: string) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("base64")}.${cipher.getAuthTag().toString("base64")}.${encrypted.toString("base64")}`;
}
function decrypt(value: string) {
  const [iv, tag, payload] = value.split(".").map((part) => Buffer.from(part, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv); decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(payload), decipher.final()]).toString("utf8");
}
function codeAt(secret: string, counter: number) {
  const buffer = Buffer.alloc(8); buffer.writeBigUInt64BE(BigInt(counter));
  const hash = createHmac("sha1", base32Decode(secret)).update(buffer).digest();
  const offset = hash[hash.length - 1] & 15;
  return String((((hash[offset] & 127) << 24) | (hash[offset + 1] << 16) | (hash[offset + 2] << 8) | hash[offset + 3]) % 1_000_000).padStart(6, "0");
}
function safeEqual(left: string, right: string) {
  const a = Buffer.from(left), b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function currentTotp(secret: string, timestamp = Date.now()) { return codeAt(secret, Math.floor(timestamp / 30_000)); }
function verifyTotp(secret: string, code: string) {
  const counter = Math.floor(Date.now() / 30_000);
  return [-1, 0, 1].some((offset) => safeEqual(codeAt(secret, counter + offset), code));
}
const recoveryHash = (code: string) => createHash("sha256").update(code.toUpperCase()).digest("hex");

export async function beginMfaEnrollment(tx: Prisma.TransactionClient, userId: number, email: string) {
  const existing = await tx.userMfaFactor.findFirst({ where: { userId, factorType: "TOTP", verifiedAt: null } });
  const secret = base32Encode(randomBytes(20));
  const factor = existing
    ? await tx.userMfaFactor.update({ where: { id: existing.id }, data: { encryptedSecret: encrypt(secret), label: "Authenticator" } })
    : await tx.userMfaFactor.create({ data: { userId, encryptedSecret: encrypt(secret), label: "Authenticator" } });
  return { factorId: factor.id, secret, otpauthUri: `otpauth://totp/NETAJ%20ERP:${encodeURIComponent(email)}?secret=${secret}&issuer=NETAJ%20ERP&digits=6&period=30` };
}

export async function confirmMfaEnrollment(tx: Prisma.TransactionClient, userId: number, factorId: number, code: string) {
  const factor = await tx.userMfaFactor.findFirst({ where: { id: factorId, userId, verifiedAt: null } });
  if (!factor || !verifyTotp(decrypt(factor.encryptedSecret), code)) throw new MfaError("رمز المصادقة غير صحيح");
  const recoveryCodes = Array.from({ length: 8 }, () => randomBytes(5).toString("hex").toUpperCase());
  await tx.mfaRecoveryCode.createMany({ data: recoveryCodes.map((recoveryCode) => ({ factorId: factor.id, codeHash: recoveryHash(recoveryCode) })) });
  await tx.userMfaFactor.update({ where: { id: factor.id }, data: { verifiedAt: new Date() } });
  await tx.platformUser.update({ where: { id: userId }, data: { mfaEnabled: true } });
  return { enabled: true, recoveryCodes };
}

export async function verifyUserMfa(tx: Prisma.TransactionClient, userId: number, input: unknown) {
  const code = String(input ?? "").replace(/[\s-]/g, "").toUpperCase();
  if (!code) throw new MfaError("رمز المصادقة المتعددة مطلوب", "MFA_REQUIRED", 401);
  const factor = await tx.userMfaFactor.findFirst({ where: { userId, factorType: "TOTP", verifiedAt: { not: null } } });
  if (!factor) throw new MfaError("إعداد المصادقة المتعددة غير مكتمل", "MFA_NOT_CONFIGURED", 403);
  if (/^\d{6}$/.test(code) && verifyTotp(decrypt(factor.encryptedSecret), code)) {
    await tx.userMfaFactor.update({ where: { id: factor.id }, data: { lastUsedAt: new Date() } });
    return true;
  }
  const recovery = await tx.mfaRecoveryCode.findFirst({ where: { factorId: factor.id, codeHash: recoveryHash(code), usedAt: null } });
  if (!recovery) throw new MfaError("رمز المصادقة غير صحيح", "MFA_INVALID", 401);
  await tx.mfaRecoveryCode.update({ where: { id: recovery.id }, data: { usedAt: new Date() } });
  return true;
}

export async function disableMfa(tx: Prisma.TransactionClient, userId: number, code: unknown) {
  await verifyUserMfa(tx, userId, code);
  await tx.userMfaFactor.deleteMany({ where: { userId } });
  await tx.platformUser.update({ where: { id: userId }, data: { mfaEnabled: false } });
  return { enabled: false };
}
