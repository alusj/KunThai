import assert from "node:assert/strict";
import test from "node:test";

import { AI_ERROR_CODES } from "../aiErrors.js";
import { cleanImageDataUrl } from "../aiInput.js";
import { buildContents } from "../aiClient.js";
import { getTask, listTasks, taskAllowsSurface } from "../aiTasks.js";
import { resultHasContent, tagsResult } from "../taskHelpers.js";
import { fitTitle } from "./exploreTasks.js";

const TOPICS = [
  { slug: "small-business", name: "Small business" },
  { slug: "football", name: "Football" },
];

// A real 1x1 PNG and JPEG header, so magic-byte checks are exercised.
const PNG_1PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

test("every Explore task is registered and restricted to Explore", () => {
  const ids = listTasks().map((task) => task.id);
  for (const id of [
    "explore.caption_generate",
    "explore.hashtags",
    "explore.title_suggest",
    "explore.topic_suggest",
    "explore.reply_suggest",
    "explore.discussion_summary",
    "explore.search_intent",
  ]) {
    assert.ok(ids.includes(id), `${id} is not registered`);
    const task = getTask(id);
    assert.equal(taskAllowsSurface(task, "explore"), true);
    assert.equal(taskAllowsSurface(task, "urmall"), false, `${id} must not run from UrMall`);
  }
});

test("Explore tasks default to the cheap tier except the discussion summary", () => {
  for (const id of ["explore.caption_generate", "explore.hashtags", "explore.title_suggest", "explore.topic_suggest", "explore.reply_suggest", "explore.search_intent"]) {
    assert.equal(getTask(id).tier, "fast", `${id} should use the fast tier`);
  }
  assert.equal(getTask("explore.discussion_summary").tier, "standard");
});

test("a caption needs a photo or some words, and never runs on nothing", () => {
  assert.throws(
    () => getTask("explore.caption_generate").build({}),
    (error) => error.code === AI_ERROR_CODES.invalidRequest,
  );
  const fromNotes = getTask("explore.caption_generate").build({ text: "fresh fish at makeni", mediaKind: "text" });
  assert.equal(fromNotes.media.length, 0);
  assert.match(fromNotes.prompt, /fresh fish at makeni/);
});

test("a caption photo travels as validated inline media, not inside the prompt text", () => {
  const built = getTask("explore.caption_generate").build({ image: `data:image/png;base64,${PNG_1PX}`, mediaKind: "image" });
  assert.equal(built.media.length, 1);
  assert.equal(built.media[0].mimeType, "image/png");
  assert.ok(!built.prompt.includes(PNG_1PX));

  const contents = buildContents(built.prompt, built.media);
  assert.equal(contents[0].parts[0].text, built.prompt);
  assert.equal(contents[0].parts[1].inlineData.mimeType, "image/png");
  // Text-only requests keep the plain string form.
  assert.equal(buildContents("hello", []), "hello");
});

test("images are checked by their bytes, not their declared type", () => {
  // Declared as PNG but the bytes are plain text.
  const fake = Buffer.from("not really an image at all").toString("base64");
  assert.equal(cleanImageDataUrl(`data:image/png;base64,${fake}`), null);
  // SVG and other types are refused outright.
  assert.equal(cleanImageDataUrl(`data:image/svg+xml;base64,${PNG_1PX}`), null);
  assert.equal(cleanImageDataUrl("https://example.com/photo.jpg"), null);
  // A caption request with an unreadable photo gets a clear message.
  assert.throws(
    () => getTask("explore.caption_generate").build({ image: `data:image/png;base64,${fake}` }),
    (error) => error.code === AI_ERROR_CODES.invalidRequest,
  );
});

test("oversized photos are refused before any model call", () => {
  const big = Buffer.alloc(500_000, 0);
  big[0] = 0xff;
  big[1] = 0xd8;
  assert.throws(
    () => cleanImageDataUrl(`data:image/jpeg;base64,${big.toString("base64")}`),
    (error) => error.code === AI_ERROR_CODES.payloadTooLarge,
  );
});

test("suggested hashtags are normalised, deduplicated, and skip ones already in the post", () => {
  const task = getTask("explore.hashtags");
  const result = task.parse(
    { hashtags: ["#FreshFish", "fresh fish", "freshfish", "Salone!", "#1", "x", "Makeni", "#Fish"] },
    { text: "Fresh fish today #fish" },
  );
  assert.equal(result.kind, "tags");
  assert.deepEqual(result.items, ["FreshFish", "Salone", "Makeni"]);
});

