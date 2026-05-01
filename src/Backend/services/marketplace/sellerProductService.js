import supabase from "../../lib/supabaseClient";
import { readRegisteredBusiness } from "./sellerRegistrationService";

function countByStatus(products, status) {
  return products.filter((product) => product.status === status).length;
}

export async function fetchSellerProducts() {
  const business = await readRegisteredBusiness();
  if (!business) {
    return { summary: null, products: [], topSellingProducts: [] };
  }

  const { data, error } = await supabase
    .from("marketplace_products")
    .select("*")
    .eq("business_id", business.id)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const products = (data || []).map((product) => ({
    id: product.id,
    name: product.name,
    price: Number(product.price || 0),
    status: product.status,
    stock: product.stock,
    views: product.views,
    sales: product.sales,
    revenue: Number(product.revenue || 0),
    trend: product.sales > 0 ? "Selling" : "No sales yet",
  }));

  return {
    summary: {
      active: countByStatus(products, "active") + countByStatus(products, "low-stock"),
      draft: countByStatus(products, "draft"),
      outOfStock: countByStatus(products, "out-of-stock"),
      lowStock: countByStatus(products, "low-stock"),
      pendingReview: countByStatus(products, "pending-review"),
      noViewsOrSales: products.filter((product) => product.views === 0 && product.sales === 0).length,
    },
    products,
    topSellingProducts: products
      .filter((product) => product.sales > 0)
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 3),
  };
}
