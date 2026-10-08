import supabase from "../lib/supabaseClient";

// Seller screens keep their last result in module memory so reopening them is
// instant. That memory belongs to one business: it is emptied whenever the
// active business changes, so a screen never shows (or acts on) the previous
// business's orders, products or messages.
const MARKETPLACE_BUSINESS_CHANGED = "kunthai-marketplace-business-changed";
const memories = [];

export function registerSellerMemory(memory) {
  memories.push({ memory, initial: { ...memory } });
  return memory;
}

export function clearSellerMemories() {
  memories.forEach(({ memory, initial }) => Object.assign(memory, initial));
}

if (typeof window !== "undefined") {
  window.addEventListener(MARKETPLACE_BUSINESS_CHANGED, clearSellerMemories);
}

// Everything above, plus what survives a business switch (the "has a
// business" check, the per-business overview cache, the registration draft
// and the active-business hint), belongs to one signed-in account. It is all
// dropped on sign-out or when a different account signs in on this device,
// so the next account never sees the previous seller's data.
const SELLER_ACCOUNT_STORAGE_KEYS = [
  "kunthai.sellerOverview",
  "kunthai.marketplace.active-business-hint.v1",
  "marketplace-seller-registration-draft",
];
const SELLER_ACCOUNT_OWNER_KEY = "kunthai.marketplace.seller-account.v1";
const accountResets = [];

export function registerSellerAccountReset(reset) {
  accountResets.push(reset);
}

export function clearSellerAccountMemories() {
  clearSellerMemories();
  accountResets.forEach((reset) => {
    try {
      reset();
    } catch {
      // One screen's reset must not stop the others.
    }
  });
  try {
    SELLER_ACCOUNT_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
  } catch {
    // Storage can be blocked; module memory is already cleared.
  }
}

function readSellerAccountOwner() {
  try {
    return localStorage.getItem(SELLER_ACCOUNT_OWNER_KEY) || "";
  } catch {
    return "";
  }
}

function writeSellerAccountOwner(userId) {
  try {
    if (userId) localStorage.setItem(SELLER_ACCOUNT_OWNER_KEY, userId);
    else localStorage.removeItem(SELLER_ACCOUNT_OWNER_KEY);
  } catch {
    // Best effort: the sign-out reset below still runs.
  }
}

if (typeof window !== "undefined") {
  supabase.auth.onAuthStateChange?.((event, session) => {
    const userId = session?.user?.id || "";
    if (event === "SIGNED_OUT") {
      clearSellerAccountMemories();
      writeSellerAccountOwner("");
      return;
    }
    if (!userId) return;
    const owner = readSellerAccountOwner();
    if (owner && owner !== userId) clearSellerAccountMemories();
    if (owner !== userId) writeSellerAccountOwner(userId);
  });
}
