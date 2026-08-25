import { useEffect } from "react";

import { incrementVerticalListingView } from "../../Backend/services/marketplace/marketplaceVerticalService";
import { showToast } from "../../Backend/services/toastService";
import { t } from "../../i18n";
import ProductDetailDrawer from "./Browse/ProductDetailDrawer";

// The buyer-facing detail for a meal, hotel or property listing. Shared by the
// vertical discovery feed and a vertical seller's profile so a listing opens
// the same way wherever a shopper taps it.

// "hotel" is the whole property; "room" is one bookable room type inside it.
// Both are stay bookings, so they share the check-in/check-out flow.
const STAY_TYPES = ["hotel", "room"];

export default function VerticalBuyerDetail({ onClose, onMessage, onOpenSeller, onOrder, onRelatedProductSelect, product, relatedProducts, type }) {
  const isRestaurant = type === "restaurant";
  const isStay = STAY_TYPES.includes(type);

  // Count one organic view whenever a buyer opens a vertical listing, so the
  // seller's Insights reflect real reach (parity with retail product views).
  useEffect(() => {
    // The hotel card is the business itself, not a listing row, so there is
    // nothing per-listing to count for it.
    const listingType = type === "restaurant" ? "meal" : type === "room" ? "room" : type === "property" ? "property" : "";
    if (!listingType) return;
    incrementVerticalListingView(listingType, product?.id);
  }, [product?.id, type]);

  const serviceValue = isRestaurant
    ? product.deliveryAvailable && product.pickupAvailable ? t("urmall.vertical.serviceDeliveryPickup") : product.deliveryAvailable ? t("urmall.vertical.serviceDelivery") : t("urmall.vertical.servicePickup")
    : isStay ? t("urmall.vertical.serviceHotelDates") : t("urmall.vertical.servicePropertyViewing");
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
      bookingStartLabel={isStay ? t("urmall.vertical.checkIn") : t("urmall.vertical.viewingDate")}
      bookingEndLabel={t("urmall.vertical.checkOut")}
      bookingUsesEndDate={isStay}
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
      detailsHeading={type === "restaurant" ? t("urmall.vertical.detailsMeal") : type === "room" ? t("urmall.vertical.detailsRoom") : type === "hotel" ? t("urmall.vertical.detailsHotel") : t("urmall.vertical.detailsProperty")}
      historyKey={`marketplace-${type}-detail`}
      messageContextLabel={type === "restaurant" ? t("urmall.vertical.inquiryMeal") : type === "room" ? t("urmall.vertical.inquiryRoom") : type === "hotel" ? t("urmall.vertical.inquiryHotel") : t("urmall.vertical.inquiryProperty")}
      messageLabel={t("urmall.vertical.message")}
      serviceLabel={type === "restaurant" ? t("urmall.vertical.fulfilment") : isStay ? t("urmall.vertical.stay") : t("urmall.vertical.viewing")}
      serviceValue={serviceValue}
    />
  );
}
