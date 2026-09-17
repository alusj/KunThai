import assert from "node:assert/strict";
import test from "node:test";

import {
  DISCUSSION_SUMMARY_MIN_COMMENTS,
  collectDiscussionComments,
  composerMediaKind,
  fallbackKeywords,
  isNaturalLanguageQuery,
  isTranslatableText,
  mergeHashtagsIntoText,
  normalizeSearchIntent,
  rankPostsForIntent,
  scorePostForIntent,
  shouldOfferDiscussionSummary,
} from "./exploreAiModels.js";

test("AI search is only offered for phrases, never for quick lookups", () => {
  assert.equal(isNaturalLanguageQuery("fish"), false);
  assert.equal(isNaturalLanguageQuery("@amara"), false);
  assert.equal(isNaturalLanguageQuery("#salone food ideas today"), false);
  assert.equal(isNaturalLanguageQuery("fresh fish"), false);
  assert.equal(isNaturalLanguageQuery("videos of people cooking rice"), true);
});

test("a broken or empty intent falls back to the person's own words", () => {
  const intent = normalizeSearchIntent(null, "show me videos about cassava leaves");
  assert.deepEqual(intent.keywords, ["cassava", "leaves"]);
  assert.equal(intent.filter, "all");
  assert.equal(intent.useInterests, false);
  assert.deepEqual(fallbackKeywords("find the best posts for me"), ["best"]);
});

test("intent normalisation rejects unknown filters and caps every list", () => {
  const intent = normalizeSearchIntent(
    { keywords: ["a", "one", "two", "three", "four", "five"], hashtags: ["#A1", "b2", "c3", "d4"], topicSlugs: ["x", "y", "z"], filter: "admin", useInterests: 1 },
    "anything",
  );
  assert.deepEqual(intent.keywords, ["one", "two", "three", "four"]);
  assert.deepEqual(intent.hashtags, ["a1", "b2", "c3"]);
  assert.deepEqual(intent.topicSlugs, ["x", "y"]);
  assert.equal(intent.filter, "all");
  assert.equal(intent.useInterests, false);
});

const POSTS = [
  { id: "1", body: "Jollof rice for lunch", hashtags: ["food"], primary_topic_slug: "food-cooking" },
  { id: "2", body: "Match day! #football", primary_topic_slug: "football" },
  { id: "3", body: "Cassava leaves stew recipe #cooking", primary_topic_slug: "food-cooking" },
  { id: "4", body: "Unrelated thought about traffic" },
];

test("posts are ranked by how many AI terms they actually match", () => {
  const intent = normalizeSearchIntent({ keywords: ["cassava leaves", "stew"], hashtags: ["cooking"], topicSlugs: ["food-cooking"] });
  const ranked = rankPostsForIntent(POSTS, intent);
  assert.deepEqual(ranked.map((post) => post.id), ["3", "1"]);
  // Posts with no matching term never appear, however the model phrased it.
  assert.equal(scorePostForIntent(POSTS[3], intent), 0);
});

test("interests only reorder matching posts, and only when asked for", () => {
  const intent = normalizeSearchIntent({ keywords: ["day", "rice"] });
  assert.deepEqual(rankPostsForIntent(POSTS, intent, ["football"]).map((post) => post.id), ["1", "2"]);

  const personal = { ...intent, useInterests: true };
  assert.deepEqual(rankPostsForIntent(POSTS, personal, ["football"]).map((post) => post.id), ["2", "1"]);
  // An interest never pulls in a post that matched nothing.
  assert.equal(scorePostForIntent(POSTS[3], personal, ["traffic"]), 0);
});

test("AI hashtags are appended once, keeping what the person already wrote", () => {
  assert.equal(mergeHashtagsIntoText("Fresh fish #Fish", ["fish", "Makeni", "#salone", "makeni"]), "Fresh fish #Fish #Makeni #salone ");
  assert.equal(mergeHashtagsIntoText("", ["food"]), "#food ");
  assert.equal(mergeHashtagsIntoText("Only #food", ["FOOD"]), "Only #food");
});

test("caption wording follows the attachment actually in the composer", () => {
  assert.equal(composerMediaKind({ imagePreview: "data:image/jpeg;base64,x" }), "image");
  assert.equal(composerMediaKind({ imagePreview: "x", pendingVideoFile: {} }), "video");
  assert.equal(composerMediaKind({ audioPreview: "x" }), "voice");
  assert.equal(composerMediaKind({}), "text");
});

test("discussion summaries read threaded text comments only, oldest first, without names", () => {
  const thread = [
    { body: "First", author_name: "Amara", replies: [{ body: "Reply to first" }, { body: "", audio_url: "voice.webm" }] },
    { body: "Still sending", pending: true },
    { body: "Second" },
  ];
  assert.deepEqual(collectDiscussionComments(thread), ["First", "Reply to first", "Second"]);
  assert.equal(collectDiscussionComments(Array.from({ length: 60 }, () => ({ body: "hi" }))).length, 40);
});

test("a summary is offered only once a thread is long enough to need one", () => {
  const short = Array.from({ length: DISCUSSION_SUMMARY_MIN_COMMENTS - 1 }, () => ({ body: "ok" }));
  assert.equal(shouldOfferDiscussionSummary(short), false);
  assert.equal(shouldOfferDiscussionSummary([...short, { body: "one more" }]), true);
  // Voice-only comments do not count towards the threshold.
  assert.equal(shouldOfferDiscussionSummary([...short, { audio_url: "voice.webm" }]), false);
});

test("translation is not offered for tags, mentions or single words", () => {
  assert.equal(isTranslatableText("🔥"), false);
  assert.equal(isTranslatableText("#salone @amara"), false);
  assert.equal(isTranslatableText("Amazing"), false);
  assert.equal(isTranslatableText("Na so e dey be"), true);
});
