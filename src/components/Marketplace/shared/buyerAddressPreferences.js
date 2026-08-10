export const BUYER_ADDRESS_SELECTED_EVENT = "marketplace-delivery-address-selected";

const BUYER_ADDRESS_KEY = "marketplace-buyer-address";
const BUYER_ADDRESSES_KEY = "marketplace-buyer-addresses";
const BUYER_DELETED_ADDRESS_KEYS = "marketplace-buyer-deleted-addresses";

function readJson(key, fallback) {
  if (typeof window === "undefined") return fallback;
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function getBuyerAddressKey(address = {}) {
  const id = String(address.id || "").trim();
  if (id) return `id:${id}`;

  const category = String(address.category || address.type || "Resident").trim().toLowerCase();
  const location = String(address.street || address.address || address.detectedAddress || "").trim().toLowerCase();
  return `address:${category}:${location}`;
}

export function readBuyerAddressPreference() {
  const saved = readJson(BUYER_ADDRESS_KEY, null);
  if (saved && typeof saved === "object") return saved;
  if (typeof saved === "string" && saved.trim()) {
    return { category: "Resident", street: saved.trim() };
  }

  // Keep compatibility with the original plain-text address value, which is
  // not valid JSON and therefore cannot be returned by readJson.
  if (typeof window !== "undefined") {
    const legacyAddress = window.localStorage.getItem(BUYER_ADDRESS_KEY) || "";
    if (legacyAddress.trim() && !legacyAddress.trim().startsWith("{")) {
      return { category: "Resident", street: legacyAddress.trim() };
    }
  }
  return null;
}

export function readDeletedBuyerAddressKeys() {
  const saved = readJson(BUYER_DELETED_ADDRESS_KEYS, []);
  return Array.isArray(saved) ? saved : [];
}

export function filterDeletedBuyerAddresses(addresses = []) {
  const deleted = new Set(readDeletedBuyerAddressKeys());
  return (Array.isArray(addresses) ? addresses : []).filter((address) => !deleted.has(getBuyerAddressKey(address)));
}

export function readBuyerAddressList() {
  return filterDeletedBuyerAddresses(readJson(BUYER_ADDRESSES_KEY, []));
}

export function mergeRemoteBuyerAddresses(remoteAddresses = [], localAddresses = readBuyerAddressList()) {
  const visibleRemote = filterDeletedBuyerAddresses(remoteAddresses);
  const remoteKeys = new Set(visibleRemote.map(getBuyerAddressKey));
  const unsyncedLocal = filterDeletedBuyerAddresses(localAddresses).filter((address) =>
    String(address.id || "").startsWith("local-") && !remoteKeys.has(getBuyerAddressKey(address))
  );
  return [...visibleRemote, ...unsyncedLocal];
}

export function writeBuyerAddressPreference(address, { notify = true } = {}) {
  if (typeof window === "undefined") return;
  if (address) writeJson(BUYER_ADDRESS_KEY, address);
  else window.localStorage.removeItem(BUYER_ADDRESS_KEY);

  if (notify) {
    window.dispatchEvent(new CustomEvent(BUYER_ADDRESS_SELECTED_EVENT, { detail: { address: address || null } }));
  }
}

export function writeBuyerAddressList(addresses = []) {
  const visibleAddresses = filterDeletedBuyerAddresses(addresses);
  writeJson(BUYER_ADDRESSES_KEY, visibleAddresses);
  return visibleAddresses;
}

export function markBuyerAddressDeleted(address) {
  const addressKey = getBuyerAddressKey(address);
  const deleted = new Set(readDeletedBuyerAddressKeys());
  deleted.add(addressKey);
  writeJson(BUYER_DELETED_ADDRESS_KEYS, [...deleted]);

  const addresses = writeBuyerAddressList(readJson(BUYER_ADDRESSES_KEY, []));
  if (getBuyerAddressKey(readBuyerAddressPreference() || {}) === addressKey) {
    writeBuyerAddressPreference(addresses[0] || null);
  }
  return addresses;
}

export function clearBuyerAddressDeleted(address) {
  const addressKey = getBuyerAddressKey(address);
  const deleted = readDeletedBuyerAddressKeys().filter((key) => key !== addressKey);
  writeJson(BUYER_DELETED_ADDRESS_KEYS, deleted);
}

export function restoreBuyerAddress(address) {
  clearBuyerAddressDeleted(address);
  return address;
}

export function findPreferredBuyerAddress(addresses = [], preference = readBuyerAddressPreference()) {
  const visibleAddresses = filterDeletedBuyerAddresses(addresses);
  if (!visibleAddresses.length) return null;
  const preferredKey = preference ? getBuyerAddressKey(preference) : "";
  return visibleAddresses.find((address) => getBuyerAddressKey(address) === preferredKey) || visibleAddresses[0];
}
