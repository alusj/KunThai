// src/components/Marketplace/MarketplaceHeader/Business/BusinessActions/ViewOrdersAction.jsx

import ActionButton from "./ActionButton";

/**
 * View orders action
 */

export default function ViewOrdersAction() {
  return (
    <ActionButton
      icon="📦"
      label="View Orders"
      onClick={() => {
        console.log("View orders clicked");
      }}
    />
  );
}
