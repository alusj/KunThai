import supabase from "../../lib/supabaseClient";
import { fetchExploreAdvertAnalytics } from "./advertService";
import { isAdvertPost } from "../../../components/Explore/shared/advertUtils";

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function fetchPostAnalytics(post) {
  const postId = post?.id;
  if (!postId) return null;

  const [{ data, error }, advert] = await Promise.all([
    supabase.rpc("get_explore_post_analytics", { p_post_id: postId }),
    isAdvertPost(post) ? fetchExploreAdvertAnalytics(post).catch(() => null) : Promise.resolve(null),
  ]);

  if (error) {
    throw new Error("KunThai could not load insights for this post right now.");
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;

  const likes = toNumber(row.likes ?? post.likes_count);
  const comments = toNumber(row.comments ?? post.comments_count);
  const saves = toNumber(row.saves ?? post.saves_count);
  const shares = toNumber(row.shares);
  const views = Math.max(toNumber(row.views), toNumber(advert?.video_views));
  const impressions = Math.max(toNumber(row.impressions), toNumber(advert?.impressions));
  const engagements = likes + comments + saves + shares;

  return {
    postId,
    isVideo: Boolean(post.video_url),
    isAdvert: isAdvertPost(post),
    postedAt: row.posted_at || post.created_at || null,
    impressions,
    reach: Math.max(toNumber(row.reach), toNumber(advert?.reach)),
    views,
    likes,
    comments,
    saves,
    shares,
    engagements,
    engagementRate: views > 0 ? engagements / views : 0,
    watchTimeSeconds: toNumber(row.watch_time_seconds),
    averageCompletion: Math.max(toNumber(row.average_completion), toNumber(advert?.completion_rate)),
    completions: toNumber(row.completions),
    rewatches: toNumber(row.rewatches),
    skips: toNumber(row.skips),
    advert: advert
      ? {
          clicks: toNumber(advert.clicks),
          ctr: toNumber(advert.ctr),
          profileVisits: toNumber(advert.profile_visits),
          followsGenerated: toNumber(advert.follows_generated),
        }
      : null,
  };
}

export function buildPostInsights(analytics, post = {}) {
  if (!analytics) return [];

  const insights = [];
  const hasHashtags = Boolean(
    (Array.isArray(post.hashtags) && post.hashtags.length) ||
      /#[a-z0-9_]+/i.test(String(post.body || "")),
  );

  if (analytics.views === 0 && analytics.impressions === 0) {
    insights.push({
      tone: "sky",
      title: "Kick-start your reach",
      body: "This post has not circulated yet. Share it with your followers or repost it at a busy time of day to get the first views in.",
    });
  }

  if (analytics.engagementRate >= 0.2 && analytics.views >= 5) {
    insights.push({
      tone: "emerald",
      title: "Strong engagement",
      body: "People who see this post interact with it well above average. Posting similar content at the same time of day can compound this momentum.",
    });
  } else if (analytics.views >= 10 && analytics.engagementRate < 0.05) {
    insights.push({
      tone: "amber",
      title: "Views without reactions",
      body: "This post is being seen but rarely reacted to. A clear question or call-to-action in the first line usually lifts reactions.",
    });
  }

  if (analytics.isVideo && analytics.views >= 5 && analytics.averageCompletion > 0 && analytics.averageCompletion < 0.3) {
    insights.push({
      tone: "amber",
      title: "Hook viewers earlier",
      body: "Most viewers leave before a third of the video. Put the strongest moment in the first three seconds and keep clips tight.",
    });
  }

  if (analytics.isVideo && analytics.rewatches > 0) {
    insights.push({
      tone: "emerald",
      title: "People are rewatching",
      body: `This video was rewatched ${analytics.rewatches} time${analytics.rewatches === 1 ? "" : "s"} — a strong quality signal that boosts recommendations.`,
    });
  }

  if (!hasHashtags) {
    insights.push({
      tone: "sky",
      title: "Add hashtags",
      body: "Posts with two or three relevant hashtags are easier to discover through search and topic feeds.",
    });
  }

  if (analytics.comments > 0) {
    insights.push({
      tone: "sky",
      title: "Keep the conversation going",
      body: "Replying to comments within the first hours signals an active conversation and ranks the post higher for others.",
    });
  }

  if (analytics.skips >= 5 && analytics.skips > analytics.completions) {
    insights.push({
      tone: "amber",
      title: "High skip rate",
      body: "Many viewers skipped quickly. Consider a tighter edit or a caption that sets expectations for what is coming.",
    });
  }

  if (analytics.advert) {
    if (analytics.advert.ctr >= 2) {
      insights.push({
        tone: "emerald",
        title: "Advert is converting",
        body: `A ${analytics.advert.ctr}% click-through rate is healthy. Consider extending this campaign while it performs.`,
      });
    } else if (analytics.impressions >= 50) {
      insights.push({
        tone: "amber",
        title: "Sharpen the advert action",
        body: "Impressions are flowing but few people click. A clearer offer or a stronger call-to-action button usually raises the click rate.",
      });
    }
  }

  if (!insights.length) {
    insights.push({
      tone: "sky",
      title: "Keep publishing",
      body: "Consistent posting is the strongest growth signal on KunThai. Numbers build as your recent activity accumulates.",
    });
  }

  return insights.slice(0, 4);
}
