// src/components/Marketplace/Business/Products.jsx

import ProductCard from "./ProductCard";

const mockProducts = [
  {
    id: 1,
    name: "iPhone 14 Pro",
    price: 1200,
    discount_price: 999,
  },
  {
    id: 2,
    name: "Samsung Galaxy S23",
    price: 1100,
  },
];

export default function Products() {
  return (
    <div className="space-y-4">

      <h3 className="text-lg font-semibold text-gray-800">
        My Products
      </h3>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {mockProducts.map(product => (
          <ProductCard
            key={product.id}
            product={product}
          />
        ))}
      </div>

    </div>
  );
}
