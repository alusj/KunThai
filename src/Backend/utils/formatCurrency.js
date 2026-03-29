// backend/utils/formatCurrency.js
// Formats money dynamically based on user's country

// Detect user country automatically
const detectCurrency = () => {
  const locale = navigator.language; // e.g., "en-GB", "en-SL"

  // Basic country mapping (expand later)
  if (locale.includes("SL")) return "SLE"; // Sierra Leone
  if (locale.includes("GB")) return "GBP";
  if (locale.includes("US")) return "USD";

  // Default fallback
  return "SLE";
};

export const formatCurrency = (amount) => {
  const currency = detectCurrency();

  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
  }).format(amount);
};