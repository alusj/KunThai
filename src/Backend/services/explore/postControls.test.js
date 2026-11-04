import assert from "node:assert/strict";
import test from "node:test";

import {
  countActiveControls,
  fillLiveReposts,
  hasAdvancedControls,
  isLiveRepost,
  normalizePostControls,
  postControlColumns,
  postControlErrorCode,
  postControlsOf,
  postInteractionRules,
} from "./postControls.js";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const OWNER = "33333333-3333-4333-8333-333333333333";

test("default controls add nothing to an ordinary post", () => {
  assert.deepEqual(postControlColumns(normalizePostControls()), {});
  assert.deepEqual(postControlColumns(null), {});
  assert.equal(hasAdvancedControls(normalizePostControls()), false);
});

test("controls become columns, with the exclusion hand-off", () => {
  const columns = postControlColumns({ likesDisabled: true, excludedAccounts: [{ id: A }, { id: A }, { id: "bad" }] });
  assert.equal(columns.likes_disabled, true);
  assert.equal(columns.comments_disabled, false);
  assert.deepEqual(columns.excluded_user_ids, [A]);
});

test("editing always writes every column, so switching a setting off sticks", () => {
  const columns = postControlColumns(normalizePostControls(), { always: true });
  assert.equal(columns.reposts_disabled, false);
  assert.deepEqual(columns.excluded_user_ids, []);
});

test("excluded accounts drop the owner, duplicates and private fields", () => {
  const controls = normalizePostControls(
    { excludedAccounts: [{ id: OWNER }, { user_id: B, display_name: "Bee", username: "@bee", email: "x@y.z" }, { id: B }] },
    { ownerId: OWNER },
  );
  assert.deepEqual(controls.excludedAccounts, [{ id: B, name: "Bee", username: "bee", avatarUrl: "", unavailable: false }]);
  assert.equal(countActiveControls(controls), 1);
});

test("flags are read from columns, or from the ranked feed's media_meta", () => {
  assert.equal(postControlsOf({ likes_disabled: true }).likesDisabled, true);
  assert.equal(postControlsOf({ media_meta: { postControls: { repostsDisabled: true } } }).repostsDisabled, true);
  // A column that is present wins over a stale copy in media_meta.
  assert.equal(postControlsOf({ reposts_disabled: false, media_meta: { postControls: { repostsDisabled: true } } }).repostsDisabled, false);
  // Posts from before this feature have none of them.
  assert.deepEqual(Object.values(postControlsOf({ id: "old" })).filter(Boolean), []);
});

test("precedence: owner first, then comments off over followers only", () => {
  const post = { comments_disabled: true, comments_followers_only: true, likes_disabled: true, like_count_hidden: true, reposts_disabled: true, comments_hidden: true };
  const owner = postInteractionRules(post, { isOwner: true });
  assert.equal(owner.canComment && owner.canLike && owner.canRepost && owner.showLikeCount && owner.showCommentCount, true);

  const viewer = postInteractionRules(post, { followsAuthor: true });
  assert.equal(viewer.commentBlock, "disabled");
  assert.equal(viewer.canLike, false);
  assert.equal(viewer.canRepost, false);
  assert.equal(viewer.showCommentCount, false);

  const stranger = postInteractionRules({ comments_followers_only: true }, { followsAuthor: false });
  assert.equal(stranger.commentBlock, "followers");
  const follower = postInteractionRules({ comments_followers_only: true }, { followsAuthor: true });
  assert.equal(follower.canComment, true);
});

test("hidden like count keeps liking but hides the number", () => {
  const rules = postInteractionRules({ like_count_hidden: true });
  assert.equal(rules.canLike, true);
  assert.equal(rules.showLikeCount, false);
});

test("database refusals are recognised", () => {
  assert.equal(postControlErrorCode({ message: "KT_COMMENTS_DISABLED" }), "KT_COMMENTS_DISABLED");
  assert.equal(postControlErrorCode({ message: "x", details: "KT_POST_UNAVAILABLE" }), "KT_POST_UNAVAILABLE");
  assert.equal(postControlErrorCode(new Error("Failed to fetch")), "");
});

test("live reposts fill from originals the viewer can read, others read unavailable", () => {
  const live = { id: "r1", media_meta: { repost: { sourcePostId: "p1", live: true } } };
  const copy = { id: "r2", media_meta: { repost: { sourcePostId: "p2", body: "copied" } } };
  assert.equal(isLiveRepost(live), true);
  assert.equal(isLiveRepost(copy), false);

  const [filled, untouched] = fillLiveReposts([live, copy], new Map([["p1", { id: "p1", user_id: A, author_name: "Ann", body: "hello", video_url: "v.mp4" }]]));
  assert.equal(filled.media_meta.repost.body, "hello");
  assert.equal(filled.media_meta.repost.sourceType, "swip");
  assert.equal(filled.media_meta.repost.unavailable, false);
  assert.equal(untouched, copy);

  const [hidden] = fillLiveReposts([live], new Map());
  assert.equal(hidden.media_meta.repost.unavailable, true);
  assert.equal(hidden.media_meta.repost.body, undefined);
});
