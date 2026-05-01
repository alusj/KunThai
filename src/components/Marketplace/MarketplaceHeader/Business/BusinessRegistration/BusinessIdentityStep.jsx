import CategorySelector from "./CategorySelector";
import RegistrationField from "./RegistrationField";
import RegistrationInput from "./RegistrationInput";

export default function BusinessIdentityStep({ registration }) {
  const {
    form,
    errors,
    categories,
    updateSection,
    toggleCategory,
    updateOtherCategory,
    addOtherCategory,
  } = registration;

  return (
    <div className="space-y-5">
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
