// src/components/Marketplace/MarketplaceHeader/Business/BusinessActions/SmartActions.jsx

import ActionButton from "./ActionButton";
import ActionBadge from "./ActionBadge";

/**
 * SmartActions
 * - High-priority actions for the business owner
 * - Supports badges (orders, messages, alerts)
 */

export default function SmartActions() {
  return (
    <div className="grid grid-cols-2 gap-4">
      
      <ActionButton
        icon="➕"
        label="Add New Product"
        onClick={() => console.log("Add product")}
      />

      <div className="relative">
        <ActionButton
          icon="📦"
          label="View Orders"
          onClick={() => console.log("View orders")}
        />
        <ActionBadge value={5} />
      </div>

      <ActionButton
        icon="📣"
        label="Promote Business"
        onClick={() => console.log("Promote")}
      />

      <ActionButton
        icon="⚙️"
        label="Manage Store"
        onClick={() => console.log("Manage store")}
      />

      <div className="relative">
        <ActionButton
          icon="💬"
          label="Messages"
          onClick={() => console.log("Messages")}
        />
        <ActionBadge value={2} />
      </div>

    </div>
  );
}
