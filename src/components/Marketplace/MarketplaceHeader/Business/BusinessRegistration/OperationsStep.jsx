import RegistrationField from "./RegistrationField";
import RegistrationInput from "./RegistrationInput";
import ToggleRow from "./ToggleRow";
import { useI18n, t } from "../../../../../i18n";

const BUSINESS_TYPES = [
  { id: "physical", labelKey: "typePhysical" },
  { id: "online", labelKey: "typeOnline" },
  { id: "both", labelKey: "typeBoth" },
];

export default function OperationsStep({ registration }) {
  useI18n();
  const { form, errors, updateSection } = registration;
  const kind = form.identity.businessKind || "retail";
  const usesFulfillment = kind === "retail" || kind === "restaurant";

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

      {usesFulfillment ? <div className="grid gap-3 sm:grid-cols-2">
        <ToggleRow
          label={kind === "restaurant" ? t("urmall.biz.reg.mealDelivery") : t("urmall.biz.reg.deliveryOption")}
          checked={form.operations.deliveryEnabled}
          onChange={(checked) => updateSection("operations", { deliveryEnabled: checked })}
        />
        <ToggleRow
          label={kind === "restaurant" ? t("urmall.biz.reg.mealPickup") : t("urmall.biz.reg.pickupOption")}
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
