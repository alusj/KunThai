import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMessageMediaPath,
  filterBlockedConversations,
  filterBlockedMessages,
  isBlockedMessageError,
  isPrivateMediaRef,
  locationMessageParts,
  mediaExtension,
  mergeMessagePages,
  messagePreviewParts,
  normalizeInboxRow,
  oldestMessageCursor,
  privateMediaPath,
  signedUrlIsFresh,
  toPrivateMediaRef,
} from "./messageInboxModels.js";

const CONVERSATION = "10000000-0000-4000-8000-000000000001";
const ME = "00000000-0000-4000-8000-0000000000a1";
const THEM = "00000000-0000-4000-8000-0000000000b2";

test("private media paths put the conversation, then the sender, first", () => {
  const path = buildMessageMediaPath({ conversationId: CONVERSATION, userId: ME, type: "audio", mimeType: "audio/webm;codecs=opus", stamp: "1-abc" });
  assert.equal(path, `${CONVERSATION}/${ME}/audio-1-abc.webm`);
  assert.equal(buildMessageMediaPath({ conversationId: "local__id", userId: ME }), "");
  assert.equal(mediaExtension("image/png"), "png");
  assert.equal(mediaExtension("", "video"), "mp4");
});

test("private media references round-trip and never match public URLs", () => {
  const ref = toPrivateMediaRef(`${CONVERSATION}/${ME}/image-1.jpg`);
  assert.ok(isPrivateMediaRef(ref));
  assert.equal(privateMediaPath(ref), `${CONVERSATION}/${ME}/image-1.jpg`);
  assert.equal(isPrivateMediaRef("https://x.supabase.co/storage/v1/object/public/explore-media/a.jpg"), false);
  assert.equal(privateMediaPath("data:image/png;base64,AAAA"), "");
});

test("signed URLs are renewed shortly before they expire", () => {
  const now = 1_000_000;
  assert.equal(signedUrlIsFresh({ url: "u", expiresAt: now + 60 * 60 * 1000 }, now), true);
  assert.equal(signedUrlIsFresh({ url: "u", expiresAt: now + 60 * 1000 }, now), false);
  assert.equal(signedUrlIsFresh(null, now), false);
});

test("blocked people's conversations and messages are hidden", () => {
  const direct = { id: "1", participantIds: [ME, THEM] };
  const space = { id: "2", spaceId: "s1", participantIds: [ME] };
  const inbox = { id: "3", spaceInbox: true, customerId: THEM, participantIds: [THEM] };
  const other = { id: "4", participantIds: [ME, "x"] };
  assert.deepEqual(filterBlockedConversations([direct, space, inbox, other], new Set([THEM]), ME).map((c) => c.id), ["2", "4"]);
  assert.deepEqual(filterBlockedConversations([direct, space], new Set(["space:s1"]), ME).map((c) => c.id), ["1"]);
  assert.deepEqual(filterBlockedConversations([direct], new Set([`profile:${THEM}`]), ME), []);
  const messages = [{ id: "a", senderId: ME }, { id: "b", senderId: THEM }];
  assert.deepEqual(filterBlockedMessages(messages, new Set([THEM]), ME).map((m) => m.id), ["a"]);
  assert.equal(filterBlockedMessages(messages, new Set(), ME).length, 2);
});

test("the server's block refusal is recognised", () => {
  assert.ok(isBlockedMessageError({ hint: "explore_blocked", message: "x" }));
  assert.ok(isBlockedMessageError(new Error("You can't message this account.")));
  assert.equal(isBlockedMessageError(new Error("Network down")), false);
});

