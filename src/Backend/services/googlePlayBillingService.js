// Google Play Billing for Visibility Credits — Android app only.
//
// Native side: KunThaiPlayBilling (android/app/.../KunThaiPlayBillingPlugin.kt,
// Play Billing Library). Server side: /api/payments/google-verify-purchase asks
// the Google Play Developer API about the purchase token and adds the credits
// once per purchase.
//
// Order of a purchase: Google Play purchase sheet -> purchase token to the
// server -> credits added -> only then is the purchase consumed with Google
// Play. A purchase left unconsumed (app closed, no connection, server busy) is
// retried on the next start, on sign-in and whenever Google Play delivers it
// again, so a paid purchase is never lost. A PENDING purchase (cash payment not
// made yet) is credited once Google Play reports it paid. The web keeps Monime.
import { Capacitor, registerPlugin } from "@capacitor/core";

import supabase from "../lib/supabaseClient";
import { apiUrl } from "../lib/apiUrl";
import { APPLE_CREDIT_PRODUCT_IDS, creditsForAppleProduct } from "./appleIapService";

const KunThaiPlayBilling = registerPlugin("KunThaiPlayBilling");

// The same consumable products as the App Store (Play Console in-app products
// and GOOGLE_PLAY_CREDIT_PRODUCTS in server/googlePlay.js).
export const GOOGLE_PLAY_CREDIT_PRODUCT_IDS = APPLE_CREDIT_PRODUCT_IDS;
export const creditsForGooglePlayProduct = creditsForAppleProduct;

// Server answers after which retrying the same purchase can never succeed:
// consume it so Google Play stops offering it. "wrong_account" is NOT here —
// that purchase belongs to another KunThai account and is credited when it
// signs in; "pending" waits for the payment.
const FINAL_REFUSALS = new Set(["revoked", "unknown_product", "invalid_purchase"]);

export function isGooglePlayBillingAvailable() {
  try {
    return Capacitor.getPlatform() === "android" && Capacitor.isPluginAvailable("KunThaiPlayBilling");
  } catch {
    return false;
  }
}

function log(message) {
  // Product ids and outcomes only; never a purchase token, order or account id.
  console.info(`[KunThai Play Billing] ${message}`);
}

async function session() {
  const { data } = await supabase.auth.getSession();
  return data?.session || null;
}

// Packs with Google Play's localized price, smallest first. [] when unavailable.
export async function loadGooglePlayCreditPacks() {
  if (!isGooglePlayBillingAvailable()) return [];
  const { products = [] } = await KunThaiPlayBilling.getProducts({ productIds: [...GOOGLE_PLAY_CREDIT_PRODUCT_IDS] });
  return products
    .map((product) => ({ ...product, credits: creditsForGooglePlayProduct(product.productId) }))
    .filter((product) => product.credits > 0)
    .sort((a, b) => a.credits - b.credits);
}

// One confirmation per purchase token at a time (purchase(), the "purchase"
// event and the start-up retry can all deliver the same purchase).
const inFlight = new Map();

// Sends one purchase token to the server. Returns
// { status: "added", credits, balance } | { status: "delayed" } | { status: "pending" } | { status: "refused", code }.
function confirmPurchase(purchase) {
  const token = purchase?.purchaseToken;
  if (!token) return Promise.resolve({ status: "delayed" });
  if (purchase.purchaseState === "pending") return Promise.resolve({ status: "pending" });
  if (!inFlight.has(token)) {
    inFlight.set(token, sendPurchase(purchase).finally(() => inFlight.delete(token)));
  }
  return inFlight.get(token);
}

async function sendPurchase({ purchaseToken, productId }) {
  const current = await session();
  if (!current?.access_token) return { status: "delayed" };

  let response;
  let result = null;
  try {
    response = await fetch(apiUrl("/api/payments/google-verify-purchase"), {
      method: "POST",
      headers: { Authorization: `Bearer ${current.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ productId, purchaseToken }),
    });
    result = await response.json().catch(() => null);
  } catch {
    log(`confirm ${productId}: offline, will retry`);
    return { status: "delayed" };
  }

  if (response.ok && result?.ok) {
    await KunThaiPlayBilling.consume({ purchaseToken }).catch(() => {});
    window.dispatchEvent(new CustomEvent("kuntai-visibility-credits-updated"));
    log(`confirm ${productId}: credits added`);
    return { status: "added", credits: Number(result.credits) || creditsForGooglePlayProduct(productId), balance: result.balance };
  }

  const code = String(result?.code || "");
  if (FINAL_REFUSALS.has(code)) {
    await KunThaiPlayBilling.consume({ purchaseToken }).catch(() => {});
    log(`confirm ${productId}: refused (${code}), consumed`);
    return { status: "refused", code };
  }
  log(`confirm ${productId}: ${code || response.status}, will retry`);
  if (code === "pending") return { status: "pending" };
  return code === "wrong_account" ? { status: "refused", code } : { status: "delayed" };
}

// Runs the Google Play purchase sheet for one pack.
// Returns { status: "added" | "delayed" | "pending" | "cancelled" | "refused", ... }.
export async function buyGooglePlayCredits(productId) {
  if (!isGooglePlayBillingAvailable()) throw new Error("Google Play Billing is not available.");
  const current = await session();
  if (!current?.user?.id || current.user.is_anonymous) {
    const error = new Error("Sign in to buy Visibility Credits.");
    error.code = "signin";
    throw error;
  }
  log(`purchase ${productId}: started`);
  const result = await KunThaiPlayBilling.purchase({ productId, obfuscatedAccountId: current.user.id });
  if (result?.status !== "purchased") {
    log(`purchase ${productId}: ${result?.status || "cancelled"}`);
    return { status: result?.status === "pending" ? "pending" : "cancelled" };
  }
  return confirmPurchase(result);
}

let resuming = null;

// Credits every paid-but-unconsumed purchase for the signed-in account.
export function resumeGooglePlayPurchases() {
  if (!isGooglePlayBillingAvailable()) return Promise.resolve();
  if (resuming) return resuming;
  resuming = (async () => {
    if (!(await session())?.user?.id) return;
    const { purchases = [] } = await KunThaiPlayBilling.pendingPurchases().catch(() => ({ purchases: [] }));
    for (const purchase of purchases) {
      if (purchase.purchaseState === "purchased") await confirmPurchase(purchase);
    }
  })().finally(() => {
    resuming = null;
  });
  return resuming;
}

let started = false;

// Once at app start (main.jsx). Google Play delivers completed pending
// payments and purchases made outside the app through "purchase"; sign-in
// retries anything left.
export function initGooglePlayCreditPurchases() {
  if (started || !isGooglePlayBillingAvailable()) return;
  started = true;
  Promise.resolve(KunThaiPlayBilling.addListener("purchase", (purchase) => {
    confirmPurchase(purchase).catch(() => {});
  })).catch(() => {});
  supabase.auth.onAuthStateChange((event) => {
    if (event === "INITIAL_SESSION" || event === "SIGNED_IN") {
      setTimeout(() => {
        resumeGooglePlayPurchases().catch(() => {});
      }, 0);
    }
  });
}
