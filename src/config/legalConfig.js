// These values must be reviewed and completed by a qualified lawyer before public launch.
export const legalConfig = {
  platformName: "KunThai",
  legalBusinessName: "KunThai",
  supportEmail: "support@kunthai.app",
  privacyEmail: "privacy@kunthai.app",
  copyrightEmail: "copyright@kunthai.app",
  lawEnforcementEmail: "legal@kunthai.app",
  registeredAddress: "[REGISTERED ADDRESS]",
  governingLaw: "[GOVERNING LAW]",
  disputeJurisdiction: "[DISPUTE JURISDICTION]",
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
