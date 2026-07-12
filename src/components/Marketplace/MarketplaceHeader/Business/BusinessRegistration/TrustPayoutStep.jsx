import RegistrationField from "./RegistrationField";
import RegistrationInput from "./RegistrationInput";
import ToggleRow from "./ToggleRow";
import {
  formatDocumentRequirementLabel,
  getUrMallDocumentRequirements,
} from "../../../../../data/globalDocumentRequirements";

export default function TrustPayoutStep({ registration }) {
  const { form, errors, updateSection } = registration;
  const documentRequirements = getUrMallDocumentRequirements({
    country: form.location.country,
    countryCode: form.location.countryIso,
  });

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-black text-emerald-900">Verified Seller Badge Preview</p>
            <p className="mt-1 text-sm font-medium text-emerald-700">
              KunThai sends document fields that apply to this market privately to the admin verification queue.
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        {documentRequirements.map((requirement) => (
          <RegistrationField
            key={requirement.key}
            label={formatDocumentRequirementLabel(requirement)}
            error={errors[requirement.errorKey]}
          >
            <RegistrationInput
              type="file"
              onChange={(event) => {
                const file = event.target.files?.[0] || null;
                updateSection("trustPayout", {
                  [requirement.fileField]: file,
                  [requirement.nameField]: file?.name || "",
                });
              }}
            />
          </RegistrationField>
        ))}
      </div>

      <ToggleRow
        label="Connect KunThai Money"
        description="Recommended primary payout option for faster seller withdrawals."
        checked={form.trustPayout.connectKunThaiMoney}
        onChange={(checked) => updateSection("trustPayout", { connectKunThaiMoney: checked, skipped: false })}
      />

      {!form.trustPayout.connectKunThaiMoney ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <RegistrationField label="Bank name">
            <RegistrationInput
              value={form.trustPayout.bankName}
              onChange={(event) => updateSection("trustPayout", { bankName: event.target.value })}
              placeholder="Bank name"
            />
          </RegistrationField>
          <RegistrationField label="Account number">
            <RegistrationInput
              value={form.trustPayout.accountNumber}
              onChange={(event) => updateSection("trustPayout", { accountNumber: event.target.value })}
              placeholder="Account number"
            />
          </RegistrationField>
          <RegistrationField label="Account name">
            <RegistrationInput
              value={form.trustPayout.accountName}
              onChange={(event) => updateSection("trustPayout", { accountName: event.target.value })}
              placeholder="Account name"
            />
          </RegistrationField>
        </div>
      ) : null}
    </div>
  );
}
