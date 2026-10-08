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
