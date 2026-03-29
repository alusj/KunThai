// src/components/Marketplace/MarketplaceHeader/Business/BusinessActions/ManageStoreAction.jsx

import ActionButton from "./ActionButton";

/**
 * Manage store settings action
 */

export default function ManageStoreAction() {
  return (
    <ActionButton
      icon="⚙️"
      label="Manage Store"
      onClick={() => {
        console.log("Manage store clicked");
      }}
    />
  );
}
