// Apple In-App Purchase (StoreKit 2) for Visibility Credits.
//
// Apple signs every transaction and every App Store Server Notification as a
// JWS whose x5c header carries the certificate chain leaf -> Apple WWDR
// intermediate -> Apple Root CA - G3. verifyAppleJws() checks that chain
// against the pinned Apple root (below; public certificate, the same one macOS
// ships), Apple's marker extensions on the leaf and intermediate, the validity
// dates and the ES256 signature. No App Store Connect key or other secret is
// needed. Nothing here logs a transaction body or a token.
import { X509Certificate, createPublicKey, verify as verifySignature } from "node:crypto";

export const APPLE_BUNDLE_ID = "app.kunthai.mobile";

// Credits per consumable product. The app shows Apple's price; the server only
// trusts this table for how many credits a product is worth.
export const APPLE_CREDIT_PRODUCTS = Object.freeze({
  "app.kunthai.mobile.credits.75": { credits: 75, usdMinor: 599 },
  "app.kunthai.mobile.credits.150": { credits: 150, usdMinor: 1199 },
  "app.kunthai.mobile.credits.225": { credits: 225, usdMinor: 1799 },
  "app.kunthai.mobile.credits.300": { credits: 300, usdMinor: 2399 },
});

// Apple Root CA - G3 (https://www.apple.com/certificateauthority/), valid to 2039.
// SHA-256 63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79
const APPLE_ROOT_CA_G3_PEM = `-----BEGIN CERTIFICATE-----
MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwS
QXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9u
IEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcN
MTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBS
b290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9y
aXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49
AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtf
TjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517
IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySr
MA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gA
MGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4
at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM
6BgD56KyKA==
-----END CERTIFICATE-----`;

// DER-encoded OIDs Apple places on its signing chain:
// 1.2.840.113635.100.6.11.1 (leaf) and 1.2.840.113635.100.6.2.1 (WWDR intermediate).
const LEAF_MARKER_OID = Buffer.from("060a2a864886f76364060b01", "hex");
const INTERMEDIATE_MARKER_OID = Buffer.from("060a2a864886f76364060201", "hex");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class AppleIapError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function decodeSegment(segment) {
  return JSON.parse(Buffer.from(String(segment), "base64url").toString("utf8"));
}

function within(cert, at) {
  return at >= Date.parse(cert.validFrom) && at <= Date.parse(cert.validTo);
}

// Verifies an Apple-signed JWS and returns its payload. Throws AppleIapError.
// rootPem is only overridden by tests.
export function verifyAppleJws(jws, { rootPem = APPLE_ROOT_CA_G3_PEM, now = Date.now() } = {}) {
  const parts = String(jws || "").split(".");
  if (parts.length !== 3 || parts.some((part) => !part)) {
    throw new AppleIapError("invalid_jws", "This App Store receipt is not valid.");
  }
  let header;
  let payload;
  try {
    header = decodeSegment(parts[0]);
    payload = decodeSegment(parts[1]);
  } catch {
    throw new AppleIapError("invalid_jws", "This App Store receipt is not valid.");
  }
  if (header?.alg !== "ES256" || !Array.isArray(header.x5c) || header.x5c.length !== 3) {
    throw new AppleIapError("invalid_jws", "This App Store receipt is not valid.");
  }

  let leaf;
  let intermediate;
  let root;
  try {
    [leaf, intermediate, root] = header.x5c.map((der) => new X509Certificate(Buffer.from(der, "base64")));
  } catch {
    throw new AppleIapError("invalid_chain", "This App Store receipt is not signed by Apple.");
  }
  const pinnedRoot = new X509Certificate(rootPem);
  // Apple signs with its long-lived certificates; a transaction stays
  // verifiable after the leaf expires, so dates are checked at signing time.
  const signedAt = Number(payload?.signedDate) || now;
  const chainValid = root.raw.equals(pinnedRoot.raw)
    && leaf.checkIssued(intermediate) && leaf.verify(intermediate.publicKey)
    && intermediate.checkIssued(root) && intermediate.verify(root.publicKey)
    && leaf.raw.includes(LEAF_MARKER_OID) && intermediate.raw.includes(INTERMEDIATE_MARKER_OID)
    && within(leaf, signedAt) && within(intermediate, signedAt) && within(root, now);
  if (!chainValid) {
    throw new AppleIapError("invalid_chain", "This App Store receipt is not signed by Apple.");
  }

  const signatureValid = verifySignature(
    "sha256",
    Buffer.from(`${parts[0]}.${parts[1]}`),
    { key: createPublicKey(leaf.publicKey.export({ type: "spki", format: "pem" })), dsaEncoding: "ieee-p1363" },
    Buffer.from(parts[2], "base64url"),
  );
  if (!signatureValid) {
    throw new AppleIapError("invalid_signature", "This App Store receipt is not signed by Apple.");
  }
  return payload;
}

// Amount actually charged, in minor units of `currency`. StoreKit 2 transactions
// (iOS 16+) carry `price` in milli-units; older ones fall back to the USD list price.
export function transactionAmount(transaction, product) {
  const currency = String(transaction?.currency || "").toUpperCase();
  const price = Number(transaction?.price);
  if (/^[A-Z]{3}$/.test(currency) && Number.isFinite(price) && price > 0) {
    const minor = Math.round(price / 10);
    if (minor > 0) return { amountMinor: minor, currency };
  }
  return { amountMinor: product.usdMinor, currency: "USD" };
}

// KunThai's rules for a verified transaction before credits are added.
export function checkCreditTransaction(transaction, { userId }) {
  if (transaction?.bundleId !== APPLE_BUNDLE_ID) {
    throw new AppleIapError("wrong_app", "This purchase was not made in KunThai.");
  }
  const product = APPLE_CREDIT_PRODUCTS[transaction.productId];
  if (!product || transaction.type !== "Consumable") {
    throw new AppleIapError("unknown_product", "This credit pack is not available.");
  }
  if (transaction.revocationDate) {
    throw new AppleIapError("revoked", "This purchase was refunded.", 409);
  }
  const token = String(transaction.appAccountToken || "").toLowerCase();
  if (!UUID_RE.test(token) || token !== String(userId || "").toLowerCase()) {
    throw new AppleIapError("wrong_account", "This purchase was made with another KunThai account.", 403);
  }
  if (!String(transaction.transactionId || "").trim()) {
    throw new AppleIapError("invalid_jws", "This App Store receipt is not valid.");
  }
  return product;
}

export function appleSupabaseConfig() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const missing = [];
  if (!supabaseUrl) missing.push("SUPABASE_URL (or VITE_SUPABASE_URL)");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (missing.length) {
    const error = new Error("Payment service environment variables are incomplete.");
    error.missing = missing;
    throw error;
  }
  return { supabaseUrl, serviceRoleKey };
}
