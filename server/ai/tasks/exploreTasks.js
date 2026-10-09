// KAI — Explore (UrFeed + Swip) tasks.
//
// Everything here produces SUGGESTIONS. None of these tasks can publish, and
// the browser only ever inserts a result into an editable field the person
// then chooses to post.

import { LIMITS } from "../aiConfig.js";
import { AI_ERROR_CODES, aiError } from "../aiErrors.js";
import { cleanImageDataUrl, cleanLanguage, cleanLine, cleanSlug, cleanText, optionalChoice } from "../aiInput.js";
import {
  TONES,
  joinPrompt,
  jsonResult,
  labelledInput,
  languageLine,
  normalizeHashtagValue,
  optionsResult,
  tagsResult,
  toneLine,
} from "../taskHelpers.js";

export const EXPLORE_TITLE_MAX_CHARS = 30;
const SEARCH_FILTERS = ["all", "feed", "swip", "people", "hashtag"];
const MAX_TOPICS_IN_PROMPT = 80;

function toneOf(input) {
  return optionalChoice(input.tone, TONES, "neutral");
}

// Topic lists come from the browser (the live explore_topics catalogue). They
// are only used to constrain the model's choice, and every slug the model
// returns is checked against this same list.
function cleanTopicList(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value
    .slice(0, MAX_TOPICS_IN_PROMPT)
    .map((topic) => ({ slug: cleanSlug(topic?.slug, 48), name: cleanLine(topic?.name, 48) }))
    .filter((topic) => {
      if (!topic.slug || !topic.name || seen.has(topic.slug)) return false;
      seen.add(topic.slug);
      return true;
    });
}

function topicCatalogueBlock(topics) {
  return topics.length ? labelledInput("Allowed topics (slug: name)", topics.map((topic) => `${topic.slug}: ${topic.name}`).join("\n")) : "";
}

// Shortens to a word boundary so a suggested title always fits KunThai's
// 30-character title field without being cut mid-word.
export function fitTitle(value, maxChars = EXPLORE_TITLE_MAX_CHARS) {
  const text = String(value || "").replace(/\s+/g, " ").trim().replace(/[.!]+$/, "");
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars + 1);
  const boundary = cut.lastIndexOf(" ");
  return (boundary > maxChars * 0.5 ? cut.slice(0, boundary) : text.slice(0, maxChars)).trim();
}

function postContext(input) {
  const title = cleanLine(input.title, 80);
  const body = cleanText(input.text ?? input.body, 2_000);
  const topic = cleanLine(input.topic, 60);
  return { title, body, topic };
}

