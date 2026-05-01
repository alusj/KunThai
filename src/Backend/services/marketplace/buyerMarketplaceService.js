import supabase from "../../lib/supabaseClient";

function mapBuyerProduct(product) {
  return {
    id: product.id,
    name: product.name,
    price: Number(product.price || 0),
    discountPrice:
      product.discount_price === null || product.discount_price === undefined
        ? null
        : Number(product.discount_price || 0),
    location: product.location || "Location not added",
    category: product.category || "General",
    imageUrl: product.main_image_url,
    stock: Number(product.stock || 0),
    views: Number(product.views || 0),
    sales: Number(product.sales || 0),
    createdAt: product.created_at,
  };
}

export async function fetchBuyerMarketplaceProducts() {
  const { data, error } = await supabase
    .from("marketplace_products")
    .select(
      "id,name,price,discount_price,location,category,main_image_url,stock,views,sales,created_at",
    )
    .eq("status", "active")
    .gt("stock", 0)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const products = (data || []).map(mapBuyerProduct);

  return {
    newProducts: products,
    discountedProducts: products.filter((product) => product.discountPrice),
    highDemandProducts: [...products]
      .filter((product) => product.views > 0 || product.sales > 0)
      .sort((a, b) => b.sales + b.views - (a.sales + a.views)),
    topRatedProducts: products,
  };
}
