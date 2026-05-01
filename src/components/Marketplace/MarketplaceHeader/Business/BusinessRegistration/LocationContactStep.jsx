import RegistrationField from "./RegistrationField";
import RegistrationInput from "./RegistrationInput";
import ToggleRow from "./ToggleRow";

export default function LocationContactStep({ registration }) {
  const { form, errors, locationStatus, updateSection, locateBusiness } = registration;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <RegistrationField label="Country" error={errors.country}>
          <RegistrationInput
            value={form.location.country}
            onChange={(event) => updateSection("location", { country: event.target.value })}
            placeholder="Sierra Leone"
            autoComplete="country-name"
          />
        </RegistrationField>
        <RegistrationField label="City" error={errors.city}>
          <RegistrationInput
            value={form.location.city}
            onChange={(event) => updateSection("location", { city: event.target.value })}
            placeholder="Freetown"
            autoComplete="address-level2"
          />
        </RegistrationField>
      </div>

      <RegistrationField label="Address">
        <RegistrationInput
          value={form.location.address}
          onChange={(event) => updateSection("location", { address: event.target.value })}
          placeholder="15 Siaka Stevens Street"
          autoComplete="street-address"
        />
      </RegistrationField>

      <button
        type="button"
        onClick={locateBusiness}
        className="rounded-lg bg-gray-900 px-4 py-3 text-sm font-black text-white transition hover:bg-gray-800"
      >
        Allow Us To Locate You
      </button>
      {locationStatus ? <p className="text-sm font-bold text-gray-600">{locationStatus}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <RegistrationField label="Phone number" error={errors.phone}>
          <RegistrationInput
            value={form.location.phone}
            onChange={(event) => updateSection("location", { phone: event.target.value })}
            placeholder="+232..."
            autoComplete="tel"
          />
        </RegistrationField>
        <RegistrationField label="Email" error={errors.email}>
          <RegistrationInput
            type="email"
            value={form.location.email}
            onChange={(event) => updateSection("location", { email: event.target.value })}
            placeholder="business@example.com"
            autoComplete="email"
          />
        </RegistrationField>
      </div>

      <ToggleRow
        label="Use WhatsApp for buyers"
        description="Let customers reach this business through WhatsApp."
        checked={form.location.whatsappEnabled}
        onChange={(checked) => updateSection("location", { whatsappEnabled: checked })}
      />
      {form.location.whatsappEnabled ? (
        <RegistrationField label="WhatsApp number">
          <RegistrationInput
            value={form.location.whatsapp}
            onChange={(event) => updateSection("location", { whatsapp: event.target.value })}
            placeholder="+232..."
          />
        </RegistrationField>
      ) : null}

      <ToggleRow
        label="Allow my business to be discoverable nearby"
        description="Show this store to nearby buyers in marketplace discovery."
        checked={form.location.discoverableNearby}
        onChange={(checked) => updateSection("location", { discoverableNearby: checked })}
      />
    </div>
  );
}
