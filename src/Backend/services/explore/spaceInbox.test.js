import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { describeSpaceActivity, normalizeSpaceActivityRow } from "./spaceActivityModel.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const exploreSource = read("../../../components/Explore/Explore.jsx");
const hookSource = read("../../hooks/useExploreMessages.js");
const serviceSource = read("./messageService.js");
const screenSource = read("../../../components/Explore/SocialMenu/messages/ConversationScreen.jsx");
const migrationSource = read("../../../../supabase/migrations/20261001120000_space_inbox_and_store_search.sql");

test("messaging a Space never turns into a direct chat with the Space owner", () => {
  // The old bug: startChat swapped a Space recipient for its owner's user id.
  assert.doesNotMatch(exploreSource, /userId:\s*recipient\.ownerUserId\s*\|\|/);
  assert.match(exploreSource, /recipientSpaceId/);
  assert.match(hookSource, /startExploreSpaceConversation\(currentProfile, \{ \.\.\.initialRecipient, spaceId: recipientSpaceId \}\)/);
  assert.match(serviceSource, /get_or_create_explore_space_conversation/);
});

test("acting as a Space, Messages is the Space's shared inbox", () => {
  assert.match(hookSource, /fetchExploreSpaceConversations\(spaceId, currentUserId\)/);
  assert.match(exploreSource, /key=\{`\$\{currentUserId\}:\$\{activeSpaceProfile\?\.spaceId \|\| "personal"\}`\}/);
  // Team replies are "ours"; the customer is the other side.
  assert.match(screenSource, /message\.senderId !== conversation\.customerId/);
  // Opening a thread marks only the customer's messages read.
  assert.match(hookSource, /fromSenderId: conversation\.customerId/);
});

test("the database lets every team member who can reply read and answer Space threads", () => {
  assert.match(migrationSource, /create or replace function public\.explore_is_conversation_member/);
  assert.match(migrationSource, /conversation\.space_id is not null\s+and public\.explore_space_can_reply_messages\(conversation\.space_id, user_uuid\)/);
  // Removed/pending members never qualify; only active ones.
  assert.match(migrationSource, /member\.status = 'active'/);
  // Team replies are stamped with the Space identity server-side.
  assert.match(migrationSource, /before insert on public\.explore_messages/);
});

test("Space activity counts and summaries", () => {
  const activity = normalizeSpaceActivityRow({ space_id: "s1", reactions: 3, comments: 1, shares: 0, follows: "2", other_activity: null, unread_messages: 4 });
  assert.equal(activity.spaceId, "s1");
  assert.equal(activity.total, 10);
  assert.equal(activity.messages, 4);
  assert.equal(
    describeSpaceActivity(activity, (text, vars) => text.replace("{value0}", vars?.value0 ?? "")),
    "4 new messages · 1 comment · 3 likes · 2 new connections",
  );
  assert.equal(describeSpaceActivity(normalizeSpaceActivityRow({})), "");
  assert.equal(normalizeSpaceActivityRow({ reactions: -5, comments: "x" }).total, 0);
});
