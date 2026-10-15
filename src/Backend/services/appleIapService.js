// Apple In-App Purchase for Visibility Credits — iOS app only.
//
// Native side: KunThaiStoreKitPlugin (ios/App/App/StoreKitCreditsPlugin.swift,
// StoreKit 2). Server side: /api/payments/apple-verify-purchase verifies
// Apple's signed transaction and adds the credits once per transaction.
//
// Order of a purchase: App Store purchase sheet -> signed transaction to the
// server -> credits added -> only then is the transaction finished with Apple.
// A transaction left unfinished (app closed, no connection, server busy) is
// retried on the next start and whenever StoreKit delivers it again, so a paid
// purchase is never lost. Android and the web keep using Monime.
import { Capacitor, registerPlugin } from "@capacitor/core";

import supabase from "../lib/supabaseClient";
import { apiUrl } from "../lib/apiUrl";

const KunThaiStoreKit = registerPlugin("KunThaiStoreKit");

// Must match the consumable products in App Store Connect and
// APPLE_CREDIT_PRODUCTS in server/appleIap.js.
export const APPLE_CREDIT_PRODUCT_IDS = Object.freeze([
  "app.kunthai.mobile.credits.75",
  "app.kunthai.mobile.credits.150",
  "app.kunthai.mobile.credits.225",
  "app.kunthai.mobile.credits.300",
]);

// Server answers after which retrying the same transaction can never succeed:
// finish it so StoreKit stops offering it. "wrong_account" is NOT here — that
// purchase belongs to another KunThai account and is credited when it signs in.
const FINAL_REFUSALS = new Set(["revoked", "unknown_product", "wrong_app"]);

export function creditsForAppleProduct(productId = "") {
  const credits = Number(String(productId).split(".").pop());
  return APPLE_CREDIT_PRODUCT_IDS.includes(productId) && Number.isInteger(credits) ? credits : 0;
}

export function isAppleIapAvailable() {
  try {
    return Capacitor.getPlatform() === "ios" && Capacitor.isPluginAvailable("KunThaiStoreKit");
  } catch {
    return false;
  }
}

function log(message) {
  // Product ids and outcomes only; never a receipt, token or account id.
  console.info(`[KunThai IAP] ${message}`);
}

async function session() {
  const { data } = await supabase.auth.getSession();
  return data?.session || null;
}

// Packs with Apple's localized price, smallest first. [] when unavailable.
export async function loadAppleCreditPacks() {
  if (!isAppleIapAvailable()) return [];
  const { products = [] } = await KunThaiStoreKit.getProducts({ productIds: [...APPLE_CREDIT_PRODUCT_IDS] });
  return products
    .map((product) => ({ ...product, credits: creditsForAppleProduct(product.productId) }))
    .filter((product) => product.credits > 0)
    .sort((a, b) => a.credits - b.credits);
}

// Sends one signed transaction to the server. Returns
// { status: "added", credits, balance } | { status: "delayed" } | { status: "refused", code }.
async function confirmTransaction({ signedTransaction, transactionId, productId }) {
  const current = await session();
  if (!current?.access_token || !signedTransaction || !transactionId) return { status: "delayed" };

  let response;
  let result = null;
  try {
    response = await fetch(apiUrl("/api/payments/apple-verify-purchase"), {
      method: "POST",
      headers: { Authorization: `Bearer ${current.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ signedTransaction }),
    });
    result = await response.json().catch(() => null);
  } catch {
    log(`confirm ${productId}: offline, will retry`);
    return { status: "delayed" };
  }

  if (response.ok && result?.ok) {
    await KunThaiStoreKit.finish({ transactionId }).catch(() => {});
    window.dispatchEvent(new CustomEvent("kuntai-visibility-credits-updated"));
    log(`confirm ${productId}: credits added`);
    return { status: "added", credits: Number(result.credits) || creditsForAppleProduct(productId), balance: result.balance };
  }

  const code = String(result?.code || "");
  if (FINAL_REFUSALS.has(code)) {
    await KunThaiStoreKit.finish({ transactionId }).catch(() => {});
    log(`confirm ${productId}: refused (${code}), finished`);
    return { status: "refused", code };
  }
  log(`confirm ${productId}: ${code || response.status}, will retry`);
  return code === "wrong_account" ? { status: "refused", code } : { status: "delayed" };
}

// Runs the App Store purchase sheet for one pack.
// Returns { status: "added" | "delayed" | "pending" | "cancelled" | "refused", ... }.
export async function buyAppleCredits(productId) {
  if (!isAppleIapAvailable()) throw new Error("In-App Purchase is not available.");
  const current = await session();
  if (!current?.user?.id || current.user.is_anonymous) {
    const error = new Error("Sign in to buy Visibility Credits.");
    error.code = "signin";
    throw error;
  }
  log(`purchase ${productId}: started`);
  const result = await KunThaiStoreKit.purchase({ productId, appAccountToken: current.user.id });
  if (result?.status !== "purchased") {
    log(`purchase ${productId}: ${result?.status || "cancelled"}`);
    return { status: result?.status === "pending" ? "pending" : "cancelled" };
  }
  return confirmTransaction(result);
}

let resuming = null;

// Credits every paid-but-unfinished transaction for the signed-in account.
export function resumeAppleTransactions() {
  if (!isAppleIapAvailable()) return Promise.resolve();
  if (resuming) return resuming;
  resuming = (async () => {
    if (!(await session())?.user?.id) return;
    const { transactions = [] } = await KunThaiStoreKit.unfinishedTransactions().catch(() => ({ transactions: [] }));
    for (const transaction of transactions) await confirmTransaction(transaction);
  })().finally(() => {
    resuming = null;
  });
  return resuming;
}

let started = false;

// Once at app start (main.jsx). StoreKit delivers Ask to Buy approvals and
// interrupted purchases through "transaction"; sign-in retries anything left.
export function initAppleCreditPurchases() {
  if (started || !isAppleIapAvailable()) return;
  started = true;
  Promise.resolve(KunThaiStoreKit.addListener("transaction", (transaction) => {
    confirmTransaction(transaction).catch(() => {});
  })).catch(() => {});
  supabase.auth.onAuthStateChange((event) => {
    if (event === "INITIAL_SESSION" || event === "SIGNED_IN") {
      setTimeout(() => {
        resumeAppleTransactions().catch(() => {});
      }, 0);
    }
  });
}
