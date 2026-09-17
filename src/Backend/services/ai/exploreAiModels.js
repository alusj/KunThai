// KAI — pure Explore helpers.
//
// No imports, no browser APIs: everything here is deterministic so it can be
// unit tested and reused by the search service and the Explore components.

const SEARCH_FILTERS = new Set(["all", "feed", "swip", "people", "hashtag"]);

const STOP_WORDS = new Set([
  "a", "an", "and", "any", "about", "are", "at", "be", "by", "can", "do", "find", "for", "from", "get", "give",
  "have", "i", "in", "is", "it", "like", "looking", "me", "might", "my", "near", "of", "on", "or", "please",
  "posts", "post", "see", "show", "some", "something", "that", "the", "their", "them", "there", "things",
  "this", "to", "videos", "video", "want", "what", "where", "who", "with", "you", "your",
]);

export function normalizeHashtag(value) {
  return String(value || "").trim().replace(/^#+/, "").replace(/[^a-zA-Z0-9_]/g, "").toLowerCase();
}

/**
 * Worth offering AI search? Short lookups ("fish", "@amara", "#salone") are
 * already served well by plain matching, so the AI option only appears for
 * phrases that read like a request. This also means no model call is ever
 * made for ordinary typing.
 */
export function isNaturalLanguageQuery(query) {
  const value = String(query || "").trim();
  if (value.length < 8 || /^[@#]/.test(value)) return false;
  return value.split(/\s+/).filter(Boolean).length >= 3;
}

/** Plain keyword extraction, used when the model returns nothing usable. */
export function fallbackKeywords(query, max = 4) {
  return Array.from(
    new Set(
      String(query || "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s#@_-]/gu, " ")
        .split(/\s+/)
        .map((word) => word.replace(/^[@#]+/, ""))
        .filter((word) => word.length >= 3 && !STOP_WORDS.has(word)),
    ),
  ).slice(0, max);
}

/**
 * Normalise a server search intent. Anything missing or malformed collapses to
 * a safe plain search built from the person's own words, so a model hiccup
 * degrades to ordinary search instead of an empty result list.
 */
export function normalizeSearchIntent(intent, query = "") {
  const source = intent && typeof intent === "object" ? intent : {};
  const keywords = Array.from(
    new Set((Array.isArray(source.keywords) ? source.keywords : []).map((item) => String(item || "").trim().toLowerCase()).filter((item) => item.length >= 2)),
  ).slice(0, 4);
  const hashtags = Array.from(new Set((Array.isArray(source.hashtags) ? source.hashtags : []).map(normalizeHashtag).filter((tag) => tag.length >= 2))).slice(0, 3);
  const topicSlugs = Array.from(new Set((Array.isArray(source.topicSlugs) ? source.topicSlugs : []).map((slug) => String(slug || "").trim()).filter(Boolean))).slice(0, 2);
  const filter = SEARCH_FILTERS.has(source.filter) ? source.filter : "all";

  return {
    keywords: keywords.length || hashtags.length || topicSlugs.length ? keywords : fallbackKeywords(query),
    hashtags,
    topicSlugs,
    filter,
    useInterests: source.useInterests === true,
  };
}

function postHashtags(post) {
  const inline = String(post?.body || "").match(/#[a-z0-9_]+/gi) || [];
  return new Set([...inline, ...(Array.isArray(post?.hashtags) ? post.hashtags : [])].map(normalizeHashtag).filter(Boolean));
}

function postTopicSlug(post) {
  return String(post?.primary_topic_slug || post?.media_meta?.primaryTopic?.slug || "");
}

/**
 * Score one cached post against an intent. Zero means "not a match".
 *
 * Interests only ever break ties between posts that already match the search,
 * and only when the person asked for personal picks — they never pull
 * unrelated posts into the results.
 */
export function scorePostForIntent(post, intent, interestSlugs = []) {
  if (!post) return 0;
  const tags = postHashtags(post);
  const text = [post.body, post.media_meta?.title].map((value) => String(value || "").toLowerCase()).join(" ");
  const author = `${post.author_name || ""} ${post.author_username || ""}`.toLowerCase();
  const topic = postTopicSlug(post);

  let score = 0;
  intent.hashtags.forEach((tag) => {
    if (tags.has(tag)) score += 3;
  });
  intent.keywords.forEach((keyword) => {
    if (text.includes(keyword)) score += 2;
    else if (author.includes(keyword)) score += 1;
    else if ([...tags].some((tag) => tag.includes(keyword.replace(/\s+/g, "")))) score += 1;
  });
  if (topic && intent.topicSlugs.includes(topic)) score += 2;

  if (score > 0 && intent.useInterests && topic && interestSlugs.includes(topic)) score += 1;
  return score;
}

export function rankPostsForIntent(posts, intent, interestSlugs = []) {
  return (Array.isArray(posts) ? posts : [])
    .map((post, index) => ({ post, index, score: scorePostForIntent(post, intent, interestSlugs) }))
    .filter((entry) => entry.score > 0)
    // Stable: equal scores keep the feed's own (recency) order.
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.post);
}

/** The hashtags a post composer should add: new ones only, in order. */
export function mergeHashtagsIntoText(text, tags) {
  const current = String(text || "");
  const existing = new Set((current.match(/#[a-zA-Z0-9_]+/g) || []).map(normalizeHashtag));
  const additions = [];
  (Array.isArray(tags) ? tags : []).forEach((tag) => {
    const clean = String(tag || "").trim().replace(/^#+/, "").replace(/[^a-zA-Z0-9_]/g, "");
    const key = clean.toLowerCase();
    if (!clean || existing.has(key)) return;
    existing.add(key);
    additions.push(`#${clean}`);
  });
  if (!additions.length) return current;
  return `${current.trimEnd()}${current.trim() ? " " : ""}${additions.join(" ")} `;
}

/** What kind of post the composer currently holds, for caption wording. */
export function composerMediaKind({ imagePreview, videoPreview, pendingVideoFile, audioPreview } = {}) {
  if (videoPreview || pendingVideoFile) return "video";
  if (imagePreview) return "image";
  if (audioPreview) return "voice";
  return "text";
}

/**
 * Flatten a threaded comment list (comments with nested `replies`) into the
 * text-only bodies the discussion summary needs, oldest first. Voice-only
 * comments and pending optimistic comments are skipped; no names are kept.
 */
export function collectDiscussionComments(thread, max = 40) {
  const bodies = [];
  const visit = (items) => {
    (Array.isArray(items) ? items : []).forEach((comment) => {
      if (bodies.length >= max) return;
      const body = String(comment?.body || "").trim();
      if (body && !comment?.pending) bodies.push(body.slice(0, 400));
      if (comment?.replies?.length) visit(comment.replies);
    });
  };
  visit(thread);
  return bodies;
}

// Below this many text comments a summary saves nobody any reading.
export const DISCUSSION_SUMMARY_MIN_COMMENTS = 8;

export function shouldOfferDiscussionSummary(thread) {
  return collectDiscussionComments(thread, DISCUSSION_SUMMARY_MIN_COMMENTS).length >= DISCUSSION_SUMMARY_MIN_COMMENTS;
}

/** Translation is only worth offering for text with at least two words. */
export function isTranslatableText(text) {
  const value = String(text || "").replace(/[#@][\w]+/g, " ").trim();
  return value.length >= 6 && value.split(/\s+/).filter(Boolean).length >= 2;
}
