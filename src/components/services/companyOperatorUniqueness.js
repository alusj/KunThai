// A company adds an operator once: one open invitation (pending or accepted)
// per person per company, whichever vehicle it is for. Rejected, revoked,
// cancelled or expired invitations are history and never count. Pure helpers,
// shared by Fleet HQ, company registration and the company service.

export const OPEN_OPERATOR_INVITE_STATUSES = ["pending", "accepted", "accepted_pending_documents"];
const INVITE_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

function compactId(value = "") {
  return String(value || "").replace(/[^a-z0-9]/gi, "").toUpperCase();
}

// Invites come both as database rows (snake_case) and as normalized form
// entries (camelCase); read either.
function operatorKeys(entry = {}) {
  return {
    userId: String(entry.operator_user_id || entry.userId || ""),
    operatorId: String(entry.operator_id || entry.operatorId || ""),
    publicId: compactId(entry.operator_public_id || entry.publicId || entry.lookupValue || ""),
  };
}

export function isSameOperator(a = {}, b = {}) {
  const left = operatorKeys(a);
  const right = operatorKeys(b);
  return Boolean(
    (left.userId && left.userId === right.userId)
    || (left.operatorId && left.operatorId === right.operatorId)
    || (left.publicId && left.publicId === right.publicId),
  );
}

export function isOpenOperatorInvite(invite = {}, now = Date.now()) {
  const status = String(invite.status || "pending").toLowerCase();
  if (!OPEN_OPERATOR_INVITE_STATUSES.includes(status)) return false;
  if (status !== "pending") return true;
  const explicit = Date.parse(invite.expiresAt || invite.expires_at || "");
  const created = Date.parse(invite.createdAt || invite.created_at || "");
  const expiresAt = Number.isFinite(explicit) ? explicit : created + INVITE_EXPIRY_MS;
  return !Number.isFinite(expiresAt) || expiresAt > now;
}

// The open invitation this company already holds for the operator, if any.
export function findOpenInviteForOperator(invites = [], operator = {}, now = Date.now()) {
  return (invites || []).find((invite) => isOpenOperatorInvite(invite, now) && isSameOperator(invite, operator)) || null;
}

// In the registration form: the fleet (other than `exceptFleetId`) that already
// has this operator, so one person is never added to two of its vehicles.
export function findFleetWithOperator(fleets = [], operator = {}, exceptFleetId = "", now = Date.now()) {
  return (fleets || []).find((fleet) => {
    const fleetId = fleet.localId || fleet.id || fleet.fleetCode;
    if (exceptFleetId && fleetId === exceptFleetId) return false;
    return Boolean(findOpenInviteForOperator(fleet.operators || [], operator, now));
  }) || null;
}

// Before saving the whole registration: the first operator who sits on more
// than one vehicle, with the vehicles, or null. `counts(a, b)` can limit it to
// pairs that matter (e.g. one of them added in this edit, so a company with
// older duplicates can still save its other changes).
export function findOperatorOnSeveralFleets(fleets = [], { now = Date.now(), counts = () => true } = {}) {
  const seen = [];
  for (const fleet of fleets || []) {
    for (const invite of fleet.operators || []) {
      if (!isOpenOperatorInvite(invite, now)) continue;
      const earlier = seen.find((item) => item.fleet !== fleet && isSameOperator(item.invite, invite) && counts(item.invite, invite));
      if (earlier) return { operator: invite, fleets: [earlier.fleet, fleet] };
      seen.push({ invite, fleet });
    }
  }
  return null;
}

export class DuplicateCompanyOperatorError extends Error {
  constructor(message, { operatorName = "", fleetName = "" } = {}) {
    super(message);
    this.name = "DuplicateCompanyOperatorError";
    this.code = "duplicate_company_operator";
    this.operatorName = operatorName;
    this.fleetName = fleetName;
  }
}
