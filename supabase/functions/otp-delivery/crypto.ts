// Small Web Crypto helpers used by the otp-delivery function.
// Runs unchanged on Supabase Edge (Deno) and on Node 22 (for tests).

const enc = new TextEncoder();
const dec = new TextDecoder();

export function bytesToBase64(bytes: Uint8Array<ArrayBuffer>): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function bytesToHex(bytes: Uint8Array<ArrayBuffer>): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Constant-time comparison of two strings (length is not secret here).
export function timingSafeEqual(a: string, b: string): boolean {
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  let diff = ab.length ^ bb.length;
  const n = Math.max(ab.length, bb.length);
  for (let i = 0; i < n; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

async function hmacKey(raw: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

export async function hmacSha256(key: Uint8Array<ArrayBuffer>, message: string): Promise<Uint8Array<ArrayBuffer>> {
  const k = await hmacKey(key);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(message)));
}

// OTP_CODE_KEY is a base64 string of 32 random bytes. Two independent keys
// are derived from it: one for hashing codes, one for encrypting them.
async function deriveKeys(masterB64: string): Promise<{ hashKey: Uint8Array<ArrayBuffer>; aesKey: CryptoKey }> {
  const master = base64ToBytes(masterB64);
  if (master.length < 32) throw new Error("OTP_CODE_KEY must be at least 32 bytes (base64)");
  const hashKey = await hmacSha256(master, "kunthai-otp:hash:v1");
  const aesRaw = await hmacSha256(master, "kunthai-otp:enc:v1");
  const aesKey = await crypto.subtle.importKey("raw", aesRaw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  return { hashKey, aesKey };
}

// Keyed hash of a code, bound to the phone and the delivery row so a hash can
// never be reused for another number or another code.
export async function hashCode(masterB64: string, deliveryId: string, phone: string, code: string): Promise<string> {
  const { hashKey } = await deriveKeys(masterB64);
  return bytesToHex(await hmacSha256(hashKey, `${deliveryId}:${phone}:${code}`));
}

// Uniformly random numeric code (rejection sampling, no modulo bias).
export function generateNumericCode(digits = 6): string {
  let out = "";
  while (out.length < digits) {
    const buf = crypto.getRandomValues(new Uint8Array(16));
    for (const b of buf) {
      if (b < 250 && out.length < digits) out += String(b % 10);
    }
  }
  return out;
}

// AES-GCM with the context string (delivery id + purpose) as associated data,
// so a ciphertext can't be moved to another row or used for another purpose.
export async function encryptCode(masterB64: string, deliveryId: string, code: string): Promise<string> {
  const { aesKey } = await deriveKeys(masterB64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(deliveryId) }, aesKey, enc.encode(code)),
  );
  return `v1.${bytesToBase64(iv)}.${bytesToBase64(ct)}`;
}

export async function decryptCode(masterB64: string, deliveryId: string, payload: string): Promise<string> {
  const [v, ivB64, ctB64] = payload.split(".");
  if (v !== "v1" || !ivB64 || !ctB64) throw new Error("bad ciphertext");
  const { aesKey } = await deriveKeys(masterB64);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(ivB64), additionalData: enc.encode(deliveryId) },
    aesKey,
    base64ToBytes(ctB64),
  );
  return dec.decode(pt);
}

// Supabase Auth hooks are signed with Standard Webhooks.
// secret looks like "v1,whsec_<base64>".
export async function verifyStandardWebhook(
  secret: string,
  headers: Headers,
  body: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  toleranceSeconds = 300,
): Promise<boolean> {
  const id = headers.get("webhook-id");
  const ts = headers.get("webhook-timestamp");
  const sigHeader = headers.get("webhook-signature");
  if (!id || !ts || !sigHeader || !secret) return false;
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum) || Math.abs(nowSeconds - tsNum) > toleranceSeconds) return false;
  const keyB64 = secret.replace(/^v1,/, "").replace(/^whsec_/, "");
  const expected = bytesToBase64(await hmacSha256(base64ToBytes(keyB64), `${id}.${ts}.${body}`));
  return sigHeader
    .split(" ")
    .map((part) => part.split(",")[1] ?? "")
    .some((sig) => sig && timingSafeEqual(sig, expected));
}

// Meta signs webhook POSTs with the App Secret: X-Hub-Signature-256: sha256=<hex>
export async function verifyMetaSignature(appSecret: string, header: string | null, rawBody: string): Promise<boolean> {
  if (!appSecret || !header || !header.startsWith("sha256=")) return false;
  const expected = bytesToHex(await hmacSha256(enc.encode(appSecret), rawBody));
  return timingSafeEqual(header.slice("sha256=".length).toLowerCase(), expected);
}
