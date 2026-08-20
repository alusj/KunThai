const DAY_MS = 24 * 60 * 60 * 1000;

function normalizeStatus(value) {
  return String(value || "pending").trim().toLowerCase();
}

function orderSubject(order = {}) {
  return String(order.preview || order.product?.name || "Your order").trim();
}

export function buildBuyerOrderNotification(order = {}) {
  if (!order.id) return null;

  const status = normalizeStatus(order.status);
  // Financial events stay out of the notification centre until KunThai's
  // payment and refund products are active.
  if (["paid", "payment_failed", "refunded", "refund_pending"].includes(status)) return null;

  const subject = orderSubject(order);
  const seller = order.sellerName || "the seller";
  const copy = {
    pending: {
      title: "Order request sent",
      body: `${subject} was sent to ${seller}. We will notify you when its status changes.`,
    },
    accepted: {
      title: "Seller accepted your order",
      body: `${seller} accepted ${subject}.`,
    },
    confirmed: {
      title: "Order confirmed",
      body: `${seller} confirmed ${subject}.`,
    },
    processing: {
      title: "Order is being prepared",
      body: `${seller} is preparing ${subject}.`,
    },
    shipped: {
      title: "Order is on the way",
      body: `${subject} has been marked as shipped by ${seller}.`,
    },
    completed: {
      title: "Order completed",
      body: `${subject} has been completed. You can open the order to review the item or contact the seller.`,
    },
    cancelled: {
      title: "Order cancelled",
      body: `${subject} was cancelled. Open the order for the latest details.`,
    },
    canceled: {
      title: "Order cancelled",
      body: `${subject} was cancelled. Open the order for the latest details.`,
    },
  }[status] || {
    title: "Order updated",
    body: `${subject} now has the status “${status.replaceAll("_", " ")}”.`,
  };

  return {
    id: `buyer-order:${order.id}:${status}`,
    type: "order",
    status,
    title: copy.title,
    body: copy.body,
    actionLabel: "View order",
    actionTarget: "buyer-orders",
    orderId: order.id,
    productId: order.productId || order.product?.id || "",
    createdAt: order.updatedAt || order.createdAt || "",
    unread: true,
  };
}

export function buildBuyerOrderNotifications(orders = []) {
  return orders
    .map(buildBuyerOrderNotification)
    .filter(Boolean)
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
}

function productAgeDays(product, now) {
  const listedAt = new Date(product.published_at || product.created_at || 0).getTime();
  if (!Number.isFinite(listedAt) || listedAt <= 0) return 0;
  return Math.max(0, Math.floor((now - listedAt) / DAY_MS));
}

function activityBase(product, signal, createdAt) {
  return {
    id: `product-signal:${signal}:${product.id}`,
    type: signal === "stock" ? "stock" : "product",
    productId: product.id,
    createdAt,
    sortTimestamp: new Date(createdAt || 0).getTime(),
    synthetic: true,
    dismissible: false,
  };
}

export function buildSellerProductNotificationSignals(products = [], now = Date.now()) {
  const signals = [];

  products
    .filter((product) => product?.id && normalizeStatus(product.status) === "active")
    .forEach((product) => {
      const name = String(product.name || "Product").trim();
      const views = Math.max(0, Number(product.views || 0));
      const sales = Math.max(0, Number(product.sales || 0));
      const stock = Math.max(0, Number(product.stock || 0));
      const lowStockAt = Math.max(0, Number(product.low_stock_alert ?? 3));
      const conversion = views ? sales / views : 0;
      const ageDays = productAgeDays(product, now);
      const createdAt = product.updated_at || product.published_at || product.created_at || "";

      if (stock === 0) {
        signals.push({
          ...activityBase(product, "stock", createdAt),
          id: `product-signal:out-of-stock:${product.id}`,
          title: `${name} is out of stock`,
          description: "Buyers cannot order this product until its stock is updated.",
          status: "warning",
          meta: "Inventory needs attention",
          actionLabel: "Update product",
          actionTarget: "seller-product-detail",
          priority: 4,
        });
      } else if (lowStockAt > 0 && stock <= lowStockAt) {
        signals.push({
          ...activityBase(product, "stock", createdAt),
          id: `product-signal:low-stock:${product.id}`,
          title: `${name} is running low`,
          description: `Only ${stock} item${stock === 1 ? "" : "s"} remain in stock.`,
          status: "warning",
          meta: "Low stock",
          actionLabel: "Update stock",
          actionTarget: "seller-product-detail",
          priority: 3,
        });
      }

      if (views >= 50 && sales >= 3 && conversion >= 0.05) {
        signals.push({
          ...activityBase(product, "performing", createdAt),
          id: `product-signal:performing:${product.id}:${Math.max(1, Math.floor(views / 50))}`,
          title: `${name} is performing very well`,
          description: `${views} product clicks have led to ${sales} sale${sales === 1 ? "" : "s"}. Keep the listing accurate and stock available.`,
          status: "active",
          meta: `${Math.round(conversion * 100)}% view-to-sale conversion`,
          actionLabel: "View insights",
          actionTarget: "seller-product-insights",
          priority: 2,
        });
      } else if (ageDays >= 14 && views >= 25 && sales === 0) {
        signals.push({
          ...activityBase(product, "interest-no-sales", createdAt),
          title: `${name} is getting attention but no sales yet`,
          description: `${views} buyers opened this product. Review its photos, description, availability, and offer.`,
          status: "warning",
          meta: "Interest is not converting yet",
          actionLabel: "View insights",
          actionTarget: "seller-product-insights",
          priority: 2,
        });
      } else if (ageDays >= 14 && views < 10) {
        signals.push({
          ...activityBase(product, "low-visibility", createdAt),
          title: `${name} needs more visibility`,
          description: `${views} product click${views === 1 ? "" : "s"} since listing. Improve the main photo, title, category, and product details.`,
          status: "warning",
          meta: `Listed ${ageDays} days ago`,
          actionLabel: "Improve listing",
          actionTarget: "seller-product-detail",
          priority: 1,
        });
      }
    });

  return signals
    .sort((a, b) => (b.priority - a.priority) || (b.sortTimestamp - a.sortTimestamp))
    .slice(0, 12)
    .map(({ priority: _priority, ...signal }) => signal);
}
