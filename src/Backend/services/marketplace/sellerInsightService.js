import supabase from "../../lib/supabaseClient";
import { readRegisteredBusiness } from "./sellerRegistrationService";

export async function fetchSellerInsights() {
  const business = await readRegisteredBusiness();
  if (!business) return null;

  const { data, error } = await supabase
    .from("marketplace_products")
    .select("name, views, sales")
    .eq("business_id", business.id);

  if (error) throw new Error(error.message);

  const products = data || [];
  const views = products.reduce((sum, product) => sum + Number(product.views || 0), 0);
  const sales = products.reduce((sum, product) => sum + Number(product.sales || 0), 0);
  const mostViewed = products.length
    ? [...products].sort((a, b) => Number(b.views || 0) - Number(a.views || 0))[0]
    : null;
  const mostAbandoned = products.length
    ? [...products].sort((a, b) => Number(b.views || 0) - Number(b.sales || 0) - (Number(a.views || 0) - Number(a.sales || 0)))[0]
    : null;

  return {
    metrics: {
      viewsTrend: {
        value: "0%",
        label: "Views trend",
        detail: views ? "Trend data needs more days" : "No store views yet",
      },
      productClicks: {
        value: views,
        label: "Product clicks",
        detail: "Tracked from product views for now",
      },
      conversionRate: {
        value: views ? `${Math.round((sales / views) * 100)}%` : "0%",
        label: "Conversion rate",
        detail: "Views that became sales",
      },
      returningCustomers: {
        value: 0,
        label: "Returning customers",
        detail: "No returning buyers yet",
      },
    },
    trafficSources: [],
    searchTerms: [],
    productSignals: {
      mostViewed: {
        name: mostViewed?.name || "No products yet",
        views: mostViewed?.views || 0,
        clicks: mostViewed?.views || 0,
      },
      mostAbandoned: {
        name: mostAbandoned?.name || "No product data yet",
        views: mostAbandoned?.views || 0,
        orders: mostAbandoned?.sales || 0,
        reason: mostAbandoned ? "High views compared with sales" : "Add products to discover buyer behavior",
      },
    },
  };
}

export async function fetchSellerProductInsights(product) {
  const business = await readRegisteredBusiness();
  if (!business?.id || !product?.id) return null;

  const [productResult, promotionsResult] = await Promise.all([
    supabase
      .from("marketplace_products")
      .select("id,name,views,sales,revenue,stock,status,main_image_url")
      .eq("business_id", business.id)
      .eq("id", product.id)
      .maybeSingle(),
    supabase
      .from("marketplace_promotions")
      .select("*")
      .eq("business_id", business.id)
      .eq("product_id", product.id)
      .order("created_at", { ascending: false })
      .limit(12),
  ]);

  const latestProduct = productResult.data || {};
  const source = {
    ...product,
    name: latestProduct.name || product.name,
    views: latestProduct.views ?? product.views,
    sales: latestProduct.sales ?? product.sales,
    revenue: latestProduct.revenue ?? product.revenue,
    stock: latestProduct.stock ?? product.stock,
    status: latestProduct.status || product.status,
    mainImageUrl: latestProduct.main_image_url || product.mainImageUrl,
  };
  const promotions = promotionsResult.error ? [] : (promotionsResult.data || []);
  const now = Date.now();
  const views = Number(source.views || 0);
  const sales = Number(source.sales || 0);
  const activePromotion = promotions.find((promotion) => {
    const endsAt = promotion.ends_at ? new Date(promotion.ends_at).getTime() : Infinity;
    return promotion.status === "active" && endsAt > now;
  }) || null;
  const latestPromotion = promotions[0] || null;

  return {
    product: source,
    views,
    sales,
    revenue: Number(source.revenue || 0),
    stock: Number(source.stock || 0),
    conversionRate: views ? Math.min(100, (sales / views) * 100) : 0,
    promotionViews: promotions.reduce((sum, promotion) => sum + Number(promotion.views || 0), 0),
    promotionOrders: promotions.reduce((sum, promotion) => sum + Number(promotion.orders || 0), 0),
    promotionRevenue: promotions.reduce((sum, promotion) => sum + Number(promotion.revenue || 0), 0),
    promotionCount: promotions.length,
    activePromotion,
    latestPromotion,
  };
}
