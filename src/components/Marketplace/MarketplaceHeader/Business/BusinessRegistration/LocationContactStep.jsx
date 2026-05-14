import RegistrationField from "./RegistrationField";
import RegistrationInput from "./RegistrationInput";
import ToggleRow from "./ToggleRow";

export default function LocationContactStep({ registration }) {
  const {
    form,
    errors,
    locationCandidate,
    locationPromptOpen,
    locationStatus,
    locating,
    acceptDetectedLocation,
    closeLocationPrompt,
    detectBusinessLocation,
    enterLocationManually,
    updateSection,
    locateBusiness,
  } = registration;

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
        <RegistrationField label="Business email" error={errors.email}>
          <RegistrationInput
            type="email"
            value={form.location.email}
            onChange={(event) => updateSection("location", { email: event.target.value })}
            placeholder="business@example.com"
            autoComplete="email"
          />
        </RegistrationField>
      </div>

      <RegistrationField label="Business website">
        <RegistrationInput
          type="url"
          value={form.location.website}
          onChange={(event) => updateSection("location", { website: event.target.value })}
          placeholder="https://yourbusiness.com"
          autoComplete="url"
        />
      </RegistrationField>

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
        description="Show this store to nearby buyers in UrMall discovery."
        checked={form.location.discoverableNearby}
        onChange={(checked) => updateSection("location", { discoverableNearby: checked })}
      />

      {locationPromptOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 py-5 sm:items-center">
          <section className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
            {!locationCandidate ? (
              <>
                <p className="text-lg font-black text-gray-950">Confirm business location</p>
                <p className="mt-2 text-sm font-semibold leading-6 text-gray-600">
                  Please be at the exact location you want customers to find before we detect your business location.
                </p>
                {locationStatus ? <p className="mt-4 rounded-xl bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700">{locationStatus}</p> : null}
                <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={closeLocationPrompt}
                    className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-black text-gray-700 hover:bg-gray-50"
                  >
                    Not now
                  </button>
                  <button
                    type="button"
                    onClick={detectBusinessLocation}
                    disabled={locating}
                    className="rounded-xl bg-gray-950 px-4 py-3 text-sm font-black text-white hover:bg-gray-800 disabled:opacity-60"
                  >
                    {locating ? "Locating..." : "Detect my location"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-lg font-black text-gray-950">Use this location?</p>
                <p className="mt-2 text-sm font-semibold leading-6 text-gray-600">Your current location is:</p>
                <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 p-4">
                  <p className="text-sm font-black leading-6 text-blue-900">{locationCandidate.address}</p>
                  <p className="mt-2 text-xs font-bold text-blue-700">
                    {locationCandidate.coordinates.latitude.toFixed(6)}, {locationCandidate.coordinates.longitude.toFixed(6)}
                  </p>
                </div>
                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={enterLocationManually}
                    className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-black text-gray-700 hover:bg-gray-50"
                  >
                    No, enter manually
                  </button>
                  <button
                    type="button"
                    onClick={acceptDetectedLocation}
                    className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white hover:bg-blue-700"
                  >
                    Yes, add location
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
