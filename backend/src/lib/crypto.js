import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { env } from '../env.js';

// AES-256-GCM encryption for Google refresh tokens at rest.
// Stored format: <ivHex>:<tagHex>:<cipherHex>
const KEY = scryptSync(env.TOKEN_ENC_KEY, 'flowtube-token-salt', 32);

export function encrypt(plain) {
  if (plain == null) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

export function decrypt(stored) {
  if (!stored || !stored.includes(':')) return stored ?? null;
  const [ivHex, tagHex, dataHex] = stored.split(':');
  try {
    const decipher = createDecipheriv('aes-256-gcm', KEY, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataHex, 'hex')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null; // tampered or wrong key
  }
}
