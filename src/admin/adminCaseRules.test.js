import assert from "node:assert/strict";
import test from "node:test";

import {
  DECISION_REASONS,
  allowAllDecisionCapabilities,
  buildCaseSearchOrFilter,
  buildCaseSummary,
  classifyDecisionResult,
  dateTimeLocalToIso,
  fallbackDecisionCapabilities,
  fetchAllPages,
  filterMyWork,
  formatCaseOwner,
  getCaseOwner,
  isMissingRpcError,
  isSignedUrlStale,
  isoToDateTimeLocal,
  mergeCaseLists,
  normalizeDecisionCapabilities,
  resolveCaseSummary,
  sectorAuthorityLevel,
  sectorLaneCounts,
} from "./adminCaseRules.js";
import { availableEnforcementActions } from "./operationsConfig.js";

test("datetime-local values round-trip through UTC without shifting", () => {
  const local = "2026-10-08T14:30";
  const iso = dateTimeLocalToIso(local);
  assert.equal(iso, new Date(2026, 9, 8, 14, 30).toISOString());
  assert.equal(isoToDateTimeLocal(iso), local);
  assert.equal(dateTimeLocalToIso(""), null);
  assert.equal(dateTimeLocalToIso("not a date"), null);
  assert.equal(isoToDateTimeLocal(null), "");
  // Already-ISO values pass through unchanged.
  assert.equal(dateTimeLocalToIso("2026-10-08T12:00:00.000Z"), "2026-10-08T12:00:00.000Z");
});

test("case lists merge and de-duplicate by id, newest first", () => {
  const closed = [{ id: "a", status: "resolved", created_at: "2026-01-01" }, { id: "b", status: "closed", created_at: "2026-03-01" }];
  const open = [{ id: "c", status: "new", created_at: "2026-02-01" }, { id: "a", status: "reopened", created_at: "2026-01-01" }];
  const merged = mergeCaseLists(closed, open);
  assert.deepEqual(merged.map((item) => item.id), ["b", "c", "a"]);
  assert.equal(merged.find((item) => item.id === "a").status, "reopened");
});

test("open cases are paged until exhausted", async () => {
  const all = Array.from({ length: 2500 }, (_, index) => ({ id: String(index) }));
  const calls = [];
  const rows = await fetchAllPages(async (from, to) => { calls.push([from, to]); return all.slice(from, to + 1); }, { pageSize: 1000 });
  assert.equal(rows.length, 2500);
  assert.deepEqual(calls, [[0, 999], [1000, 1999], [2000, 2999]]);
});

test("My work shows the admin's own and unassigned cases only", () => {
  const cases = [{ id: 1, assignee_user_id: "me" }, { id: 2, assignee_user_id: null }, { id: 3, assignee_user_id: "someone" }];
  assert.deepEqual(filterMyWork(cases, "me").map((item) => item.id), [1, 2]);
  assert.deepEqual(filterMyWork(cases, "").map((item) => item.id), [2]);
});

test("sector lane counters and summaries count open cases only", () => {
  const cases = [
    { id: 1, sector: "explore", queue: "reports", status: "new", priority: "urgent" },
    { id: 2, sector: "explore", queue: "reports", status: "resolved" },
    { id: 3, sector: "explore", queue: "verification", status: "closed" },
    { id: 4, sector: "explore", queue: "support", status: "in_review" },
    { id: 5, sector: "transport", queue: "reports", status: "new" },
  ];
  assert.deepEqual(sectorLaneCounts(cases, "explore"), [2, 0, 1, 1]);
  const summary = buildCaseSummary(cases);
  assert.equal(summary.openCases, 3);
  assert.equal(summary.bySector.explore, 2);
});

test("server dashboard counts win over loaded-case counts unless a country filter is active", () => {
  const cases = [{ id: 1, sector: "explore", queue: "reports", status: "new" }];
  const server = { openCases: 900, urgentCases: 4, unassignedCases: 30, overdueCases: 2, resolvedToday: 7, bySector: { explore: 500 }, byQueue: { reports: 600 } };
  const resolved = resolveCaseSummary(server, cases);
  assert.equal(resolved.openCases, 900);
  assert.equal(resolved.bySector.explore, 500);
  assert.equal(resolved.resolvedToday, 7);
  const filtered = resolveCaseSummary(server, cases, { countryFiltered: true });
  assert.equal(filtered.openCases, 1);
  assert.equal(filtered.resolvedToday, 7);
  assert.equal(resolveCaseSummary({}, cases).openCases, 1);
});

