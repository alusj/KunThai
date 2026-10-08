import { t } from "../../../i18n";

// The many stored verification statuses ("pending_review", "approved", …)
// shown as one translated word, never the raw database value.
const STATUS_KEYS = {
  recommended: "sellerFix.verifyRecommended",
  verified_recommended: "sellerFix.verifyRecommended",
  verified: "sellerFix.verifyVerified",
  approved: "sellerFix.verifyVerified",
  submitted: "sellerFix.verifyPending",
  pending: "sellerFix.verifyPending",
  verification_pending: "sellerFix.verifyPending",
  under_review: "sellerFix.verifyPending",
  pending_review: "sellerFix.verifyPending",
  in_review: "sellerFix.verifyPending",
  rejected: "sellerFix.verifyRejected",
  declined: "sellerFix.verifyRejected",
  not_verified: "sellerFix.verifyNotVerified",
  unverified: "sellerFix.verifyNotVerified",
};

export function verificationStatusLabel(status) {
  const value = String(status || "pending").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return t(STATUS_KEYS[value] || "sellerFix.verifyPending");
}
