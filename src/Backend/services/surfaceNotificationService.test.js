import assert from "node:assert/strict";
import test from "node:test";

import {
  isLegacyMisroutedExploreNotification,
  mapSurfacePlatformNotification,
  notificationBelongsToSurface,
} from "./surfaceNotificationModels.js";

test("platform notifications belong only to their service bell", () => {
  assert.equal(notificationBelongsToSurface({ sector: "marketplace" }, "marketplace"), true);
  assert.equal(notificationBelongsToSurface({ sector: "marketplace" }, "explore"), false);
  assert.equal(notificationBelongsToSurface({ sector: "transport" }, "transport"), true);
  assert.equal(notificationBelongsToSurface({ sector: "transport" }, "marketplace"), false);
  assert.equal(notificationBelongsToSurface({ sector: "explore" }, "explore"), true);
  assert.equal(notificationBelongsToSurface({ sector: "platform" }, "explore"), true);
  assert.equal(notificationBelongsToSurface({ sector: "all" }, "explore"), true);
});

test("legacy UrMall system notices are removed from Explore", () => {
  assert.equal(isLegacyMisroutedExploreNotification({ type: "system", message: "Open UrMall to respond." }), true);
  assert.equal(isLegacyMisroutedExploreNotification({ type: "comment", message: "A comment on UrFeed." }), false);
});

test("surface rows expose consistent routing and read state", () => {
  const mapped = mapSurfacePlatformNotification({
    id: "notice-1",
    sector: "marketplace",
    notification_type: "urmall_admin_invite",
    title: "Admin invitation",
    body: "Open Admin roles.",
    action_target: "urmall:admin-roles",
    status: "unread",
    created_at: "2026-09-03T00:00:00.000Z",
  });

  assert.equal(mapped.id, "platform:notice-1");
  assert.equal(mapped.source, "marketplace");
  assert.equal(mapped.actionTarget, "urmall:admin-roles");
  assert.equal(mapped.unread, true);
});