test("server search filter escapes wildcards and or() syntax", () => {
  assert.equal(buildCaseSearchOrFilter(""), "");
  assert.equal(
    buildCaseSearchOrFilter("scam"),
    'title.ilike."%scam%",description.ilike."%scam%",metadata->owner->>name.ilike."%scam%",metadata->owner->>code.ilike."%scam%"',
  );
  const tricky = buildCaseSearchOrFilter('50% off, (fake) "deal"_x');
  assert.ok(tricky.startsWith('title.ilike."%50\\\\% off, (fake) \\"deal\\"\\\\_x%",description.ilike."%50\\\\% off, (fake) \\"deal\\"\\\\_x%",'));
  assert.ok(buildCaseSearchOrFilter("KT-000123").endsWith(",case_number.eq.123"));
  assert.doesNotMatch(buildCaseSearchOrFilter("KT-000123"), /owner->>code\.eq/, "a zero-padded number is a case number");
  // KT-51337 is how an operator's dashboard shows operator 51337.
  assert.match(buildCaseSearchOrFilter("KT-51337"), /metadata->owner->>code\.eq\.51337/);
  assert.match(buildCaseSearchOrFilter("51337"), /metadata->owner->>code\.ilike\."%51337%"/);
});

test("a case names the operator, company or business it is about", () => {
  const owner = { kind: "operator", id: "op-1", name: "Alusine Kamara", code: "51337" };
  const documentCase = { resource_type: "transport_document_verification", title: "Document Verification", metadata: { owner, source: { operator_id: "op-1" } } };
  assert.deepEqual(getCaseOwner(documentCase), owner);
  assert.equal(formatCaseOwner(documentCase), "Alusine Kamara · Operator 51337");
  assert.equal(formatCaseOwner({ metadata: { owner: { kind: "company", name: "KunThai TP", code: "KTC-1X9QXCK" } } }), "KunThai TP · Company KTC-1X9QXCK");
  assert.equal(formatCaseOwner({ metadata: { owner: { kind: "business", name: "Kallon Home", code: "UM-14288" } } }), "Kallon Home · Business UM-14288");
  // Older cases, or a deleted account: the name and code saved on the case.
  assert.equal(
    formatCaseOwner({ resource_type: "transport_operator_verification", resource_id: "op-2", metadata: { source: { full_name: "Alus Jay", operator_code: 27716 } } }),
    "Alus Jay · Operator 27716",
  );
  assert.equal(formatCaseOwner({ resource_type: "transport_document_verification", metadata: { source: { operator_id: "gone" } } }), "");
  assert.equal(getCaseOwner({ resource_type: "explore_post_report", metadata: { source: { full_name: "x" } } }), null);
  assert.equal(formatCaseOwner({}), "");
});

test("authority is taken per sector, capped by the staff level", () => {
  const access = {
    authorityLevel: 4,
    staff: { maxAuthority: 4 },
    roles: [
      { key: "marketplace_manager", sectors: ["marketplace"], authorityLevel: 5 },
      { key: "reports_officer", sectors: ["explore"], authorityLevel: 2 },
    ],
  };
  assert.equal(sectorAuthorityLevel(access, "marketplace"), 4);
  assert.equal(sectorAuthorityLevel(access, "explore"), 2);
  assert.equal(sectorAuthorityLevel(access, "transport"), 0);
  assert.equal(sectorAuthorityLevel({ ...access, authorityLevel: 0 }, "marketplace"), 0, "restricted staff have no authority anywhere");
  assert.equal(sectorAuthorityLevel({ authorityLevel: 3, roles: [] }, "explore"), 3, "falls back to the overall level");

  const enforcement = { permissions: ["transport.operators.enforce", "transport.operators.suspend", "marketplace.businesses.suspend"], ...access };
  assert.deepEqual(availableEnforcementActions(enforcement, "transport_operator"), [], "a UrMall manager gets no UrRide actions from their UrMall authority");
});

test("fallback decision capabilities mirror admin_apply_case_decision", () => {
  const officer = { permissions: ["cases.manage"], authorityLevel: 3, roles: [{ key: "reports_officer", sectors: ["explore"], authorityLevel: 2 }, { key: "verification_officer", sectors: ["marketplace"], authorityLevel: 3 }] };
  const explore = fallbackDecisionCapabilities(officer, { sector: "explore" }).decisions;
  assert.equal(explore.resolve.allowed, true);
  assert.equal(explore.approve.allowed, false);
  assert.equal(explore.approve.reason, DECISION_REASONS.authority);
  const marketplace = fallbackDecisionCapabilities(officer, { sector: "marketplace" }).decisions;
  assert.equal(marketplace.approve.allowed, true);
  assert.equal(marketplace.suspend.requiresApproval, true);
  const transport = fallbackDecisionCapabilities(officer, { sector: "transport" }).decisions;
  assert.equal(transport.resolve.allowed, false);
  const superAdmin = { permissions: ["cases.manage"], authorityLevel: 5, roles: [{ key: "super_admin", sectors: ["all"], authorityLevel: 5 }] };
  assert.equal(fallbackDecisionCapabilities(superAdmin, { sector: "explore" }).decisions.remove.requiresApproval, false);
  assert.ok(Object.values(allowAllDecisionCapabilities().decisions).every((entry) => entry.allowed));
});

