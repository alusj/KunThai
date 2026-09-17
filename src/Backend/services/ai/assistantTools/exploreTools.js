import { searchExploreWithIntent } from "../../explore/searchService";
import { fetchUserTopicFollows } from "../../explore/topicService";
import { normalizeSearchIntent } from "../exploreAiModels";

// KAI — Explore tools for the conversational assistant.
//
// The model's arguments ARE the search terms; Explore's own search service
// finds the posts, Swip videos, people and hashtags. Interested Topics are read
// locally, only when the person asked for personal picks, and only to order
// results — they are never sent to the model.

function resultFacts(item) {
  return {
    type: item.type,
    title: String(item.title || "").slice(0, 80),
    ...(item.username ? { username: item.username } : {}),
    snippet: String(item.subtitle || "").slice(0, 160) || undefined,
  };
}

export const EXPLORE_TOOLS = {
  search_explore: async (args) => {
    const intent = normalizeSearchIntent(
      { keywords: args.keywords, hashtags: args.hashtags, topicSlugs: [], filter: args.filter, useInterests: args.forMe },
      (args.keywords || []).join(" "),
    );
    const interestSlugs = intent.useInterests ? await fetchUserTopicFollows().catch(() => []) : [];
    const results = (await searchExploreWithIntent(intent, { interestSlugs })).slice(0, 8);
    return {
      result: {
        found: results.length,
        note: results.length ? undefined : "Explore found nothing for these terms. Suggest different words.",
        results: results.map(resultFacts),
      },
      entities: { exploreResults: results },
    };
  },
};
