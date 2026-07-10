// These values must be reviewed and completed by a qualified lawyer before public launch.
export const legalConfig = {
  platformName: "KunThai",
  legalBusinessName: "[LEGAL BUSINESS NAME]",
  supportEmail: "[SUPPORT EMAIL]",
  privacyEmail: "[PRIVACY EMAIL]",
  copyrightEmail: "[COPYRIGHT EMAIL]",
  lawEnforcementEmail: "[LAW ENFORCEMENT EMAIL]",
  registeredAddress: "[REGISTERED ADDRESS]",
  governingLaw: "[GOVERNING LAW]",
  disputeJurisdiction: "[DISPUTE JURISDICTION]",
  minimumAge: 13,
  policyVersion: "1.0",
  effectiveDate: "[EFFECTIVE DATE]",
  lastUpdated: "[LAST UPDATED DATE]",
  deletionProcessingTimeframe: "[ACCOUNT DELETION TIMEFRAME]",
};

export function isResolvedLegalValue(value) {
  return Boolean(value && !String(value).startsWith("["));
}
