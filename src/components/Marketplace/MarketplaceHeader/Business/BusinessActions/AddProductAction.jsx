// src/components/Marketplace/MarketplaceHeader/Business/BusinessActions/AddProductAction.jsx

import ActionButton from "./ActionButton";

/**
 * Add new product action
 */

export default function AddProductAction() {
  return (
    <ActionButton
      icon="➕"
      label="Add New Product"
      onClick={() => {
        console.log("Add product clicked");
      }}
    />
  );
}
