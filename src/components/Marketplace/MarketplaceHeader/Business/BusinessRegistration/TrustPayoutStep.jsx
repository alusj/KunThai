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
      <section className="rounded-xl border border-blue-100 bg-blue-50 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-black text-blue-950">Verification documents</p>
            <p className="mt-1 text-sm font-semibold leading-6 text-blue-800">
              Upload clear documents from a known government organization when you have them. You can still submit this UrMall business without documents, but the seller profile will show Not verified until the documents are added and approved.
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
