import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(relativeUrl) {
  return readFileSync(new URL(relativeUrl, import.meta.url), "utf8");
}

const inviteSql = read("../../../supabase/migrations/20260813100000_visibility_invite_dashboard_reward_notifications.sql");
const hardeningSql = read("../../../supabase/migrations/20260717093000_visibility_credit_hardening.sql");
const appSource = read("../../App.jsx");
const authSource = read("./authService.js");
const onboardingSource = read("./onboardingService.js");
const visibilitySource = read("./visibilityCreditService.js");
const notificationHostSource = read("../../components/shared/NotificationBannerHost.jsx");
const exploreNotificationsSource = read("../hooks/useExploreNotifications.js");

test("invite codes survive every supported account-creation method", () => {
  assert.equal((authSource.match(/visibility_invite_code:\s*getStoredVisibilityInviteCode\(\)/g) || []).length, 2);
  assert.match(onboardingSource, /\["google", "apple", "facebook"\]\.includes\(flow\.provider\)/);
  assert.match(onboardingSource, /visibility_invite_code:\s*inviteCode/);
  assert.match(onboardingSource, /getStoredVisibilityInviteCode\(\)/);
});

test("all same-origin social and commerce shares await a durable invite code", () => {
  const shareSources = [
    read("../../components/Explore/ExploreTabs/urfeed/feed/post/postUtils.js"),
    read("../../components/Explore/SocialMenu/profile/ProfileScreen.jsx"),
    read("../../components/Explore/SocialMenu/spaces/SpaceDashboardScreen.jsx"),
    read("../../components/Marketplace/Browse/SellerProfileDrawer.jsx"),
    read("../../components/Marketplace/MarketplaceHeader/Cart/CartItem.jsx"),
    read("../../components/Marketplace/MarketplaceHeader/Business/VerticalSellerDashboard.jsx"),
    read("../hooks/useSellerProducts.js"),
  ];

  for (const source of shareSources) {
    assert.match(source, /await decorateShareUrl\(/);
  }

  assert.match(visibilitySource, /searchParams\.set\(CREDIT_SHARE_PARAM, code\)/);
  assert.match(visibilitySource, /export async function decorateShareUrl\(url\)/);
});

test("a referral is credited only after verification and one of the three dashboard landings", () => {
  assert.match(inviteSql, /email_confirmed_at is not null\s+or v_invited_user\.phone_confirmed_at is not null/);
  assert.match(inviteSql, /if not v_onboarded or v_landing_surface not in \('explore', 'marketplace', 'transport'\)/);
  assert.match(inviteSql, /create trigger visibility_invite_confirmation/);
  assert.match(inviteSql, /after insert or update of email_confirmed_at, phone_confirmed_at, raw_user_meta_data on auth\.users/);
  assert.match(appSource, /if \(!userId \|\| guestSession \|\| !onboardingComplete\) return;[\s\S]*finalizeStoredVisibilityInvite\(userId\)/);
  assert.match(hardeningSql, /return public\.apply_visibility_invite\(auth\.uid\(\), p_code\)/);
});

test("the five-credit reward is atomic, idempotent, and notifies both accounts", () => {
  assert.match(inviteSql, /v_reward_credits constant integer := 5/);
  assert.match(inviteSql, /unique index if not exists platform_notifications_visibility_invite_event_uidx/);
  assert.match(inviteSql, /on conflict \(invited_user_id\) do update/);
  assert.match(inviteSql, /set balance = public\.visibility_credit_wallets\.balance \+ excluded\.balance/);
  assert.match(inviteSql, /'invite_reward'/);
  assert.match(inviteSql, /'visibility_credit_reward'/);
  assert.match(inviteSql, /'visibility_invite_success'/);
});

test("a realtime reward refreshes the inviter wallet even when no floating banner is shown", () => {
  const rewardRefresh = notificationHostSource.indexOf('row.notification_type === "visibility_credit_reward"');
  const presentationFilter = notificationHostSource.indexOf('!["floating", "urgent"].includes(row.presentation)');

  assert.ok(rewardRefresh > -1);
  assert.ok(presentationFilter > -1);
  assert.ok(rewardRefresh < presentationFilter);
  assert.match(notificationHostSource, /new CustomEvent\("kuntai-visibility-credits-updated"\)/);
});

test("both referral outcomes remain visible across dashboards and in the notification panel", () => {
  assert.match(notificationHostSource, /REFERRAL_NOTIFICATION_TYPES = new Set\(\["visibility_credit_reward", "visibility_invite_success"\]\)/);
  assert.match(notificationHostSource, /!referralNotification && !\["floating", "urgent"\]\.includes\(row\.presentation\)/);
  assert.match(exploreNotificationsSource, /\["visibility_credit_reward", "visibility_invite_success"\]\.includes\(item\.type\)\) return true/);
});
