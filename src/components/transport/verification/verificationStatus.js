import { t } from "../../../i18n";

// Verification status metadata. Presentation text (label, shortText, detail,
// checks) is exposed through getters so it always reflects the active locale —
// consumers keep reading `config.label` etc. unchanged. `colorClass`,
// `panelClass`, and `actions` stay language-independent: `actions` holds stable
// identifiers that drive control flow in VerificationDetailsModal, so they must
// never be translated (the modal maps each id to a display label separately).
function makeStatus(base, keyRoot) {
  return {
    ...base,
    get label() {
      return t(`${keyRoot}.label`);
    },
    get shortText() {
      return t(`${keyRoot}.shortText`);
    },
    get detail() {
      return t(`${keyRoot}.detail`);
    },
    get checks() {
      return [t(`${keyRoot}.check1`), t(`${keyRoot}.check2`), t(`${keyRoot}.check3`)];
    },
  };
}

export const verificationStatuses = {
  notVerified: makeStatus(
    {
      colorClass: "border-red-200 bg-red-100 text-red-700",
      panelClass: "border-red-200 bg-red-50 text-red-900",
      actions: ["Choose verified operators", "View profile", "Report concern"],
    },
    "urride.verification.statuses.notVerified",
  ),
  pending: makeStatus(
    {
      colorClass: "border-amber-200 bg-amber-100 text-amber-800",
      panelClass: "border-amber-200 bg-amber-50 text-amber-950",
      actions: ["View profile", "Continue carefully", "Choose verified operators"],
    },
    "urride.verification.statuses.pending",
  ),
  verified: makeStatus(
    {
      colorClass: "border-blue-200 bg-blue-100 text-blue-700",
      panelClass: "border-blue-200 bg-blue-50 text-blue-950",
      actions: ["Book operator", "View profile"],
    },
    "urride.verification.statuses.verified",
  ),
  recommended: makeStatus(
    {
      colorClass: "border-green-200 bg-green-100 text-green-700",
      panelClass: "border-green-200 bg-green-50 text-green-950",
      actions: ["Book operator", "View profile"],
    },
    "urride.verification.statuses.recommended",
  ),
};
