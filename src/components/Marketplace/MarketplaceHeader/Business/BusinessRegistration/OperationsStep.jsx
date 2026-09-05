import RegistrationField from "./RegistrationField";
import RegistrationInput from "./RegistrationInput";
import ToggleRow from "./ToggleRow";
import { useI18n, t } from "../../../../../i18n";
import { supportsMarketplaceFulfillment } from "../../../../../Backend/services/marketplace/marketplaceBusinessKinds";

const BUSINESS_TYPES = [
  { id: "physical", labelKey: "typePhysical" },
  { id: "online", labelKey: "typeOnline" },
  { id: "both", labelKey: "typeBoth" },
];

const VENDOR_TYPES = [
  ["wholesaler", "Wholesaler"],
  ["distributor", "Distributor"],
  ["manufacturer", "Manufacturer"],
  ["importer", "Importer"],
  ["general_supplier", "General supplier"],
];

const SALES_MODELS = [
  ["wholesale", "Wholesale only"],
  ["wholesale_retail", "Wholesale and retail"],
  ["contract_supply", "Contract and institutional supply"],
];

const SELLING_UNITS = ["item", "pack", "carton", "bag", "kilogram", "tonne", "litre", "pallet", "roll", "box"];

export default function OperationsStep({ registration }) {
  useI18n();
  const { form, errors, updateSection } = registration;
  const kind = form.identity.businessKind || "retail";
  const usesFulfillment = supportsMarketplaceFulfillment(kind);
  const isVendor = kind === "vendor";

  return (
    <div className="space-y-5">
      <RegistrationField label={t("urmall.biz.settings.businessType")}>
        <select
          value={form.operations.businessType}
          onChange={(event) => updateSection("operations", { businessType: event.target.value })}
          className="h-12 w-full rounded-xl border border-gray-300 bg-white px-4 text-sm font-bold text-gray-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
        >
          {BUSINESS_TYPES.map((type) => (
            <option key={type.id} value={type.id}>
              {t(`urmall.biz.reg.${type.labelKey}`)}
            </option>
          ))}
        </select>
      </RegistrationField>

      {isVendor ? (
        <section className="space-y-4 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">Vendor operations</p>
            <h3 className="mt-1 text-lg font-black text-gray-950">Set your normal supply terms</h3>
            <p className="mt-1 text-sm font-semibold leading-6 text-gray-600">
              These defaults help buyers understand how you sell. You can override them on individual products.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <RegistrationField label="Vendor type" error={errors.vendorType}>
              <select
                value={form.operations.vendorType}
                onChange={(event) => updateSection("operations", { vendorType: event.target.value })}
                className="h-12 w-full rounded-xl border border-gray-300 bg-white px-4 text-sm font-bold text-gray-800 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
              >
                {VENDOR_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </RegistrationField>

            <RegistrationField label="Sales model" error={errors.salesModel}>
              <select
                value={form.operations.salesModel}
                onChange={(event) => updateSection("operations", { salesModel: event.target.value })}
                className="h-12 w-full rounded-xl border border-gray-300 bg-white px-4 text-sm font-bold text-gray-800 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
              >
                {SALES_MODELS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </RegistrationField>

            <RegistrationField label="Default selling unit" error={errors.defaultSellingUnit}>
              <select
                value={form.operations.defaultSellingUnit}
                onChange={(event) => updateSection("operations", { defaultSellingUnit: event.target.value })}
                className="h-12 w-full rounded-xl border border-gray-300 bg-white px-4 text-sm font-bold capitalize text-gray-800 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
              >
                {SELLING_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
              </select>
            </RegistrationField>

            <RegistrationField label="Default minimum order" error={errors.defaultMinOrderQuantity}>
              <RegistrationInput
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={form.operations.defaultMinOrderQuantity}
                onChange={(event) => updateSection("operations", { defaultMinOrderQuantity: event.target.value })}
              />
            </RegistrationField>

            <RegistrationField label="Typical lead time (days)" error={errors.leadTimeDays}>
              <RegistrationInput
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={form.operations.leadTimeDays}
                onChange={(event) => updateSection("operations", { leadTimeDays: event.target.value })}
              />
            </RegistrationField>

            <RegistrationField label="Areas you supply">
              <RegistrationInput
                value={form.operations.serviceAreas}
                onChange={(event) => updateSection("operations", { serviceAreas: event.target.value })}
                placeholder="Freetown, Bo, nationwide"
              />
            </RegistrationField>
          </div>

          <ToggleRow
            label="Accept quotation requests"
            description="Buyers can contact you to discuss bulk quantities and supply terms."
            checked={form.operations.quotationEnabled}
            onChange={(checked) => updateSection("operations", { quotationEnabled: checked })}
          />
        </section>
      ) : null}

      {usesFulfillment ? <div className="grid gap-3 sm:grid-cols-2">
        <ToggleRow
          label={kind === "restaurant" ? t("urmall.biz.reg.mealDelivery") : isVendor ? "Vendor delivery" : t("urmall.biz.reg.deliveryOption")}
          checked={form.operations.deliveryEnabled}
          onChange={(checked) => updateSection("operations", { deliveryEnabled: checked })}
        />
        <ToggleRow
          label={kind === "restaurant" ? t("urmall.biz.reg.mealPickup") : isVendor ? "Warehouse pickup" : t("urmall.biz.reg.pickupOption")}
          checked={form.operations.pickupEnabled}
          onChange={(checked) => updateSection("operations", { pickupEnabled: checked })}
        />
      </div> : (
        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm font-semibold leading-6 text-blue-900">
          {kind === "hotel"
            ? t("urmall.biz.reg.hotelMsg")
            : t("urmall.biz.reg.realEstateMsg")}
        </div>
      )}
      {errors.fulfillment ? <p data-field-error="true" className="text-xs font-bold text-red-600" role="alert">{errors.fulfillment}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <RegistrationField label={t("urmall.biz.reg.openingTime")}>
          <RegistrationInput
            type="time"
            value={form.operations.openTime}
            onChange={(event) => updateSection("operations", { openTime: event.target.value })}
          />
        </RegistrationField>
        <RegistrationField label={t("urmall.biz.reg.closingTime")}>
          <RegistrationInput
            type="time"
            value={form.operations.closeTime}
            onChange={(event) => updateSection("operations", { closeTime: event.target.value })}
          />
        </RegistrationField>
      </div>
    </div>
  );
}
