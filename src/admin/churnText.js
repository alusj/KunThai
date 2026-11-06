import { t as i18nText } from "../i18n/index";

// Text helpers for the admin Churn intelligence screens (adminChurn.* keys).
export const tx = (key, vars) => i18nText(`adminChurn.${key}`, vars);

export function productName(product, fallback = "") {
  const key = `adminChurn.product.${product}`;
  const label = i18nText(key);
  return label === key ? fallback || product : label;
}

export function keyedLabel(group, key) {
  const full = `adminChurn.${group}.${key}`;
  const label = i18nText(full);
  return label === full ? String(key || "").replaceAll("_", " ") : label;
}
