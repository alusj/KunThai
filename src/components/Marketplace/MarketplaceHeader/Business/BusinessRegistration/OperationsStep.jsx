import RegistrationField from "./RegistrationField";
import RegistrationInput from "./RegistrationInput";
import ToggleRow from "./ToggleRow";

const BUSINESS_TYPES = [
  { id: "physical", label: "Physical Store" },
  { id: "online", label: "Online" },
  { id: "both", label: "Both" },
];

export default function OperationsStep({ registration }) {
  const { form, errors, updateSection } = registration;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-black text-gray-800">Business type</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          {BUSINESS_TYPES.map((type) => {
            const active = form.operations.businessType === type.id;
            return (
              <button
                key={type.id}
                type="button"
                onClick={() => updateSection("operations", { businessType: type.id })}
                className={`rounded-lg border p-4 text-left font-black ${
                  active ? "border-blue-600 bg-blue-50 text-blue-800" : "border-gray-200 bg-white text-gray-700"
                }`}
              >
                {type.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <ToggleRow
          label="Delivery option"
          checked={form.operations.deliveryEnabled}
          onChange={(checked) => updateSection("operations", { deliveryEnabled: checked })}
        />
        <ToggleRow
          label="Pickup option"
          checked={form.operations.pickupEnabled}
          onChange={(checked) => updateSection("operations", { pickupEnabled: checked })}
        />
      </div>
      {errors.fulfillment ? <p className="text-xs font-bold text-red-600">{errors.fulfillment}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <RegistrationField label="Opening time">
          <RegistrationInput
            type="time"
            value={form.operations.openTime}
            onChange={(event) => updateSection("operations", { openTime: event.target.value })}
          />
        </RegistrationField>
        <RegistrationField label="Closing time">
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
