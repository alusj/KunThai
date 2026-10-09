import { useEffect } from "react";

import { incrementVerticalListingView } from "../../Backend/services/marketplace/marketplaceVerticalService";
import { showToast } from "../../Backend/services/toastService";
import { t } from "../../i18n";
import ProductDetailDrawer from "./Browse/ProductDetailDrawer";
import { useI18n as useUiLocale } from "../../i18n/index.js";
import { openAiAssistant } from "../../Backend/services/ai/aiSurfaceService";
import { describeListingForAi, readBuyerCoordinates, verticalDetailFactsForAi } from "../../Backend/services/ai/urmallAiModels";

// KAI on a meal, room, hotel or property detail: the same header pill as a
// shop product, answering only from this listing's facts.
const KAI_COPY = {
  restaurant: { title: "kaiListingFix.titleMeal", ask: "kaiListingFix.askMeal", askSeller: "kaiListingFix.promptAskRestaurant", screen: "restaurant meal detail" },
  room: { title: "kaiListingFix.titleRoom", ask: "kaiListingFix.askStay", askSeller: "kaiListingFix.promptAskHotel", screen: "hotel room detail" },
  hotel: { title: "kaiListingFix.titleHotel", ask: "kaiListingFix.askStay", askSeller: "kaiListingFix.promptAskHotel", screen: "hotel detail" },
  property: { title: "kaiListingFix.titleProperty", ask: "kaiListingFix.askProperty", askSeller: "kaiListingFix.promptAskAgent", screen: "property detail" },
};

function listingFacts(product) {
  return verticalDetailFactsForAi(product, { buyer: readBuyerCoordinates() });
}

function openListingAi(product, type) {
  const copy = KAI_COPY[type] || KAI_COPY.property;
  openAiAssistant({
    surface: "urmall",
    screen: copy.screen,
    title: t(copy.title),
    // Questions only: no text-editing actions apply to someone else's listing.
    actions: [],
    prompts: [t("kaiListingFix.promptValue"), t("kaiListingFix.promptSummary"), t(copy.askSeller)],
    askTask: "urmall.product_question",
    askPlaceholder: t(copy.ask),
    buildAskInput: () => ({ listing: listingFacts(product) }),
  });
}

// The buyer-facing detail for a meal, hotel or property listing. Shared by the
// vertical discovery feed and a vertical seller's profile so a listing opens
// the same way wherever a shopper taps it.

// "hotel" is the whole property; "room" is one bookable room type inside it.
// Both are stay bookings, so they share the check-in/check-out flow.
const STAY_TYPES = ["hotel", "room"];

export default function VerticalBuyerDetail({ onClose, onMessage, onOpenSeller, onOrder, onRelatedProductSelect, product, relatedProducts, type }) {
  useUiLocale();
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
      onAskAi={() => openListingAi(product, type)}
      aiScreen={() => ({
        id: `urmall-${type}-detail-${product.id}`,
        title: `UrMall ${(KAI_COPY[type] || KAI_COPY.property).screen} — ${String(product.name || "").slice(0, 50)}`,
        describe: () => describeListingForAi(listingFacts(product)),
      })}
    />
  );
}
