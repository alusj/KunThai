export const verificationStatuses = {
  notVerified: {
    label: "Not Verified",
    shortText: "Not yet checked by KunThai",
    detail:
      "This operator is visible, but KunThai has not completed document or safety checks yet.",
    colorClass: "border-red-200 bg-red-100 text-red-700",
    panelClass: "border-red-200 bg-red-50 text-red-900",
    actions: ["Choose verified operators", "View profile", "Report concern"],
    checks: [
      "Identity not confirmed",
      "Fleet documents not approved",
      "Safety review not complete",
    ],
  },
  pending: {
    label: "Verification Pending",
    shortText: "Documents under review",
    detail:
      "This operator has started verification. Some documents or admin checks are still pending.",
    colorClass: "border-amber-200 bg-amber-100 text-amber-800",
    panelClass: "border-amber-200 bg-amber-50 text-amber-950",
    actions: ["View profile", "Continue carefully", "Choose verified operators"],
    checks: ["Documents submitted", "Admin review pending", "Safety score not final"],
  },
  verified: {
    label: "Verified",
    shortText: "Basic checks passed",
    detail:
      "KunThai has reviewed the required identity, license, and fleet documents for this operator.",
    colorClass: "border-blue-200 bg-blue-100 text-blue-700",
    panelClass: "border-blue-200 bg-blue-50 text-blue-950",
    actions: ["Book operator", "View profile"],
    checks: ["Identity checked", "License checked", "Fleet documents checked"],
  },
  recommended: {
    label: "Verified Recommended",
    shortText: "Fully checked and recommended",
    detail:
      "This operator completed required documents, safety questions, fleet photos, and admin review.",
    colorClass: "border-green-200 bg-green-100 text-green-700",
    panelClass: "border-green-200 bg-green-50 text-green-950",
    actions: ["Book operator", "View profile"],
    checks: ["All documents approved", "Safety questions completed", "Admin recommended"],
  },
};
