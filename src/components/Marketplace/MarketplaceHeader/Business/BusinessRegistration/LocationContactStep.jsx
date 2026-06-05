import RegistrationField from "./RegistrationField";
import RegistrationInput from "./RegistrationInput";
import ToggleRow from "./ToggleRow";
import {
  AddressAreaResolutionCard,
  AddressAreaStatusIcon,
  useAddressAreaValidation,
} from "../../../../shared/AddressAreaValidation";

export default function LocationContactStep({ registration }) {
  const {
    form,
    errors,
    locationCandidate,
    locationPromptOpen,
    locationStatus,
    locating,
    closeLocationPrompt,
    openCurrentLocationPicker,
    openDropPinPicker,
    updateSection,
    locateBusiness,
  } = registration;
  const locationPoint = form.location.coordinates
    ? {
        lat: form.location.coordinates.latitude ?? form.location.coordinates.lat,
        lng: form.location.coordinates.longitude ?? form.location.coordinates.lng,
        address: form.location.address,
      }
    : null;
  const addressValidation = useAddressAreaValidation(form.location.address, { selectedPoint: locationPoint });

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

      <RegistrationField
        label={(
          <span className="inline-flex items-center gap-2">
            Address
            <AddressAreaStatusIcon status={addressValidation.status} />
          </span>
        )}
      >
        <RegistrationInput
          value={form.location.address}
          onChange={(event) => updateSection("location", { address: event.target.value })}
          placeholder="15 Siaka Stevens Street"
          autoComplete="street-address"
        />
      </RegistrationField>

      <AddressAreaResolutionCard
        validation={addressValidation}
        onLocateMe={locateBusiness}
        onDropPin={openDropPinPicker}
        tone="blue"
      />

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={locateBusiness}
          className="rounded-lg bg-gray-900 px-4 py-3 text-sm font-black text-white transition hover:bg-gray-800"
        >
          Locate me
        </button>
        <button
          type="button"
          onClick={openDropPinPicker}
          className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm font-black text-gray-700 transition hover:bg-gray-50"
        >
          Drop a pin
        </button>
      </div>
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
          <section className="relative w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
            <button
              type="button"
              onClick={closeLocationPrompt}
              className="absolute left-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-lg font-black text-gray-700 hover:bg-gray-200"
              aria-label="Cancel location confirmation"
            >
              X
            </button>
            <div className="pl-12">
              <p className="text-lg font-black text-gray-950">Confirm business location</p>
              <p className="mt-2 text-sm font-semibold leading-6 text-gray-600">
                Be sure you are at the exact location where you want your business to be shown. You can use your current position or drop a pin manually if the address is hard to find.
              </p>
            </div>
            {locationCandidate || locating ? (
              <p className="mt-4 rounded-xl bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700">
                Preparing location tools...
              </p>
            ) : null}
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={openCurrentLocationPicker}
                className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white hover:bg-blue-700"
              >
                Yes, locate
              </button>
              <button
                type="button"
                onClick={openDropPinPicker}
                className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-black text-gray-700 hover:bg-gray-50"
              >
                No, drop a pin
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
