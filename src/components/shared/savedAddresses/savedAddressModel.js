// Shared helpers for saved locations (UrMall delivery addresses and UrRide
// saved places), which share one shape — see SavedAddressBook.jsx.

import { t } from "../../../i18n";

export function getAddressText(address = {}) {
  return String(address.street || address.address || address.detectedAddress || "").trim();
}

export function getAddressCategoryLabel(address = {}) {
  if (address.category === "Other") return address.customCategory || t("addressBook.categories.Other");
  const key = `addressBook.categories.${address.category}`;
  const label = t(key);
  return label === key ? address.category || t("addressBook.categories.Other") : label;
}

export function getAddressShareText(address = {}) {
  const lines = [
    t("addressBook.shareTitle", { label: getAddressCategoryLabel(address) }),
    getAddressText(address) || t("addressBook.addressPending"),
  ];
  if (address.phone) lines.push(t("addressBook.sharePhone", { phone: address.phone }));
  if (address.note) lines.push(t("addressBook.shareNote", { note: address.note }));
  return lines.join("\n");
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

// Every saved location while the field is empty or still shows a saved
// address; once the person types something else, the ones that match it.
export function filterSavedAddressSuggestions(addresses = [], query = "") {
  const text = normalize(query);
  const showsSavedAddress = addresses.some((address) =>
    [getAddressText(address), address.detectedAddress, address.street].some((value) => normalize(value) === text),
  );
  if (!text || showsSavedAddress) return addresses;
  return addresses.filter((address) =>
    [getAddressText(address), address.detectedAddress, getAddressCategoryLabel(address), address.customCategory, address.placeName]
      .some((value) => normalize(value).includes(text)),
  );
}