test("hashtags need a post to describe", () => {
  assert.throws(() => getTask("explore.hashtags").build({ text: "" }), (error) => error.code === AI_ERROR_CODES.invalidRequest);
});

test("suggested titles always fit the 30-character title field on a word boundary", () => {
  assert.equal(fitTitle("Fresh fish at Makeni market."), "Fresh fish at Makeni market");
  const long = fitTitle("Fresh fish delivered every single morning to your house");
  assert.ok(long.length <= 30);
  assert.ok(!long.endsWith(" "));
  assert.equal(long, "Fresh fish delivered every");

  const result = getTask("explore.title_suggest").parse({
    titles: ["Fresh fish delivered every single morning to your house", "Makeni fish", "Makeni fish"],
  });
  assert.equal(result.kind, "options");
  assert.ok(result.items.every((title) => title.length <= 30));
  assert.equal(result.items.length, 2);
});

test("a suggested topic is accepted only if the browser offered it", () => {
  const task = getTask("explore.topic_suggest");
  const good = task.parse({ slug: "small-business" }, { topics: TOPICS });
  assert.deepEqual(good, { kind: "topic", topic: { slug: "small-business", name: "Small business" } });

  // A plausible but unlisted slug is not trusted.
  const invented = task.parse({ slug: "fishing" }, { topics: TOPICS });
  assert.equal(invented.kind, "text");
  assert.equal(invented.topic, undefined);
  assert.equal(resultHasContent(invented), true);

  assert.throws(() => task.build({ text: "fresh fish" }), (error) => error.code === AI_ERROR_CODES.invalidRequest);
});

test("reply suggestions carry the replier's role and no identities", () => {
  const task = getTask("explore.reply_suggest");
  const author = task.build({ post: { body: "Fresh fish daily" }, comment: "Do you deliver to Kenema?", role: "author" });
  assert.match(author.prompt, /author of the post/);
  const viewer = task.build({ post: { body: "Fresh fish daily" }, comment: "Nice", role: "somebody-else" });
  assert.match(viewer.prompt, /not its author/);
  // Suggestions are personal and never shared through the cache.
  assert.equal(author.cacheKey, null);
  assert.ok(!/author_name|username/i.test(author.prompt));
  assert.throws(() => task.build({}), (error) => error.code === AI_ERROR_CODES.invalidRequest);
});

test("a discussion summary needs enough comments and caps what it sends", () => {
  const task = getTask("explore.discussion_summary");
  assert.throws(() => task.build({ comments: ["one", "two"] }), (error) => error.code === AI_ERROR_CODES.invalidRequest);
  const built = task.build({ comments: Array.from({ length: 90 }, (unused, index) => `comment ${index}`) });
  assert.match(built.prompt, /40\. comment 39/);
  assert.ok(!built.prompt.includes("comment 40"));
});

test("search intents are validated field by field", () => {
  const task = getTask("explore.search_intent");
  const result = task.parse(
    {
      keywords: ["Cooking", "cooking", "x", "cassava leaves", "rice", "stew", "extra"],
      hashtags: ["#CassavaLeaves", "food!"],
      topicSlugs: ["football", "invented-topic"],
      filter: "delete-everything",
      useInterests: "yes",
    },
    { topics: TOPICS },
  );
  assert.equal(result.kind, "search");
  assert.deepEqual(result.search.keywords, ["cooking", "cassava leaves", "rice", "stew"]);
  assert.deepEqual(result.search.hashtags, ["cassavaleaves", "food"]);
  assert.deepEqual(result.search.topicSlugs, ["football"]);
  assert.equal(result.search.filter, "all");
  // Only a real boolean true opts in to interests.
  assert.equal(result.search.useInterests, false);
});

test("search terms are cached per phrase regardless of letter case", () => {
  const task = getTask("explore.search_intent");
  const a = task.build({ query: "Cooking Videos In Freetown", topics: TOPICS });
  const b = task.build({ query: "cooking videos in freetown", topics: TOPICS });
  assert.deepEqual(a.cacheKey, b.cacheKey);
  assert.throws(() => task.build({ query: "a" }), (error) => error.code === AI_ERROR_CODES.invalidRequest);
});

test("empty results are recognised so the server never returns a blank answer", () => {
  assert.equal(resultHasContent({ kind: "tags", items: [] }), false);
  assert.equal(resultHasContent(tagsResult(["ok_tag"])), true);
  assert.equal(resultHasContent({ kind: "options", items: [] }), false);
  assert.equal(resultHasContent({ kind: "search", search: { keywords: [] } }), true);
  assert.equal(resultHasContent(null), false);
});
