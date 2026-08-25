import { useEffect } from "react";

import { incrementVerticalListingView } from "../../Backend/services/marketplace/marketplaceVerticalService";
import { showToast } from "../../Backend/services/toastService";
import { t } from "../../i18n";
import ProductDetailDrawer from "./Browse/ProductDetailDrawer";

// The buyer-facing detail for a meal, hotel or property listing. Shared by the
// vertical discovery feed and a vertical seller's profile so a listing opens
// the same way wherever a shopper taps it.

export default function VerticalBuyerDetail({ onClose, onMessage, onOpenSeller, onOrder, onRelatedProductSelect, product, relatedProducts, type }) {
  const isRestaurant = type === "restaurant";

  // Count one organic view whenever a buyer opens a vertical listing, so the
  // seller's Insights reflect real reach (parity with retail product views).
  useEffect(() => {
    const listingType = type === "restaurant" ? "meal" : type === "hotel" ? "room" : "property";
    incrementVerticalListingView(listingType, product?.id);
  }, [product?.id, type]);

  const serviceValue = isRestaurant
    ? product.deliveryAvailable && product.pickupAvailable ? t("urmall.vertical.serviceDeliveryPickup") : product.deliveryAvailable ? t("urmall.vertical.serviceDelivery") : t("urmall.vertical.servicePickup")
    : type === "hotel" ? t("urmall.vertical.serviceHotelDates") : t("urmall.vertical.servicePropertyViewing");
  return (
    <ProductDetailDrawer
      product={product}
      open
      onClose={onClose}
      onMessageSeller={onMessage}
      onOpenSeller={(seller) => onOpenSeller?.({ ...seller, verticalType: type })}
      onOrderProduct={onOrder}
      onNotice={(message, tone = "success") => showToast(message, tone)}
      actionLabel={isRestaurant ? t("urmall.vertical.actionOrder") : t("urmall.vertical.actionBook")}
      actionMode={isRestaurant ? "order" : "booking"}
      bookingStartLabel={type === "hotel" ? t("urmall.vertical.checkIn") : t("urmall.vertical.viewingDate")}
      bookingEndLabel={t("urmall.vertical.checkOut")}
      bookingUsesEndDate={type === "hotel"}
      showAddToCart={false}
      showMessage={isRestaurant}
      showOrder
      showInventory={false}
      showSave={false}
      relatedProducts={relatedProducts}
      onRelatedProductSelect={onRelatedProductSelect}
      reviewLabel={t("urmall.vertical.review")}
      reviewHeading={t("urmall.vertical.reviews")}
      reviewType="marketplace"
      detailsHeading={type === "restaurant" ? t("urmall.vertical.detailsMeal") : type === "hotel" ? t("urmall.vertical.detailsHotel") : t("urmall.vertical.detailsProperty")}
      historyKey={`marketplace-${type}-detail`}
      messageContextLabel={type === "restaurant" ? t("urmall.vertical.inquiryMeal") : type === "hotel" ? t("urmall.vertical.inquiryHotel") : t("urmall.vertical.inquiryProperty")}
      messageLabel={t("urmall.vertical.message")}
      serviceLabel={type === "restaurant" ? t("urmall.vertical.fulfilment") : type === "hotel" ? t("urmall.vertical.stay") : t("urmall.vertical.viewing")}
      serviceValue={serviceValue}
    />
  );
}
