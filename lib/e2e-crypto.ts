/**
 * E2E Crypto for wtt-web — browser-side AES-256-CTR with PBKDF2 key derivation.
 *
 * Uses Web Crypto API exclusively (browser environment).
 * Compatible with @wtt/plugin's e2e-crypto.ts — same algorithm, salt, iterations.
 */

const PBKDF2_ITERATIONS = 310_000;
const KEY_LENGTH = 32; // 256 bits
const NONCE_LENGTH = 16; // AES-CTR counter block
const SALT_PREFIX = "wtt-e2e:";
const STORAGE_KEY = "wtt-e2e-key"; // localStorage key for cached derived key

function utf8Encode(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

function utf8Decode(buf: Uint8Array): string {
  return new TextDecoder().decode(buf);
}

/**
 * Derive a 256-bit key from password + agentId using PBKDF2-SHA256.
 * This is slow (~310K iterations) — cache the result.
 */
export async function deriveKey(password: string, agentId: string): Promise<Uint8Array> {
  const enc = utf8Encode(password);
  const salt = utf8Encode(SALT_PREFIX + agentId);
  const baseKey = await crypto.subtle.importKey("raw", enc as BufferSource, "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    baseKey,
    KEY_LENGTH * 8,
  );
  return new Uint8Array(bits);
}

async function hkdfNonce(key: Uint8Array, contextId: string): Promise<Uint8Array> {
  const hmacKey = await crypto.subtle.importKey(
    "raw",
    key as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const info = utf8Encode("nonce-" + contextId);
  const input = new Uint8Array(info.length + 1);
  input.set(info);
  input[info.length] = 0x01;
  const full = await crypto.subtle.sign("HMAC", hmacKey, input as BufferSource);
  return new Uint8Array(full).slice(0, NONCE_LENGTH);
}

/**
 * Encrypt plaintext. contextId MUST be globally unique (use messageId).
 */
export async function encryptText(key: Uint8Array, plaintext: string, contextId: string): Promise<string> {
  const data = utf8Encode(plaintext);
  const counter = await hkdfNonce(key, contextId);
  const aesKey = await crypto.subtle.importKey("raw", key as BufferSource, { name: "AES-CTR" }, false, [
    "encrypt",
  ]);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-CTR", counter: counter as BufferSource, length: 128 },
    aesKey,
    data as BufferSource,
  );
  return toBase64(new Uint8Array(ciphertext));
}

/**
 * Decrypt ciphertext (base64) back to plaintext string.
 */
export async function decryptText(key: Uint8Array, ciphertextB64: string, contextId: string): Promise<string> {
  const ciphertext = fromBase64(ciphertextB64);
  const counter = await hkdfNonce(key, contextId);
  const aesKey = await crypto.subtle.importKey("raw", key as BufferSource, { name: "AES-CTR" }, false, [
    "decrypt",
  ]);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-CTR", counter: counter as BufferSource, length: 128 },
    aesKey,
    ciphertext as BufferSource,
  );
  return utf8Decode(new Uint8Array(plaintext));
}

// ---------------------------------------------------------------------------
// Key caching in localStorage
// ---------------------------------------------------------------------------

/**
 * Derive and cache key in localStorage (hex-encoded).
 * Returns the key for immediate use.
 */
export async function deriveAndCacheKey(password: string, agentId: string): Promise<Uint8Array> {
  const key = await deriveKey(password, agentId);
  const hex = Array.from(key)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  localStorage.setItem(STORAGE_KEY, hex);
  return key;
}

/**
 * Load cached key from localStorage. Returns null if not set.
 */
export function getCachedKey(): Uint8Array | null {
  const hex = localStorage.getItem(STORAGE_KEY);
  if (!hex || hex.length !== 64) return null;
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Clear cached key from localStorage. */
export function clearCachedKey(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/** Check if E2E encryption is configured. */
export function isE2EConfigured(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== null;
}

// ---------------------------------------------------------------------------
// Utility: base64 encode/decode
// ---------------------------------------------------------------------------

export function toBase64(data: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
}

export function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// High-level helpers for message send/receive
// ---------------------------------------------------------------------------

/**
 * Encrypt a message for sending. Returns { content, encrypted }.
 * If no E2E key is cached, returns plaintext with encrypted=false.
 */
export async function encryptForSend(
  plaintext: string,
  messageId: string,
): Promise<{ content: string; encrypted: boolean }> {
  const key = getCachedKey();
  if (!key) return { content: plaintext, encrypted: false };

  const ciphertext = await encryptText(key, plaintext, messageId);
  const envelope = JSON.stringify({ c: ciphertext, ctx: messageId });
  return { content: envelope, encrypted: true };
}

/**
 * Decrypt a received message. If not encrypted or no key, returns content as-is.
 */
export async function decryptReceived(
  content: string,
  encrypted?: boolean,
): Promise<{ text: string; wasEncrypted: boolean; decryptFailed: boolean }> {
  if (!encrypted) return { text: content, wasEncrypted: false, decryptFailed: false };

  const key = getCachedKey();
  if (!key) return { text: "[🔒 Encrypted — set E2E password to decrypt]", wasEncrypted: true, decryptFailed: true };

  try {
    const { c, ctx } = JSON.parse(content) as { c: string; ctx: string };
    if (!c || !ctx) return { text: content, wasEncrypted: true, decryptFailed: true };
    const plaintext = await decryptText(key, c, ctx);
    return { text: plaintext, wasEncrypted: true, decryptFailed: false };
  } catch {
    return { text: "[🔒 Decryption failed — wrong password?]", wasEncrypted: true, decryptFailed: true };
  }
}
