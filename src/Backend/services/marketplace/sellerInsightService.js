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