test("server capabilities override the fallback; missing keys keep it", () => {
  const fallback = fallbackDecisionCapabilities({ permissions: ["cases.manage"], authorityLevel: 5, roles: [] }, { sector: "explore" });
  const result = normalizeDecisionCapabilities({ decisions: { approve: { allowed: false, requiresApproval: false, reason: "Blocked" } } }, fallback);
  assert.equal(result.source, "server");
  assert.deepEqual(result.decisions.approve, { allowed: false, requiresApproval: false, reason: "Blocked" });
  assert.equal(result.decisions.resolve.allowed, true);
  assert.equal(normalizeDecisionCapabilities(null, fallback).source, "fallback");
  // Shape returned by admin_case_decision_capabilities: a list with needsApproval.
  const listed = normalizeDecisionCapabilities({ decisions: [
    { key: "approve", allowed: true, needsApproval: false, reason: null },
    { key: "suspend", allowed: true, needsApproval: true, reason: null },
    { key: "remove", allowed: false, needsApproval: false, reason: "Restrict and Remove do not apply to verification cases." },
  ] }, fallback);
  assert.equal(listed.source, "server");
  assert.deepEqual(listed.decisions.suspend, { allowed: true, requiresApproval: true, reason: null });
  assert.equal(listed.decisions.remove.allowed, false);
  assert.equal(listed.decisions.remove.reason, "Restrict and Remove do not apply to verification cases.");
  assert.ok(isMissingRpcError({ code: "PGRST202" }));
  assert.ok(!isMissingRpcError({ code: "42501", message: "permission denied" }));
});

test("decision results are classified by what the server returned", () => {
  assert.equal(classifyDecisionResult({ id: "1", status: "approval_required" }, "suspend"), "approval");
  assert.equal(classifyDecisionResult({ id: "1", status: "resolved", resolution_code: "dismiss" }, "dismiss"), "applied");
  assert.equal(classifyDecisionResult({ id: "1", status: "waiting_information" }, "request_information"), "applied");
  assert.equal(classifyDecisionResult({ id: "1", status: "in_review" }, "resolve"), "unconfirmed");
  assert.equal(classifyDecisionResult(null, "resolve"), "unconfirmed");
});

test("signed evidence links are re-signed after 50 minutes", () => {
  const now = Date.now();
  assert.equal(isSignedUrlStale({ url: "https://x", bucket: "b", path: "p", signedAt: now - 10 * 60000 }, now), false);
  assert.equal(isSignedUrlStale({ url: "https://x", bucket: "b", path: "p", signedAt: now - 51 * 60000 }, now), true);
  assert.equal(isSignedUrlStale({ url: "https://public" }, now), false);
});

test("Approve & recommend is offered on operator, UrRide company and vehicle, and UrMall seller cases", () => {
  const superAdmin = { permissions: ["cases.manage"], authorityLevel: 5, roles: [{ key: "super_admin", sectors: ["all"], authorityLevel: 5 }] };
  const recommendable = ["transport_operator_verification", "transport_company_verification", "transport_fleet_verification", "marketplace_business_registration", "marketplace_verification"];
  recommendable.forEach((resourceType) => {
    assert.equal(fallbackDecisionCapabilities(superAdmin, { sector: "transport", resource_type: resourceType }).decisions.approve_recommend.allowed, true, resourceType);
  });
  const fleet = fallbackDecisionCapabilities(superAdmin, { sector: "transport", resource_type: "transport_solo_fleet_verification" }).decisions;
  assert.equal(fleet.approve.allowed, true);
  assert.equal(fleet.approve_recommend.allowed, false);
  assert.equal(fleet.approve_recommend.reason, DECISION_REASONS.notRecommendable);
  assert.equal(classifyDecisionResult({ id: "case", status: "resolved", resolution_code: "approve_recommend" }, "approve_recommend"), "applied");
});

test("the migration stores the owner the console reads", async () => {
  const { readFileSync } = await import("node:fs");
  const sql = readFileSync(new URL("../../supabase/migrations/20261028150000_admin_case_owner_codes.sql", import.meta.url), "utf8");
  for (const [kind, name, code] of [["operator", "operator.full_name", "operator.operator_code"], ["company", "company.company_name", "company.company_code"], ["business", "business.business_name", "business.public_business_id"]]) {
    assert.match(sql, new RegExp(`'kind', '${kind}', 'id', [a-z]+\\.id, 'name', ${name.replace(".", "\\.")}, 'code', ${code.replace(".", "\\.")}`), kind);
  }
  assert.match(sql, /create trigger admin_cases_attach_owner\s+before insert on public\.admin_cases/);
});
