import ProductActionButton from "./ProductActionButton";

export default function ProductInlineActions({ product }) {
  const needsRestock = product.status === "out-of-stock" || product.status === "low-stock";

  return (
    <div className="flex flex-wrap gap-2">
      {needsRestock ? (
        <ProductActionButton
          label="Restock"
          onClick={() => console.log("Restock", product.id)}
        />
      ) : null}
      <ProductActionButton
        label="Edit price"
        onClick={() => console.log("Edit price", product.id)}
      />
      <ProductActionButton
        label="Promote"
        onClick={() => console.log("Promote", product.id)}
      />
      <ProductActionButton
        label="Pause"
        onClick={() => console.log("Pause", product.id)}
      />
    </div>
  );
}
