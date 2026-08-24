import { useState } from "react";
import { friendlyErrorMessage } from "../../../../../Backend/services/friendlyErrorService";

import { promoteSellerProduct } from "../../../../../Backend/services/marketplace/sellerProductService";
import { haptics, sounds } from "../../../../../Backend/services/feedbackService";
import { useI18n, t } from "../../../../../i18n";
import PromotionSetupPanel from "../Promotion/PromotionSetupPanel";
import { normalizePromotionSettings } from "../Promotion/promotionSetup";

export default function ProductPromotionScreen({ onPromoted, product }) {
  useI18n();
  const [settings, setSettings] = useState(() => normalizePromotionSettings({
    credits: product?.promotionCredits,
    audience: product?.promotionAudience || "recommended",
  }));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function launch(nextSettings) {
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const promotion = await promoteSellerProduct(product, {
        credits: nextSettings.promotionCredits,
        audience: nextSettings.promotionAudience,
      });
      const chargedCredits = Number(promotion?.credit_budget || promotion?.credits_spent || nextSettings.promotionCredits);
      haptics.medium("marketplace");
      sounds.success("marketplace");
      onPromoted?.({ ...nextSettings, promotionCredits: chargedCredits, promotion });
    } catch (nextError) {
      setError(friendlyErrorMessage(nextError, "Unable to launch this promotion."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PromotionSetupPanel
      title={t("urmall.biz.promo.promoteListing", { name: product?.name || t("urmall.biz.cat.productKicker") })}
      settings={settings}
      onChange={setSettings}
      onConfirm={launch}
      submitting={submitting}
      error={error}
    />
  );
}
