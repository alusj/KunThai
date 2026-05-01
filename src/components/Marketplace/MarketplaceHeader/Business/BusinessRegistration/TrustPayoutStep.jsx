import RegistrationField from "./RegistrationField";
import RegistrationInput from "./RegistrationInput";
import ToggleRow from "./ToggleRow";

export default function TrustPayoutStep({ registration }) {
  const { form, updateSection, skipTrustPayout } = registration;

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-black text-emerald-900">Verified Seller Badge Preview</p>
            <p className="mt-1 text-sm font-medium text-emerald-700">
              Uploading trust documents can help buyers feel safer, but these are optional for now.
            </p>
          </div>
          <button
            type="button"
            onClick={skipTrustPayout}
            className="rounded-lg border border-emerald-200 bg-white px-4 py-2 text-sm font-black text-emerald-800 hover:bg-emerald-50"
          >
            Skip for now
          </button>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <RegistrationField label="Upload ID optional">
          <RegistrationInput
            type="file"
            onChange={(event) => {
              const file = event.target.files?.[0] || null;
              updateSection("trustPayout", { idDocumentFile: file, idDocumentName: file?.name || "" });
            }}
          />
        </RegistrationField>
        <RegistrationField label="Business document optional">
          <RegistrationInput
            type="file"
            onChange={(event) => {
              const file = event.target.files?.[0] || null;
              updateSection("trustPayout", { businessDocumentFile: file, businessDocumentName: file?.name || "" });
            }}
          />
        </RegistrationField>
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
