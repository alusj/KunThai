import { t } from "../../../i18n";
import { runAiTask } from "./aiService";
import { openAiAssistant } from "./aiSurfaceService";
import { normalizeSearchIntent } from "./exploreAiModels";
import { fetchExploreTopics, fetchUserTopicFollows } from "../explore/topicService";
import { searchExploreWithIntent } from "../explore/searchService";

// KAI — Explore browser helpers.
//
// Thin glue between Explore screens and the shared AI service. No prompts and
// no model details live here; this only prepares the data a task needs and
// feeds results back into Explore's existing services.

const AI_IMAGE_MAX_DIMENSION = 512;
const AI_IMAGE_QUALITY = 0.72;

/**
 * Downscale a composer photo for captioning.
 *
 * A 512px JPEG is plenty for the model to describe the scene and keeps the
 * request (and its token cost) small. Returns "" when the image cannot be
 * read — for example a remote image the canvas may not export — so the caption
 * can still be written from the person's words.
 */
export function prepareImageForAi(source) {
  const src = String(source || "");
  if (!src || typeof document === "undefined") return Promise.resolve("");

  return new Promise((resolve) => {
    const image = new Image();
    if (!src.startsWith("data:") && !src.startsWith("blob:")) image.crossOrigin = "anonymous";

    image.onload = () => {
      try {
        const width = Math.max(1, image.naturalWidth || image.width || 1);
        const height = Math.max(1, image.naturalHeight || image.height || 1);
        const scale = Math.min(1, AI_IMAGE_MAX_DIMENSION / Math.max(width, height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) {
          resolve("");
          return;
        }
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", AI_IMAGE_QUALITY));
      } catch {
        // A tainted canvas (cross-origin image) cannot be exported.
        resolve("");
      }
    };
    image.onerror = () => resolve("");
    image.src = src;
  });
}

// The topic catalogue changes rarely; one fetch per session serves every AI
// action that needs it.
let topicsPromise = null;

export function loadExploreTopicsForAi() {
  if (!topicsPromise) {
    topicsPromise = fetchExploreTopics()
      .then((topics) => (topics || []).map((topic) => ({ slug: topic.slug, name: topic.name })).filter((topic) => topic.slug && topic.name))
      .catch(() => {
        topicsPromise = null;
        return [];
      });
  }
  return topicsPromise;
}

/**
 * Natural-language Explore search.
 *
 * 1. KAI turns the phrase into search terms (a cheap, cached call).
 * 2. Explore's existing search runs those terms over real posts and profiles.
 *
 * The person's Interested Topics are read locally and used only to order
 * results — and only when the model says the query asked for personal picks.
 * They are never sent to the model.
 */
export async function runSmartExploreSearch(query, { signal } = {}) {
  const topics = await loadExploreTopicsForAi();
  const response = await runAiTask({
    task: "explore.search_intent",
    surface: "explore",
    input: { query, topics },
    context: { screen: "explore search" },
    signal,
  });

  const intent = normalizeSearchIntent(response?.result?.search, query);
  const interestSlugs = intent.useInterests ? await fetchUserTopicFollows().catch(() => []) : [];
  const results = await searchExploreWithIntent(intent, { interestSlugs });

  const topicNames = intent.topicSlugs
    .map((slug) => topics.find((topic) => topic.slug === slug)?.name)
    .filter(Boolean);

  return {
    intent,
    topicNames,
    usedInterests: intent.useInterests && interestSlugs.length > 0,
    results,
  };
}

// Posts longer than this also get a "Summarise" option when read with AI.
const POST_SUMMARY_MIN_CHARS = 600;

/**
 * Open KAI on someone's post or Swip caption: translate it into the
 * reader's language straight away, and offer a summary for long posts.
 * Read-only — there is no insert action, so nothing can be posted from here.
 */
export function openPostReaderAi(post, { locale = "en", swip = false } = {}) {
  const body = String(post?.body || "").trim();
  if (!body) return;
  openAiAssistant({
    surface: "explore",
    screen: swip ? "swip video" : "urfeed post",
    title: t("ai.explore.readPostTitle"),
    sourceLabel: swip ? t("ai.explore.swipCaption") : t("ai.explore.postText"),
    text: body,
    actions: body.length >= POST_SUMMARY_MIN_CHARS ? ["text.translate", "text.summarize"] : ["text.translate"],
    task: "text.translate",
    input: { targetLanguage: locale },
    hidePrompts: true,
  });
}
