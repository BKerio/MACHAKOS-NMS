import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV is the recommended size for GCM

/**
 * Derives a fixed 32-byte AES key from an arbitrary-length secret (we reuse
 * JWT_SECRET rather than adding a dedicated env var - it's already a
 * required, high-entropy secret nobody else has). scrypt is overkill for a
 * config-at-rest key (it's meant for password hashing), but it's a cheap,
 * dependency-free way to turn any string into exactly 32 bytes.
 */
function deriveKey(secret: string): Buffer {
  return scryptSync(secret, 'nms-eoc-sms-gateway', 32);
}

/**
 * Encrypts a JSON-serializable value with AES-256-GCM, keyed off `secret`.
 * Output packs iv + authTag + ciphertext into one base64 string so it fits
 * in a single @db.Text column. Used to store SMS gateway credentials
 * (API keys, tokens) at rest - see modules/settings/sms-gateway.service.ts.
 */
export function encryptJson(secret: string, value: unknown): string {
  const key = deriveKey(secret);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

/** Reverses encryptJson. Throws if `secret` doesn't match or the blob was tampered with. */
export function decryptJson<T>(secret: string, packed: string): T {
  const key = deriveKey(secret);
  const buf = Buffer.from(packed, 'base64');

  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + 16);
  const ciphertext = buf.subarray(IV_LENGTH + 16);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  return JSON.parse(plaintext.toString('utf8')) as T;
}
