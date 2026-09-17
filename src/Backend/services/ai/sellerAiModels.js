// KAI — pure seller helpers.
//
// Every number the assistant explains to a seller is calculated here from the
// seller's real rows. The model receives finished figures with money already
// formatted, so it can explain a trend but never compute (or invent) one.

import { moneyLabel } from "./urmallAiModels.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDayUtc(time) {
  const date = new Date(time);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function round1(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function percentChange(current, previous) {
  if (!previous) return current ? null : 0;
  return round1(((current - previous) / previous) * 100);
}

/**
 * Orders per day for the last `days`, plus totals for the period before it.
 * Revenue counts completed orders only, matching the seller dashboard.
 */
export function buildSalesTrendFacts(orders, { days = 30, now = Date.now(), currency = "" } = {}) {
  const list = Array.isArray(orders) ? orders : [];
  const periodStart = startOfDayUtc(now) - (days - 1) * DAY_MS;
  const previousStart = periodStart - days * DAY_MS;

  const current = list.filter((order) => new Date(order.created_at).getTime() >= periodStart);
  const previous = list.filter((order) => {
    const time = new Date(order.created_at).getTime();
    return time >= previousStart && time < periodStart;
  });

  const revenue = (items) => items.filter((order) => order.status === "completed").reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
  const byStatus = (items) =>
    items.reduce((counts, order) => {
      const status = order.status || "pending";
      counts[status] = (counts[status] || 0) + 1;
      return counts;
    }, {});

  // Weekly buckets keep a 30/90 day answer small enough to send.
  const bucketDays = days <= 7 ? 1 : 7;
  const buckets = [];
  for (let start = periodStart; start <= startOfDayUtc(now); start += bucketDays * DAY_MS) {
    const end = start + bucketDays * DAY_MS;
    const items = current.filter((order) => {
      const time = new Date(order.created_at).getTime();
      return time >= start && time < end;
    });
    buckets.push({
      from: new Date(start).toISOString().slice(0, 10),
      orders: items.length,
      completedRevenue: moneyLabel(revenue(items), currency),
    });
  }

  const currentRevenue = revenue(current);
  const previousRevenue = revenue(previous);
  const completed = current.filter((order) => order.status === "completed");

  return {
    days,
    bucket: bucketDays === 1 ? "day" : "week",
    currency,
    totals: {
      orders: current.length,
      completedOrders: completed.length,
      completedRevenue: moneyLabel(currentRevenue, currency),
      averageCompletedOrder: completed.length ? moneyLabel(currentRevenue / completed.length, currency) : null,
      byStatus: byStatus(current),
    },
    previousPeriod: {
      orders: previous.length,
      completedRevenue: moneyLabel(previousRevenue, currency),
      ordersChangePercent: percentChange(current.length, previous.length),
      revenueChangePercent: percentChange(currentRevenue, previousRevenue),
    },
    series: buckets,
    note: current.length ? undefined : "No orders in this period.",
  };
}

const SORTERS = {
  views: (a, b) => Number(b.views || 0) - Number(a.views || 0),
  sales: (a, b) => Number(b.sales || 0) - Number(a.sales || 0),
  conversion: (a, b) => conversion(b) - conversion(a) || Number(b.views || 0) - Number(a.views || 0),
  low_stock: (a, b) => Number(a.stock || 0) - Number(b.stock || 0),
  newest: (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0),
};

function conversion(product) {
  const views = Number(product.views || 0);
  return views ? Number(product.sales || 0) / views : 0;
}

/** Product performance, including KunThai's own low-stock rule. */
export function productPerformanceFacts(products, { sortBy = "views", limit = 6, currency = "" } = {}) {
  const list = (Array.isArray(products) ? products : []).filter((product) => product && product.status !== "deleted");
  const sorted = [...list].sort(SORTERS[sortBy] || SORTERS.views);
  const scoped = sortBy === "low_stock" ? sorted.filter((product) => product.status === "active") : sorted;

  const isLowStock = (product) => {
    const stock = Number(product.stock || 0);
    return product.status === "active" && stock > 0 && stock <= Number(product.low_stock_alert || 0);
  };

  return {
    totalProducts: list.length,
    activeProducts: list.filter((product) => product.status === "active").length,
    outOfStock: list.filter((product) => product.status === "active" && Number(product.stock || 0) <= 0).length,
    lowStock: list.filter(isLowStock).length,
    totals: {
      views: list.reduce((sum, product) => sum + Number(product.views || 0), 0),
      sales: list.reduce((sum, product) => sum + Number(product.sales || 0), 0),
    },
    sortedBy: sortBy,
    products: scoped.slice(0, limit).map((product) => {
      const views = Number(product.views || 0);
      const sales = Number(product.sales || 0);
      const discount = Number(product.discount_price);
      const price = Number.isFinite(discount) && discount > 0 && discount < Number(product.price || 0) ? discount : Number(product.price || 0);
      return {
        id: product.id,
        name: String(product.name || "").slice(0, 120),
        status: product.status,
        category: product.category || undefined,
        priceLabel: moneyLabel(price, currency),
        stock: Number(product.stock || 0),
        lowStock: isLowStock(product),
        views,
        sales,
        conversionPercent: views ? round1((sales / views) * 100) : null,
        ...(product.revenue !== undefined && product.revenue !== null ? { revenue: moneyLabel(product.revenue, currency) } : {}),
      };
    }),
  };
}

/** The dashboard summary, without placeholder metrics the dashboard shows. */
export function businessSummaryFacts(overview, sales) {
  if (!overview?.business) return { error: "No UrMall business is set up for this account yet." };
  const currency = overview.business.currency || "";
  return {
    business: {
      name: overview.business.name,
      kind: overview.business.kind,
      location: overview.business.location || undefined,
      verification: overview.business.verificationLabel,
    },
    setup: {
      healthScore: overview.health?.score ?? null,
      missingItems: (overview.health?.missingItems || []).slice(0, 8),
    },
    today: {
      orders: overview.today?.orders ?? 0,
      completedRevenue: moneyLabel(overview.today?.revenue || 0, currency),
      unreadCustomerConversations: overview.today?.pendingMessages ?? 0,
      lowStockProducts: overview.today?.lowStockAlerts ?? 0,
    },
    ...(sales
      ? {
          revenue: {
            today: moneyLabel(sales.revenue?.today || 0, currency),
            last7Days: moneyLabel(sales.revenue?.weekly || 0, currency),
            thisMonth: moneyLabel(sales.revenue?.monthly || 0, currency),
          },
          orders: sales.orders,
          averageCompletedOrder: moneyLabel(sales.averageOrderValue || 0, currency),
        }
      : {}),
  };
}

/** Conversation overview: topics and the buyer's last words, no identities. */
export function customerMessagesFacts(care) {
  if (!care) return { error: "No UrMall business is set up for this account yet." };
  const metrics = care.metrics || {};
  return {
    unreadConversations: metrics.unreadMessages || 0,
    questionsWaiting: metrics.buyerQuestionsWaiting || 0,
    negotiationRequests: metrics.negotiationRequests || 0,
    supportDisputes: metrics.supportDisputes || 0,
    totalConversations: (care.conversations || []).length,
    recent: (care.conversations || []).slice(0, 8).map((conversation) => {
      const lastBuyer = [...(conversation.messages || [])].reverse().find((message) => message.from !== "seller" && message.text);
      return {
        topic: String(conversation.topic || conversation.productName || "UrMall message").slice(0, 80),
        type: conversation.type || undefined,
        unread: Boolean(conversation.unread),
        messages: (conversation.messages || []).length,
        lastBuyerMessage: lastBuyer ? String(lastBuyer.text).slice(0, 160) : undefined,
      };
    }),
  };
}

function compactDetails(details) {
  if (!details || typeof details !== "object") return undefined;
  const entries = Object.entries(details)
    .filter(([key, value]) => !["tierPricing"].includes(key) && value !== null && value !== undefined && value !== "" && typeof value !== "object")
    .slice(0, 15)
    .map(([key, value]) => [String(key).slice(0, 40), String(value).slice(0, 80)]);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

/**
 * The listing a seller is writing, as AI may see it. Prices are left out on
 * purpose: none of the listing helpers should talk about or change price.
 */
export function listingDraftFacts(form = {}) {
  const basics = form.basics || {};
  const media = form.media || {};
  const delivery = form.delivery || {};
  const description = String(basics.description || "").trim();
  return {
    name: String(basics.name || "").trim() || undefined,
    category: basics.category || undefined,
    condition: basics.condition || undefined,
    brand: String(basics.brand || "").trim() || undefined,
    model: String(basics.model || "").trim() || undefined,
    description: description ? description.slice(0, 2_000) : undefined,
    details: compactDetails(form.details),
    delivery: {
      deliveryAvailable: Boolean(delivery.deliveryAvailable),
      pickupAvailable: Boolean(delivery.pickupAvailable),
      deliveryTimeStated: delivery.deliveryTime ? String(delivery.deliveryTime).slice(0, 60) : undefined,
    },
    // KunThai's own completeness checks, so quality advice rests on facts.
    completeness: {
      hasCoverPhoto: Boolean(media.coverImageFile || media.coverImageUrl),
      extraPhotos: (media.extraImageFiles?.length || 0) + (media.extraImageUrls?.length || 0),
      hasVideo: Boolean(media.videoFile || media.videoUrl),
      descriptionWords: description ? description.split(/\s+/).length : 0,
      hasBrand: Boolean(String(basics.brand || "").trim()),
      hasModel: Boolean(String(basics.model || "").trim()),
    },
  };
}

/** Append chosen search keywords to a description as one editable line. */
export function appendKeywordsToDescription(description, keywords, label = "Keywords") {
  const current = String(description || "").trimEnd();
  const lines = current.split("\n");
  const prefix = `${label}:`;
  const existingLineIndex = lines.findIndex((line) => line.trim().toLowerCase().startsWith(prefix.toLowerCase()));
  const existing = existingLineIndex >= 0
    ? lines[existingLineIndex].slice(lines[existingLineIndex].indexOf(":") + 1).split(",").map((item) => item.trim().toLowerCase()).filter(Boolean)
    : [];
  const merged = Array.from(new Set([...existing, ...(Array.isArray(keywords) ? keywords : []).map((item) => String(item).trim().toLowerCase()).filter(Boolean)]));
  if (!merged.length) return current;
  const line = `${prefix} ${merged.join(", ")}`;
  if (existingLineIndex >= 0) {
    lines[existingLineIndex] = line;
    return lines.join("\n");
  }
  return current ? `${current}\n\n${line}` : line;
}