export const EXPLORE_TASKS = {
  "explore.caption_generate": {
    id: "explore.caption_generate",
    tier: "fast",
    surfaces: ["explore"],
    label: "Generate caption",
    cacheable: true,
    // Drafts and photos before posting stay with their author.
    cacheScope: "user",
    output: "json",
    maxOutputTokens: 500,
    temperature: 0.8,
    schema: {
      type: "object",
      properties: { captions: { type: "array", items: { type: "string" } } },
      required: ["captions"],
    },
    instruction: [
      "Write three different short captions for a KunThai Explore post (UrFeed or a Swip video).",
      "Use ONLY what the person's notes, title, topic and photo actually show. Never invent prices, locations, dates, offers, names or claims that are not there.",
      "Each caption is one to three sentences, natural and human, with at most one emoji and no hashtags (hashtags are suggested separately).",
      "Make the three options noticeably different in angle, not just reworded.",
    ].join(" "),
    build(input) {
      const { title, body: notes, topic } = postContext(input);
      const media = [];
      const image = input.image ? cleanImageDataUrl(input.image) : null;
      if (input.image && !image) {
        throw aiError(AI_ERROR_CODES.invalidRequest, {
          message: "KAI could not read that photo. Try adding a few words instead.",
          details: "bad-image",
        });
      }
      if (image) media.push(image);

      if (!notes && !title && !image) {
        throw aiError(AI_ERROR_CODES.invalidRequest, {
          message: "Add a photo or a few words about your post first.",
          details: "caption-needs-context",
        });
      }

      const kind = optionalChoice(input.mediaKind, ["text", "image", "video", "voice"], "text");
      const language = cleanLanguage(input.language);

      return {
        prompt: joinPrompt([
          `Post type: ${kind === "video" ? "Swip video" : kind === "image" ? "photo post" : kind === "voice" ? "voice post" : "text post"}.`,
          title ? `Title: ${title}` : "",
          topic ? `Topic: ${topic}` : "",
          notes ? labelledInput("The person's notes or draft", notes) : "",
          image ? "The attached photo is the post's image." : "",
          toneLine(toneOf(input)),
          languageLine(language),
          "Return JSON with exactly three captions.",
        ]),
        media,
        cacheKey: ["caption", kind, title, topic, notes, toneOf(input), language, image ? image.data : ""],
      };
    },
    parse: (parsed) => optionsResult(parsed?.captions, { max: 3, maxChars: 500 }),
  },

  "explore.hashtags": {
    id: "explore.hashtags",
    tier: "fast",
    surfaces: ["explore"],
    label: "Suggest hashtags",
    cacheable: true,
    // Built from an unpublished draft: kept for its author only.
    cacheScope: "user",
    output: "json",
    maxOutputTokens: 220,
    temperature: 0.5,
    schema: {
      type: "object",
      properties: { hashtags: { type: "array", items: { type: "string" } } },
      required: ["hashtags"],
    },
    instruction: [
      "Suggest up to eight hashtags that real people on KunThai would search for to find this post.",
      "Mix specific tags with one or two broader ones. Add a local place tag (the city or country the post names) only when the post itself is local.",
      "Tags must reflect what the post is actually about. No spammy or misleading tags, no tags about things the post does not mention.",
      "Return each tag without the # symbol, using only letters, digits and underscores.",
    ].join(" "),
    build(input) {
      const { title, body, topic } = postContext(input);
      if (!body && !title) {
        throw aiError(AI_ERROR_CODES.invalidRequest, {
          message: "Write your post first, then KAI can suggest hashtags.",
          details: "hashtags-need-text",
        });
      }
      const existing = String(body).match(/#[a-zA-Z0-9_]+/g) || [];
      return {
        prompt: joinPrompt([
          title ? `Title: ${title}` : "",
          topic ? `Topic: ${topic}` : "",
          labelledInput("Post", body || title),
          existing.length ? `Already used (do not repeat): ${existing.join(" ")}` : "",
        ]),
        cacheKey: ["hashtags", title, topic, body],
      };
    },
    parse: (parsed, input = {}) => {
      const result = tagsResult(parsed?.hashtags, { max: 8 });
      const used = new Set(
        (String(input.text || "").match(/#[a-zA-Z0-9_]+/g) || []).map((tag) => normalizeHashtagValue(tag).toLowerCase()),
      );
      return { ...result, items: result.items.filter((tag) => !used.has(tag.toLowerCase())) };
    },
  },

  "explore.title_suggest": {
    id: "explore.title_suggest",
    tier: "fast",
    surfaces: ["explore"],
    label: "Suggest title",
    cacheable: true,
    // Built from an unpublished draft: kept for its author only.
    cacheScope: "user",
    output: "json",
    maxOutputTokens: 160,
    temperature: 0.7,
    schema: {
      type: "object",
      properties: { titles: { type: "array", items: { type: "string" } } },
      required: ["titles"],
    },
    instruction: `Suggest three short post titles. Each title must be at most ${EXPLORE_TITLE_MAX_CHARS} characters, describe what the post is actually about, and not be clickbait. No hashtags, no quotes, no trailing full stop.`,
    build(input) {
      const { body, topic } = postContext(input);
      if (!body) {
        throw aiError(AI_ERROR_CODES.invalidRequest, {
          message: "Write your post first, then KAI can suggest a title.",
          details: "title-needs-text",
        });
      }
      const language = cleanLanguage(input.language);
      return {
        prompt: joinPrompt([topic ? `Topic: ${topic}` : "", labelledInput("Post", body), languageLine(language)]),
        cacheKey: ["title", topic, language, body],
      };
    },
    parse: (parsed) => {
      const titles = (Array.isArray(parsed?.titles) ? parsed.titles : []).map((title) => fitTitle(title));
      return optionsResult(titles, { max: 3, maxChars: EXPLORE_TITLE_MAX_CHARS });
    },
  },

  "explore.topic_suggest": {
    id: "explore.topic_suggest",
    tier: "fast",
    surfaces: ["explore"],
    label: "Suggest topic",
    cacheable: true,
    // Built from an unpublished draft: kept for its author only.
    cacheScope: "user",
    output: "json",
    maxOutputTokens: 80,
    temperature: 0.1,
    schema: {
      type: "object",
      properties: { slug: { type: "string" } },
      required: ["slug"],
    },
    instruction: "Choose the single best topic for this post from the allowed topics list. Return its slug exactly as listed. If none genuinely fits, return an empty slug.",
    build(input) {
      const { title, body } = postContext(input);
      const topics = cleanTopicList(input.topics);
      if (!body && !title) {
        throw aiError(AI_ERROR_CODES.invalidRequest, {
          message: "Write your post first, then KAI can suggest a topic.",
          details: "topic-needs-text",
        });
      }
      if (!topics.length) {
        throw aiError(AI_ERROR_CODES.invalidRequest, { message: "Topics are still loading. Try again in a moment.", details: "no-topics" });
      }
      return {
        prompt: joinPrompt([topicCatalogueBlock(topics), title ? `Title: ${title}` : "", labelledInput("Post", body || title)]),
        cacheKey: ["topic", topics.map((topic) => topic.slug).join(","), title, body],
      };
    },
    // The model's slug is only accepted if it names a topic the browser offered.
    parse: (parsed, input = {}) => {
      const topics = cleanTopicList(input.topics);
      const slug = cleanSlug(parsed?.slug, 48);
      const topic = topics.find((item) => item.slug === slug);
      return topic
        ? { kind: "topic", topic }
        : { kind: "text", text: "None of the KunThai topics clearly fits this post. You can pick one yourself or leave it blank." };
    },
  },

  "explore.reply_suggest": {
    id: "explore.reply_suggest",
    tier: "fast",
    surfaces: ["explore"],
    label: "Suggest replies",
    cacheable: false,
    output: "json",
    maxOutputTokens: 320,
    temperature: 0.8,
    schema: {
      type: "object",
      properties: { replies: { type: "array", items: { type: "string" } } },
      required: ["replies"],
    },
    instruction: [
      "Suggest three short replies the person could post.",
      "Each reply is one or two sentences, friendly and respectful, and responds to what was actually said.",
      "Vary them: for example one appreciative, one that asks a relevant question, one that adds a thought.",
      "Never state facts about the post author, never make promises for the person, and never be rude, flirtatious or political.",
      "Never invent facts. Do not answer a factual question (prices, delivery areas, opening hours, stock, dates, locations) unless the answer is written in the post. If the post author is replying and the answer is not in the post, the reply should say they will confirm or ask for details instead of guessing.",
      "Write every reply in the voice of the person described as 'Who is replying'.",
    ].join(" "),
    build(input) {
      const post = input.post && typeof input.post === "object" ? input.post : {};
      const postTitle = cleanLine(post.title, 80);
      const postBody = cleanText(post.body, 1_500);
      const comment = cleanText(input.comment, 1_000);
      const draft = cleanText(input.draft, 600);
      if (!postBody && !postTitle && !comment) {
        throw aiError(AI_ERROR_CODES.invalidRequest, {
          message: "There is nothing here for KAI to reply to yet.",
          details: "reply-needs-context",
        });
      }
      const language = cleanLanguage(input.language);
      const role = optionalChoice(input.role, ["author", "viewer"], "viewer");
      return {
        // Deliberately no author names or usernames: the reply only needs the
        // words, so no identity is sent to the model.
        prompt: joinPrompt([
          postTitle ? `Post title: ${postTitle}` : "",
          postBody ? labelledInput("Post", postBody) : "",
          comment ? labelledInput("Comment being replied to", comment) : "The person is commenting on the post itself.",
          role === "author"
            ? "Who is replying: the author of the post, replying on their own post."
            : "Who is replying: a KunThai member reading the post (not its author).",
          draft ? labelledInput("The person's own draft (build on it)", draft) : "",
          language ? languageLine(language) : "Reply in the language of the comment or post.",
        ]),
        cacheKey: null,
      };
    },
    parse: (parsed) => optionsResult(parsed?.replies, { max: 3, maxChars: 400 }),
  },

  "explore.discussion_summary": {
    id: "explore.discussion_summary",
    tier: "standard",
    surfaces: ["explore"],
    label: "Summarise discussion",
    cacheable: true,
    output: "json",
    maxOutputTokens: 500,
    temperature: 0.3,
    schema: {
      type: "object",
      properties: {
        summary: { type: "string" },
        points: { type: "array", items: { type: "string" } },
      },
      required: ["summary"],
    },
    instruction: [
      "Summarise a comment discussion for someone who has not read it.",
      "Say what people are mostly saying, where they agree or disagree, and any open questions.",
      "Describe opinions as opinions. Do not name or quote individual commenters, do not take sides, and do not add facts that are not in the comments.",
    ].join(" "),
    build(input) {
      const post = input.post && typeof input.post === "object" ? input.post : {};
      const postTitle = cleanLine(post.title, 80);
      const postBody = cleanText(post.body, 800);
      const comments = Array.isArray(input.comments)
        ? input.comments.slice(0, LIMITS.maxListItems).map((comment) => cleanText(comment, 400)).filter(Boolean)
        : [];
      if (comments.length < 3) {
        throw aiError(AI_ERROR_CODES.invalidRequest, {
          message: "There are not enough comments to summarise yet.",
          details: "summary-needs-comments",
        });
      }
      const language = cleanLanguage(input.language);
      return {
        prompt: joinPrompt([
          postTitle ? `Post title: ${postTitle}` : "",
          postBody ? labelledInput("Post", postBody) : "",
          labelledInput("Comments (one per line, oldest first)", comments.map((comment, index) => `${index + 1}. ${comment}`).join("\n")),
          languageLine(language),
          "Return JSON with a 2-3 sentence summary and at most 4 short points.",
        ]),
        cacheKey: ["discussion", language, postTitle, postBody, ...comments],
      };
    },
    parse: (parsed) =>
      jsonResult({
        text: String(parsed?.summary || "").trim(),
        points: Array.isArray(parsed?.points)
          ? parsed.points.map((point) => String(point).trim()).filter(Boolean).slice(0, 4)
          : [],
      }),
  },

  "explore.search_intent": {
    id: "explore.search_intent",
    tier: "fast",
    surfaces: ["explore"],
    label: "Smart search",
    cacheable: true,
    output: "json",
    maxOutputTokens: 260,
    temperature: 0.1,
    schema: {
      type: "object",
      properties: {
        keywords: { type: "array", items: { type: "string" } },
        hashtags: { type: "array", items: { type: "string" } },
        topicSlugs: { type: "array", items: { type: "string" } },
        filter: { type: "string" },
        useInterests: { type: "boolean" },
      },
      required: ["keywords"],
    },
    instruction: [
      "Turn a natural-language Explore search into search terms. You do not search and you never return posts or people yourself.",
      "keywords: up to 4 short words or phrases likely to appear in matching posts or profile names (include useful synonyms).",
      "hashtags: up to 3 likely hashtags, without #.",
      "topicSlugs: up to 2 slugs, ONLY from the allowed topics list.",
      "filter: 'swip' if they want videos, 'people' if they want accounts, 'hashtag' if they want tags, 'feed' for posts, otherwise 'all'.",
      "useInterests: true ONLY if the query explicitly asks for things for them personally (e.g. 'for me', 'I might like'). Never infer interests yourself.",
    ].join(" "),
    build(input) {
      const query = cleanLine(input.query, 200);
      if (query.length < 2) {
        throw aiError(AI_ERROR_CODES.invalidRequest, { message: "Type what you are looking for first.", details: "search-needs-query" });
      }
      const topics = cleanTopicList(input.topics);
      return {
        prompt: joinPrompt([topicCatalogueBlock(topics), labelledInput("Search", query)]),
        cacheKey: ["search", topics.map((topic) => topic.slug).join(","), query.toLowerCase()],
      };
    },
    parse: (parsed, input = {}) => {
      const topics = cleanTopicList(input.topics);
      const allowed = new Set(topics.map((topic) => topic.slug));
      const keywords = Array.from(
        new Set(
          (Array.isArray(parsed?.keywords) ? parsed.keywords : [])
            .map((keyword) => cleanLine(keyword, 40).toLowerCase())
            .filter((keyword) => keyword.length >= 2),
        ),
      ).slice(0, 4);
      const hashtags = tagsResult(parsed?.hashtags, { max: 3 }).items.map((tag) => tag.toLowerCase());
      const topicSlugs = (Array.isArray(parsed?.topicSlugs) ? parsed.topicSlugs : [])
        .map((slug) => cleanSlug(slug, 48))
        .filter((slug) => allowed.has(slug))
        .slice(0, 2);
      const filter = SEARCH_FILTERS.includes(parsed?.filter) ? parsed.filter : "all";
      return {
        kind: "search",
        search: { keywords, hashtags, topicSlugs, filter, useInterests: parsed?.useInterests === true },
      };
    },
  },
};
