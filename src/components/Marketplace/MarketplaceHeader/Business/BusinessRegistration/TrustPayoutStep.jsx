import RegistrationField from "./RegistrationField";
import RegistrationInput from "./RegistrationInput";
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
            <p className="font-black text-blue-950">Seller verification</p>
            <p className="mt-1 text-sm font-semibold leading-6 text-blue-800">
              Upload clear identity or business documents when you have them. You can still submit this UrMall business without documents, but the seller profile will show Not verified until KunThai reviews and approves reliable documents.
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
    </div>
  );
}
