import ProductActionButton from "./ProductActionButton";

export default function ProductInlineActions({ product, onAction }) {
  const needsRestock = product.status === "out-of-stock" || product.status === "low-stock";

  return (
    <div className="grid gap-2 sm:flex sm:flex-wrap">
      {needsRestock ? (
        <ProductActionButton
          label="Restock"
          onClick={() => onAction?.(product, "restock")}
        />
      ) : null}
      <ProductActionButton
        label="Edit listing"
        onClick={() => onAction?.(product, "edit-listing")}
      />
      <ProductActionButton
        label="Promote"
        onClick={() => onAction?.(product, "promote")}
      />
      <ProductActionButton
        label={product.status === "paused" ? "Resume" : "Pause"}
        onClick={() => onAction?.(product, "pause")}
      />
    </div>
  );
}
