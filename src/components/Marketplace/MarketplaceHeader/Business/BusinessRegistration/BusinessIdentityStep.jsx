import CategorySelector from "./CategorySelector";
import RegistrationField from "./RegistrationField";
import RegistrationInput from "./RegistrationInput";
import { Building2, Hotel, House, Store, UtensilsCrossed } from "lucide-react";

const KIND_ICONS = {
  retail: Store,
  restaurant: UtensilsCrossed,
  hotel: Hotel,
  property_agent: House,
};

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
        <div className="grid gap-3 sm:grid-cols-2">
          {businessKinds.map((kind) => {
            const Icon = KIND_ICONS[kind.id] || Building2;
            const active = form.identity.businessKind === kind.id;
            return (
              <button
                key={kind.id}
                type="button"
                aria-pressed={active}
                onClick={() => updateSection("identity", { businessKind: kind.id })}
                className={`rounded-2xl border p-4 text-left transition ${active ? "border-blue-600 bg-blue-50 ring-2 ring-blue-100" : "border-gray-200 bg-white hover:border-blue-200"}`}
              >
                <span className={`grid h-10 w-10 place-items-center rounded-xl ${active ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600"}`}><Icon size={19} /></span>
                <p className="mt-3 text-sm font-black text-gray-950">{kind.label}</p>
                <p className="mt-1 text-xs font-semibold leading-5 text-gray-500">{kind.description}</p>
              </button>
            );
          })}
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
