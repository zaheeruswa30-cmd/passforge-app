/* ------------------------------------------------------------------ *
 * Zero-knowledge crypto primitives (browser side).
 *
 *   authHash = PBKDF2-SHA256(password, "auth|" + email, 210_000, 32B)
 *   vaultKey = PBKDF2-SHA256(password, vaultSalt,       210_000, 32B)
 *
 * authHash is the only derived value that ever leaves the browser.
 * vaultKey never leaves memory; items are AES-256-GCM encrypted with it.
 * ------------------------------------------------------------------ */

export const PBKDF2_ITERATIONS = 210_000;

const enc = new TextEncoder();
const dec = new TextDecoder();

export function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

export function fromBase64(value: string): Uint8Array {
  const bin = atob(value);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function randomBytes(n: number): Uint8Array {
  const buf = new Uint8Array(n);
  crypto.getRandomValues(buf);
  return buf;
}

async function deriveBits(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const material = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    material,
    256
  );
  return new Uint8Array(bits);
}

/** Server-facing authentication hash. Never the password itself. */
export async function deriveAuthHash(password: string, email: string): Promise<string> {
  return toHex(await deriveBits(password, enc.encode(`auth|${email.toLowerCase()}`)));
}

/** AES-GCM vault key. Stays in memory for the life of the tab. */
export async function deriveVaultKey(password: string, vaultSaltB64: string): Promise<CryptoKey> {
  const raw = await deriveBits(password, fromBase64(vaultSaltB64));
  return crypto.subtle.importKey("raw", raw as BufferSource, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

export function newVaultSalt(): string {
  return toBase64(randomBytes(16));
}

export type Cipher = { iv: string; ct: string };

export async function encryptJson(key: CryptoKey, value: unknown): Promise<Cipher> {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    enc.encode(JSON.stringify(value))
  );
  return { iv: toBase64(iv), ct: toBase64(new Uint8Array(ct)) };
}

export async function decryptJson<T>(key: CryptoKey, cipher: Cipher): Promise<T> {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(cipher.iv) as BufferSource },
    key,
    fromBase64(cipher.ct) as BufferSource
  );
  return JSON.parse(dec.decode(plain)) as T;
}

export type VaultSecret = { password: string; notes: string };
