// What passengers see for an operator's verification (2026-10-31): the
// operator and the fleet they drive are verified separately, and the operator
// shows as verified only when both are. One verified without the other reads
// "Verification pending". When neither is verified the fleet's own status is
// shown, as before. A company fleet's status is its transport_company_fleets
// row (get_public_transport_fleet_contacts).

const VERIFIED = new Set(["verified", "verified_recommended", "recommended", "approved"]);
const RECOMMENDED = new Set(["verified_recommended", "recommended"]);

function clean(value) {
  return String(value || "").trim();
}

export function isVerifiedStatus(value) {
  return VERIFIED.has(clean(value));
}

// Raw statuses in, raw status out (the caller normalizes it for display).
export function passengerVerificationStatus(fleetStatus, operatorStatus) {
  const fleet = clean(fleetStatus);
  const operator = clean(operatorStatus);
  const fleetVerified = isVerifiedStatus(fleet);
  const operatorVerified = isVerifiedStatus(operator);
  if (fleetVerified && operatorVerified) {
    return RECOMMENDED.has(operator) || RECOMMENDED.has(fleet) ? "verified_recommended" : "verified";
  }
  if (fleetVerified || operatorVerified) return "verification_pending";
  return fleet || operator || "verification_pending";
}
