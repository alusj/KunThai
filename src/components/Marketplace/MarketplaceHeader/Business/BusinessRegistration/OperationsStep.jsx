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
      <RegistrationField label="Business type">
        <select
          value={form.operations.businessType}
          onChange={(event) => updateSection("operations", { businessType: event.target.value })}
          className="h-12 w-full rounded-xl border border-gray-300 bg-white px-4 text-sm font-bold text-gray-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
        >
          {BUSINESS_TYPES.map((type) => (
            <option key={type.id} value={type.id}>
              {type.label}
            </option>
          ))}
        </select>
      </RegistrationField>

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
