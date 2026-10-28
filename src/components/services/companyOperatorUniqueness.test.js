import assert from "node:assert/strict";
import test from "node:test";

import {
  findFleetWithOperator,
  findOpenInviteForOperator,
  findOperatorOnSeveralFleets,
  isOpenOperatorInvite,
  isSameOperator,
} from "./companyOperatorUniqueness.js";

const now = Date.parse("2026-10-27T12:00:00Z");
const recent = "2026-10-20T12:00:00Z";

test("the same person matches by user, operator or KunThai ID (row or form shape)", () => {
  assert.ok(isSameOperator({ operator_user_id: "u1" }, { userId: "u1" }));
  assert.ok(isSameOperator({ operator_id: "o1" }, { operatorId: "o1" }));
  assert.ok(isSameOperator({ operator_public_id: "KTU-AB12-3456" }, { publicId: "ktu ab12 3456" }));
  assert.ok(!isSameOperator({ operator_user_id: "u1" }, { userId: "u2" }));
  assert.ok(!isSameOperator({}, {}));
});

test("only pending (not expired) and accepted invitations hold a place", () => {
  assert.ok(isOpenOperatorInvite({ status: "accepted", created_at: "2025-01-01" }, now));
  assert.ok(isOpenOperatorInvite({ status: "pending", created_at: recent }, now));
  assert.ok(!isOpenOperatorInvite({ status: "pending", created_at: "2026-08-01T00:00:00Z" }, now));
  for (const status of ["rejected", "revoked", "cancelled"]) {
    assert.ok(!isOpenOperatorInvite({ status, created_at: recent }, now), status);
  }
});

test("a company cannot invite an operator it already has, on any vehicle", () => {
  const invites = [
    { id: "a", company_fleet_id: "f1", operator_user_id: "u1", status: "accepted", created_at: recent },
    { id: "b", company_fleet_id: "f2", operator_user_id: "u2", status: "revoked", created_at: recent },
  ];
  assert.equal(findOpenInviteForOperator(invites, { operator_user_id: "u1" }, now)?.id, "a");
  // A revoked operator can be invited again.
  assert.equal(findOpenInviteForOperator(invites, { operator_user_id: "u2" }, now), null);
  assert.equal(findOpenInviteForOperator(invites, { operator_user_id: "u3" }, now), null);
});

test("registration: one operator is never on two vehicles", () => {
  const fleets = [
    { localId: "f1", fleetName: "Taxi 1", operators: [{ userId: "u1", publicId: "KTU-1", status: "pending", createdAt: recent }] },
    { localId: "f2", fleetName: "Taxi 2", operators: [] },
  ];
  assert.equal(findFleetWithOperator(fleets, { userId: "u1" }, "f2", now)?.localId, "f1");
  assert.equal(findFleetWithOperator(fleets, { userId: "u1" }, "f1", now), null);
  assert.equal(findOperatorOnSeveralFleets(fleets, { now }), null);

  fleets[1].operators.push({ publicId: "ktu-1", status: "pending", createdAt: recent });
  const repeated = findOperatorOnSeveralFleets(fleets, { now });
  assert.deepEqual(repeated.fleets.map((fleet) => fleet.localId), ["f1", "f2"]);

  // Older duplicates (both already saved) do not block saving other changes.
  fleets[0].operators[0].id = "11111111-1111-1111-1111-111111111111";
  fleets[1].operators[0].id = "22222222-2222-2222-2222-222222222222";
  assert.equal(findOperatorOnSeveralFleets(fleets, { now, counts: (a, b) => !a.id || !b.id }), null);
});
