import { useSellerProductForm } from "../../../../../Backend/hooks/useSellerProductForm";
import ProductBasicsStep from "./ProductBasicsStep";
import ProductDeliveryReviewStep from "./ProductDeliveryReviewStep";
import ProductFormProgress from "./ProductFormProgress";
import ProductMediaStep from "./ProductMediaStep";
import ProductPreview from "./ProductPreview";
import ProductPricingStep from "./ProductPricingStep";
import AppBackButton from "../../../../shared/AppBackButton";

const STEPS = [
  { title: "Product basics", component: ProductBasicsStep },
  { title: "Media", component: ProductMediaStep },
  { title: "Pricing & inventory", component: ProductPricingStep },
  { title: "Delivery, review & publish", component: ProductDeliveryReviewStep },
];

export default function AddProductForm({ mode = "create", product = null, onCancel, onComplete }) {
  const productForm = useSellerProductForm({ mode, product, onComplete });
  const StepComponent = STEPS[productForm.step].component;
  const editing = mode === "edit";

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-30 border-b border-gray-100 bg-white px-3 py-3 shadow-sm sm:px-4">
        <div className="flex w-full items-center gap-3">
            <AppBackButton
              onBack={onCancel}
              label="Back"
              historyKey="marketplace-product-form"
              className="rounded-full border border-gray-200 bg-white hover:bg-gray-50"
            />
            <div className="min-w-0">
            <p className="text-xs font-black uppercase text-blue-700">{editing ? "Edit Listing" : "Add Product"}</p>
            <h1 className="truncate text-lg font-black text-gray-950">
              {editing ? "Edit product listing" : "Create a product listing"}
            </h1>
            <p className="truncate text-xs text-gray-500">
              {editing
                ? "Update product details, media, pricing, inventory, delivery options, and publish status."
                : "Add product details, media, pricing, inventory, delivery options, and publish status."}
            </p>
          </div>
        </div>
      </header>

      <div className="w-full px-4 py-5 sm:px-6 lg:px-8">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <main className="space-y-4">
            <ProductFormProgress step={productForm.step} />

            <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-black text-gray-950">{STEPS[productForm.step].title}</h2>
              <div className="mt-5">
                <StepComponent productForm={productForm} />
              </div>
            </section>

            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={productForm.back}
                disabled={productForm.step === 0}
                className="rounded-lg border border-gray-200 px-4 py-3 text-sm font-black text-gray-700 disabled:opacity-40"
              >
                Back
              </button>
              {productForm.step < 3 ? (
                <button
                  type="button"
                  onClick={productForm.next}
                  className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-700"
                >
                  Continue
                </button>
              ) : (
                <button
                  type="button"
                  onClick={productForm.submit}
                  disabled={productForm.submitting}
                  className="rounded-lg bg-emerald-600 px-5 py-3 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {productForm.submitting
                    ? "Saving..."
                    : editing
                      ? "Update Listing"
                      : productForm.form.pricing.publishStatus === "draft"
                        ? "Save Draft"
                        : "Publish Product"}
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
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm font-bold text-blue-700">
                {productForm.saveStatus}
              </div>
            ) : null}
          </main>

          <ProductPreview preview={productForm.preview} />
        </div>
      </div>
    </div>
  );
}
