import CategorySelector from "./CategorySelector";
import RegistrationField from "./RegistrationField";
import RegistrationInput from "./RegistrationInput";
import { Building2 } from "lucide-react";

export default function BusinessIdentityStep({ registration }) {
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
      <RegistrationField label="Primary business type" error={errors.businessKind}>
        <div className="relative">
          <Building2 className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={19} />
          <select
            value={form.identity.businessKind}
            onChange={(event) => {
              const businessKind = event.target.value;
              updateSection("identity", {
                businessKind,
                categories: businessKind === "retail" ? form.identity.categories : [],
                otherCategory: "",
              });
              if (!["retail", "restaurant"].includes(businessKind)) {
                updateSection("operations", { deliveryEnabled: false, pickupEnabled: false });
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

      <RegistrationField label="Business name" error={errors.businessName}>
        <RegistrationInput
          value={form.identity.businessName}
          onChange={(event) => updateSection("identity", { businessName: event.target.value })}
          placeholder="Jay Electronics"
          autoComplete="organization"
        />
      </RegistrationField>

      {form.identity.businessKind === "retail" ? (
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

      <RegistrationField label="Short description" error={errors.description}>
        <textarea
          value={form.identity.description}
          onChange={(event) => updateSection("identity", { description: event.target.value })}
          placeholder="Tell buyers what you sell and why they should trust you."
          rows={4}
          className="w-full rounded-lg border border-gray-300 px-3 py-3 text-sm font-medium outline-none transition focus:border-blue-500"
        />
      </RegistrationField>

      <div className="grid gap-4 sm:grid-cols-2">
        <RegistrationField label="Logo upload">
          <RegistrationInput
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.target.files?.[0] || null;
              updateSection("identity", { logoFile: file, logoName: file?.name || "" });
            }}
          />
        </RegistrationField>
        <RegistrationField label="Banner image optional">
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
