// src/components/Marketplace/MarketplaceHeader/Business/BusinessActions/PromoteBusinessAction.jsx

import ActionButton from "./ActionButton";

/**
 * Promote business action
 */

export default function PromoteBusinessAction() {
  return (
    <ActionButton
      icon="📢"
      label="Promote Business"
      onClick={() => {
        console.log("Promote business clicked");
      }}
    />
  );
}
