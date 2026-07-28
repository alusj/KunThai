import { useEffect, useRef, useState } from "react";

import { useSellerProductForm } from "../../../../../Backend/hooks/useSellerProductForm";
import { useI18n, t } from "../../../../../i18n";
import ProductBasicsStep from "./ProductBasicsStep";
import ProductDeliveryReviewStep from "./ProductDeliveryReviewStep";
import ProductDetailsStep from "./ProductDetailsStep";
import ProductFormProgress from "./ProductFormProgress";
import ProductMediaStep from "./ProductMediaStep";
import ProductPreview from "./ProductPreview";
import ProductPricingStep from "./ProductPricingStep";
import ListingUploadProgressCard from "../../../shared/ListingUploadProgressCard";
import AppBackTab from "../../../../shared/AppBackTab";
import { StepScrollTransition } from "../../../../shared/motion";
import { useDirectionalStep } from "../../../../shared/motionHooks";

const STEPS = [
  { titleKey: "stepBasics", component: ProductBasicsStep },
  { titleKey: "stepDetails", component: ProductDetailsStep },
  { titleKey: "stepMedia", component: ProductMediaStep },
  { titleKey: "stepPricing", component: ProductPricingStep },
  { titleKey: "stepDelivery", component: ProductDeliveryReviewStep },
];

export default function AddProductForm({ mode = "create", product = null, onCancel, onComplete }) {
  useI18n();
  const [finishing, setFinishing] = useState(false);
  const formTopRef = useRef(null);
  const productForm = useSellerProductForm({
    mode,
    product,
    onComplete(savedProduct) {
      setFinishing(true);
      window.setTimeout(() => onComplete?.(savedProduct), 360);
    },
  });
  const StepComponent = STEPS[productForm.step].component;
  const editing = mode === "edit";
  const stepSlideDirection = useDirectionalStep(productForm.step);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      formTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [productForm.step]);

  return (
    <div ref={formTopRef} className={`${finishing ? "kt-product-flow-collapse-to-bottom" : ""} min-h-screen bg-gray-50`}>
      <header className="sticky top-0 z-30 border-b border-gray-100 bg-white px-3 py-3 shadow-sm sm:px-4">
        <div className="flex w-full items-center gap-3">
            <AppBackTab
              onBack={productForm.step > 0 ? productForm.back : onCancel}
              label={productForm.step > 0 ? t("urmall.biz.pform.backPrevStep") : t("urmall.biz.reg.backPrevScreen")}
              historyKey="marketplace-product-form"
              className="rounded-full border border-gray-200 bg-white hover:bg-gray-50"
              useHistoryLayer={false}
            />
            <div className="min-w-0">
            <p className="text-xs font-black uppercase text-emerald-700">{editing ? t("urmall.biz.pform.editListingEyebrow") : t("urmall.biz.header.addProduct")}</p>
            <h1 className="truncate text-lg font-black text-gray-950">
              {editing ? t("urmall.biz.pform.editTitle") : t("urmall.biz.pform.createTitle")}
            </h1>
            <p className="truncate text-xs text-gray-500">
              {editing
                ? t("urmall.biz.pform.editSubtitle")
                : t("urmall.biz.pform.createSubtitle")}
            </p>
          </div>
        </div>
      </header>

      <div className="w-full px-4 py-5 sm:px-6 lg:px-8">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <main className="space-y-4">
            {productForm.draftRestored ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                <p className="min-w-0 text-sm font-bold text-emerald-800">
                  {t("urmall.biz.pform.draftRestored")}
                </p>
                <button
                  type="button"
                  onClick={productForm.discardDraft}
                  className="shrink-0 rounded-full border border-emerald-300 bg-white px-3 py-1.5 text-xs font-black text-emerald-700"
                >
                  {t("urmall.biz.pform.startFresh")}
                </button>
              </div>
            ) : null}
            <ProductFormProgress step={productForm.step} />

            <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-black text-gray-950">{t(`urmall.biz.pform.${STEPS[productForm.step].titleKey}`)}</h2>
              <div className="mt-5">
                <StepScrollTransition stepKey={productForm.step} direction={stepSlideDirection}>
                  <StepComponent productForm={productForm} />
                </StepScrollTransition>
              </div>
            </section>

            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={productForm.back}
                disabled={productForm.step === 0}
                className="rounded-lg border border-gray-200 px-4 py-3 text-sm font-black text-gray-700 disabled:opacity-40"
              >
                {t("common.back")}
              </button>
              {productForm.step < STEPS.length - 1 ? (
                <button
                  type="button"
                  onClick={productForm.next}
                  className="rounded-lg bg-emerald-600 px-5 py-3 text-sm font-black text-white hover:bg-emerald-700"
                >
                  {t("urmall.biz.reg.continue")}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={productForm.submit}
                  disabled={productForm.submitting}
                  className="rounded-lg bg-emerald-600 px-5 py-3 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {productForm.submitting
                    ? t("urmall.biz.pform.saving")
                    : editing
                      ? t("urmall.biz.pform.updateListing")
                      : productForm.form.pricing.publishStatus === "draft"
                        ? t("urmall.biz.reg.saveDraft")
                        : productForm.form.pricing.publishStatus === "promoted"
                          ? t("urmall.biz.pform.publishPromote")
                          : t("urmall.biz.pform.publishProduct")}
                </button>
              )}
            </div>
            {productForm.errors.submit ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
                {productForm.errors.submit}
              </div>
            ) : null}
            {productForm.warnings.video ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-700">
                {productForm.warnings.video}
              </div>
            ) : null}
            {productForm.submitting && productForm.saveStatus ? (
              <ListingUploadProgressCard
                stage={productForm.saveStatus}
                title={editing ? t("urmall.biz.pform.updatingProduct") : t("urmall.biz.pform.addingProduct")}
              />
            ) : null}
          </main>

          <ProductPreview preview={productForm.preview} />
        </div>
      </div>
    </div>
  );
}
