// src/components/Marketplace/MarketplaceHeader/Business/BusinessActions/BusinessActions.jsx

/**
 * Business quick actions section
 * - Composes individual action buttons
 * - Controls layout only
 */

import AddProductAction from "./AddProductAction";
import ViewOrdersAction from "./ViewOrdersAction";
import PromoteBusinessAction from "./PromoteBusinessAction";
import ManageStoreAction from "./ManageStoreAction";

export default function BusinessActions({
  onAddProduct,
  onManageStore,
  onPromoteBusiness,
  onViewOrders,
}) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">

      <AddProductAction onClick={onAddProduct} />
      <ViewOrdersAction onClick={onViewOrders} />
      <PromoteBusinessAction onClick={onPromoteBusiness} />
      <ManageStoreAction onClick={onManageStore} />

    </div>
  );
}
