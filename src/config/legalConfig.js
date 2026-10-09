// These values must be reviewed and completed by a qualified lawyer before public launch.
//
// The registered address, governing law and dispute jurisdiction are NOT
// guessed here: the owner sets them through build-time environment values
// (VITE_LEGAL_REGISTERED_ADDRESS, VITE_LEGAL_GOVERNING_LAW,
// VITE_LEGAL_DISPUTE_JURISDICTION). While a value is empty, every screen
// hides the line that would show it.
const env = (typeof import.meta !== "undefined" && import.meta.env) || {};

function configured(name) {
  return String(env[name] || "").trim();
}

export const legalConfig = {
  platformName: "KunThai",
  legalBusinessName: "KunThai",
  supportEmail: "support@kunthai.app",
  privacyEmail: "privacy@kunthai.app",
  copyrightEmail: "copyright@kunthai.app",
  lawEnforcementEmail: "legal@kunthai.app",
  registeredAddress: configured("VITE_LEGAL_REGISTERED_ADDRESS"),
  governingLaw: configured("VITE_LEGAL_GOVERNING_LAW"),
  disputeJurisdiction: configured("VITE_LEGAL_DISPUTE_JURISDICTION"),
  websiteUrl: "https://kunthai.app",
  deletionRequestUrl: "https://kunthai.app/policy-center/account-deletion",
  minimumAge: 13,
  policyVersion: "2.0",
  effectiveDate: "August 7, 2026",
  lastUpdated: "August 7, 2026",
  deletionProcessingTimeframe: "within 30 days after identity verification, unless a longer period is required or permitted by applicable law",
};

export function isResolvedLegalValue(value) {
  return Boolean(value && !String(value).startsWith("["));
}
