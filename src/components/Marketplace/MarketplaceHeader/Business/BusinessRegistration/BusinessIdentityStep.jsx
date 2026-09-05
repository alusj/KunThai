import CategorySelector from "./CategorySelector";
import RegistrationField from "./RegistrationField";
import RegistrationInput from "./RegistrationInput";
import { Building2 } from "lucide-react";
import { useI18n, t } from "../../../../../i18n";
import {
  supportsMarketplaceFulfillment,
  usesMarketplaceCategories,
} from "../../../../../Backend/services/marketplace/marketplaceBusinessKinds";

export default function BusinessIdentityStep({ registration }) {
  useI18n();
  const {
    form,
    errors,
    categories,
    updateSection,
    toggleCategory,
    updateOtherCategory,
    addOtherCategory,
    businessKinds,
  } = registration;

  return (
    <div className="space-y-5">
      <RegistrationField label={t("urmall.biz.reg.primaryType")} error={errors.businessKind}>
        <div className="relative">
          <Building2 className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={19} />
          <select
            value={form.identity.businessKind}
            onChange={(event) => {
              const businessKind = event.target.value;
              updateSection("identity", {
                businessKind,
                categories: usesMarketplaceCategories(businessKind) ? form.identity.categories : [],
                otherCategory: "",
              });
              if (!supportsMarketplaceFulfillment(businessKind)) {
                updateSection("operations", { deliveryEnabled: false, pickupEnabled: false });
              }
              if (businessKind === "vendor" && form.location.mainLabel === "Main store") {
                updateSection("location", { mainLabel: "Main warehouse" });
              } else if (businessKind !== "vendor" && form.location.mainLabel === "Main warehouse") {
                updateSection("location", { mainLabel: "Main store" });
              }
            }}
            className="h-14 w-full appearance-none rounded-2xl border border-gray-300 bg-white pl-12 pr-4 text-sm font-black text-gray-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
          >
            {businessKinds.map((kind) => <option key={kind.id} value={kind.id}>{kind.label}</option>)}
          </select>
          <p className="mt-2 text-xs font-semibold leading-5 text-gray-500">
            {businessKinds.find((kind) => kind.id === form.identity.businessKind)?.description}
          </p>
        </div>
      </RegistrationField>

      <RegistrationField label={t("urmall.biz.reg.businessName")} error={errors.businessName}>
        <RegistrationInput
          value={form.identity.businessName}
          onChange={(event) => updateSection("identity", { businessName: event.target.value })}
          placeholder={t("urmall.biz.reg.businessNamePlaceholder")}
          autoComplete="organization"
        />
      </RegistrationField>

      {usesMarketplaceCategories(form.identity.businessKind) ? (
        <CategorySelector
          categories={categories}
          selected={form.identity.categories}
          otherValue={form.identity.otherCategory}
          error={errors.categories}
          otherError={errors.otherCategory}
          onToggle={toggleCategory}
          onOtherChange={updateOtherCategory}
          onOtherAdd={addOtherCategory}
        />
      ) : null}

      <RegistrationField label={t("urmall.biz.reg.shortDescription")} error={errors.description}>
        <textarea
          value={form.identity.description}
          onChange={(event) => updateSection("identity", { description: event.target.value })}
          placeholder={t("urmall.biz.reg.descPlaceholder")}
          rows={4}
          className="w-full rounded-lg border border-gray-300 px-3 py-3 text-sm font-medium outline-none transition focus:border-blue-500"
        />
      </RegistrationField>

      <div className="grid gap-4 sm:grid-cols-2">
        <RegistrationField label={t("urmall.biz.reg.logoUpload")}>
          <RegistrationInput
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.target.files?.[0] || null;
              updateSection("identity", { logoFile: file, logoName: file?.name || "" });
            }}
          />
        </RegistrationField>
        <RegistrationField label={t("urmall.biz.reg.bannerOptional")}>
          <RegistrationInput
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.target.files?.[0] || null;
              updateSection("identity", { bannerFile: file, bannerName: file?.name || "" });
            }}
          />
        </RegistrationField>
      </div>
    </div>
  );
}
