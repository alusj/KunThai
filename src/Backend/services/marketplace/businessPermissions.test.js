import assert from "node:assert/strict";
import test from "node:test";

import { getBusinessPermissions } from "./businessPermissions.js";

test("UrMall owners always manage plans and business settings", () => {
  const permissions = getBusinessPermissions({ role: "owner" });
  assert.equal(permissions.canManagePlans, true);
  assert.equal(permissions.canManageBusiness, true);
});

test("UrMall admins only manage plans when billing responsibility is delegated", () => {
  const regularAdmin = getBusinessPermissions({
    role: "admin",
    adminResponsibilities: { dashboardAccess: true, manageBilling: false },
  });
  const billingAdmin = getBusinessPermissions({
    role: "admin",
    adminResponsibilities: { dashboardAccess: false, manageBilling: true },
  });

  assert.equal(regularAdmin.canManagePlans, false);
  assert.equal(billingAdmin.canManagePlans, true);
  assert.equal(billingAdmin.canManageBusiness, false);
  assert.equal(billingAdmin.hasAnyAccess, true);
});

