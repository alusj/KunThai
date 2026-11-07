// Pure helpers for the admin Churn intelligence page (no React, no Supabase).
// Server data comes from admin_churn_* RPCs (20261106150000_churn_admin.sql).

export const CHURN_PRODUCTS = Object.freeze([
  "explore",
  "swip",
  "urmall_buyer",
  "urmall_seller",
  "urride_passenger",
  "urride_operator",
  "business_plan",
  "credits",
]);

export const WATCH_STATUSES = Object.freeze(["attention", "at_risk", "churned", "new", "active", "all"]);
export const LEADER_PERIODS = Object.freeze([7, 30, 90]);

export function visibleChurnTabs(access) {
  const tabs = ["overview", "leaders", "regions"];
  if (access?.canViewUsers) tabs.push("watchlist");
  // Results are visible to everyone with churn access; the send form only with churn.campaigns.send.
  tabs.push("campaigns");
  if (access?.canManageAccess) tabs.push("access");
  return tabs;
}

function safeLocale(locale) {
  try {
    return Intl.NumberFormat.supportedLocalesOf([locale || "en"]).length ? locale : "en";
  } catch {
    return "en";
  }
}

export function formatPercent(rate, locale = "en") {
  const value = Number(rate);
  return new Intl.NumberFormat(safeLocale(locale), { style: "percent", maximumFractionDigits: 1 }).format(
    Number.isFinite(value) ? value : 0,
  );
}

export function formatCount(value, locale = "en") {
  const number = Number(value);
  return new Intl.NumberFormat(safeLocale(locale)).format(Number.isFinite(number) ? number : 0);
}

// Churn-rate change in percentage points, one decimal; null without a comparison.
export function pointChange(current, previous) {
  if (previous === null || previous === undefined) return null;
  const a = Number(current);
  const b = Number(previous);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((a - b) * 1000) / 10;
}

export function growthRate(current, prior) {
  const a = Number(current) || 0;
  const b = Number(prior) || 0;
  if (b <= 0) return null;
  return (a - b) / b;
}

export function stickiness(dau, mau) {
  const daily = Number(dau) || 0;
  const monthly = Number(mau) || 0;
  return monthly > 0 ? daily / monthly : 0;
}

// Amounts stay in their own currency: one formatted string per currency.
export function formatMoneyList(list, locale = "en") {
  if (!Array.isArray(list)) return [];
  return list
    .filter((item) => item && item.currency && Number(item.amount) > 0)
    .map((item) => {
      const amount = Number(item.amount);
      try {
        return new Intl.NumberFormat(safeLocale(locale), {
          style: "currency",
          currency: String(item.currency).toUpperCase(),
          maximumFractionDigits: amount >= 100 ? 0 : 2,
        }).format(amount);
      } catch {
        return `${String(item.currency).toUpperCase()} ${amount.toFixed(2)}`;
      }
    });
}

// Width of a bar as a whole percent: 0 for nothing, at least 2 so a small value shows.
export function barWidth(value, max) {
  const v = Number(value) || 0;
  const m = Number(max) || 0;
  if (v <= 0 || m <= 0) return 0;
  return Math.min(100, Math.max(2, Math.round((v / m) * 100)));
}

// ISO weekday (1 = Monday) to a short local name.
export function weekdayName(isoDow, locale = "en") {
  const day = Number(isoDow);
  if (!Number.isInteger(day) || day < 1 || day > 7) return "";
  // 1 January 2024 was a Monday.
  return new Intl.DateTimeFormat(safeLocale(locale), { weekday: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(2024, 0, day)),
  );
}

// Product access checkboxes: "all" is exclusive, and the list never ends up empty.
export function toggleProductScope(current, product) {
  const list = Array.isArray(current) ? current : ["all"];
  if (product === "all") return ["all"];
  const withoutAll = list.filter((item) => item !== "all");
  const next = withoutAll.includes(product) ? withoutAll.filter((item) => item !== product) : [...withoutAll, product];
  return next.length ? CHURN_PRODUCTS.filter((item) => next.includes(item)) : ["all"];
}

export function sameScopes(a, b) {
  const left = [...(a || [])].sort().join(",");
  const right = [...(b || [])].sort().join(",");
  return left === right;
}

export function personLabel(row, fallback = "") {
  if (row?.name) return row.name;
  if (row?.username) return `@${row.username}`;
  return fallback;
}

export function countryLabel(row, unknownLabel = "") {
  if (!row?.iso || row.iso === "??") return unknownLabel;
  return row.name || row.iso;
}

export function hasProvisional(products) {
  return Array.isArray(products) && products.some((item) => item?.provisional);
}