test("inbox rows carry the last message and unread count", () => {
  const row = normalizeInboxRow({
    id: CONVERSATION,
    created_by: ME,
    participant_ids: [],
    member_ids: [ME, THEM],
    request: false,
    space_id: null,
    updated_at: "2026-10-09T10:00:00Z",
    last_message: { id: "m", conversation_id: CONVERSATION, sender_id: THEM, body: "hi", media_type: "text", metadata: "{\"a\":1}", read: false, created_at: "2026-10-09T10:00:00Z" },
    unread_count: "3",
  });
  assert.deepEqual(row.participantIds, [ME, THEM]);
  assert.equal(row.unreadCount, 3);
  assert.equal(row.lastMessage.body, "hi");
  assert.deepEqual(row.lastMessage.metadata, { a: 1 });
  assert.equal(normalizeInboxRow({ id: "x", last_message: null }).lastMessage, null);
});

test("older pages merge in order without duplicates", () => {
  const current = [{ id: "c", createdAt: "2026-01-03" }, { id: "d", createdAt: "2026-01-04" }];
  const older = [{ id: "a", createdAt: "2026-01-01" }, { id: "b", createdAt: "2026-01-02" }, { id: "c", createdAt: "2026-01-03" }];
  assert.deepEqual(mergeMessagePages(current, older).map((m) => m.id), ["a", "b", "c", "d"]);
  const uuidA = "20000000-0000-4000-8000-000000000001";
  assert.equal(oldestMessageCursor([{ id: "pending-1", pending: true, createdAt: "2025-01-01" }, { id: uuidA, createdAt: "2026-01-02" }]), "2026-01-02");
  assert.equal(oldestMessageCursor([]), "");
});

test("previews and location messages are rendered from keys", () => {
  assert.deepEqual(messagePreviewParts({ type: "image", body: "" }), { key: "previewPhoto" });
  assert.deepEqual(messagePreviewParts({ type: "audio" }), { key: "previewVoiceNote" });
  assert.deepEqual(messagePreviewParts({ type: "text", body: "hello" }), { text: "hello" });
  assert.deepEqual(messagePreviewParts({ type: "location_request", body: "Ama is requesting your location." }), { key: "previewLocationRequest" });
  assert.deepEqual(locationMessageParts({ metadata: { textKey: "locationRequest", requesterName: "Ama" } }), { key: "locationRequestBody", vars: { name: "Ama" } });
  assert.deepEqual(
    locationMessageParts({ metadata: { textKey: "locationShare", address: "Market", coordinatesLabel: "1, 2" } }),
    { key: "sharedLocationWithCoordinates", vars: { label: "Market", coordinates: "1, 2" } },
  );
  assert.equal(locationMessageParts({ body: "old message" }), null);
});

import { acceptsInstantDelivery, locationRequestAnswers } from "./messageInboxModels.js";

test("an instant copy is shown only from the other person in a known direct thread", () => {
  const conversations = [{ id: "c1", participantIds: ["me", "jay"] }, { id: "s1", spaceId: "space", participantIds: ["me", "jay"] }];
  const row = { id: "m1", conversation_id: "c1", sender_id: "jay", body: "Hi" };
  assert.equal(acceptsInstantDelivery(row, conversations, "me"), true);
  assert.equal(acceptsInstantDelivery({ ...row, sender_id: "me" }, conversations, "me"), false);
  assert.equal(acceptsInstantDelivery({ ...row, sender_id: "stranger" }, conversations, "me"), false);
  assert.equal(acceptsInstantDelivery({ ...row, conversation_id: "unknown" }, conversations, "me"), false);
  assert.equal(acceptsInstantDelivery({ ...row, conversation_id: "s1" }, conversations, "me"), false);
  assert.equal(acceptsInstantDelivery({ ...row, media_url: "x" }, conversations, "me"), false);
  assert.equal(acceptsInstantDelivery(row, conversations, "me", new Set(["jay"])), false);
});

test("a location request shows the answer that names it", () => {
  const answers = locationRequestAnswers([
    { id: "r1", type: "location_request" },
    { id: "a1", type: "location_share", metadata: { respondsTo: "r1" } },
    { id: "d1", type: "text", metadata: { textKey: "locationDeclined", respondsTo: "r2" } },
    { id: "x1", type: "text", metadata: { respondsTo: "r3" }, deletedAt: "now" },
  ]);
  assert.deepEqual(answers, { r1: "approved", r2: "declined" });
});
