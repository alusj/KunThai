// KAI — Explore assistant tools.
//
// Natural-language discovery for the conversational assistant. The model turns
// the person's request into search terms as the tool's arguments, and the
// browser runs Explore's existing search over real posts, Swip videos, people
// and hashtags. One model call, no second "interpret the query" round trip.

import { cleanLine, cleanSlug } from "../aiInput.js";
import { ToolArgumentError, registerToolGroup } from "./assistantTools.js";

function list(value, max, maxChars) {
  return Array.from(
    new Set((Array.isArray(value) ? value : []).map((item) => cleanLine(item, maxChars).toLowerCase()).filter((item) => item.length >= 2)),
  ).slice(0, max);
}

registerToolGroup({
  search_explore: {
    kind: "data",
    surfaces: ["explore", "global"],
    roles: [""],
    description:
      "Search real Explore content: UrFeed posts, Swip videos, people and hashtags. Pass search terms, not a sentence. Results are what Explore itself finds; never describe posts you were not given.",
    parameters: {
      type: "object",
      properties: {
        keywords: { type: "array", items: { type: "string" }, description: "Up to 4 short words or phrases likely to appear in matching posts (include synonyms)." },
        hashtags: { type: "array", items: { type: "string" }, description: "Up to 3 likely hashtags without #." },
        filter: { type: "string", enum: ["all", "feed", "swip", "people", "hashtag"] },
        forMe: { type: "boolean", description: "True only if the person explicitly asked for things for them personally." },
      },
      required: ["keywords"],
    },
    clean: (args) => {
      const keywords = list(args.keywords, 4, 40);
      const hashtags = list(args.hashtags, 3, 40).map((tag) => cleanSlug(tag.replace(/^#+/, ""), 40).replace(/[.-]/g, "")).filter((tag) => tag.length >= 2);
      if (!keywords.length && !hashtags.length) throw new ToolArgumentError("keywords are required");
      const filter = ["all", "feed", "swip", "people", "hashtag"].includes(args.filter) ? args.filter : "all";
      return { keywords, hashtags, filter, forMe: args.forMe === true };
    },
  },
});
