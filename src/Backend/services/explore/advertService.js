import supabase from "../../lib/supabaseClient";
import { getCountryCurrencyCode } from "../../../data/globalCountryProfiles";
import { MINIMUM_VISIBILITY_CREDITS, normalizeVisibilityCreditSpend } from "../visibilityCreditService";

const AD_SESSION_KEY = "kunthai_explore_ad_session_v1";
const AD_SEEN_SESSION_KEY = "kunthai_explore_seen_ads_v1";
const MUTED_ADVERTISERS_KEY = "kunthai_explore_muted_advertisers_v1";
const AD_EVENT_TYPES = new Set([
  "impression", "view", "click", "profile_visit", "video_view", "watch",
  "complete", "like", "comment", "share", "save", "follow", "hide", "report", "mute",
]);
const SAFE_INTEREST_CATEGORIES = [
  "technology", "fashion", "beauty", "food", "sports", "music", "entertainment",
  "education", "business", "travel", "photography", "gaming", "news",
];

function isAdvert(post = {}) {
  return post.post_type === "advert" || post.category === "advert" || Boolean(post.media_meta?.advert || post.mediaMeta?.advert);
}

function isUnavailableDatabaseFeature(error) {
  const message = String(error?.message || "").toLowerCase();
  return error?.code === "PGRST202"
    || error?.code === "42P01"
    || message.includes("could not find the function")
    || message.includes("could not find the table")
    || message.includes("does not exist");
}

function normalizeAdvert(post = {}) {
  return post.media_meta?.advert || post.mediaMeta?.advert || {};
}

export function getExploreAdvertCampaign(post = {}) {
  const advert = normalizeAdvert(post);
  return advert.campaign || advert.delivery || null;
}

export function getExploreAdvertCampaignId(post = {}) {
  return post.ad_campaign_id || getExploreAdvertCampaign(post)?.id || "";
}

function getSessionKey() {
  try {
    const existing = sessionStorage.getItem(AD_SESSION_KEY);
    if (existing) return existing;
    const next = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(AD_SESSION_KEY, next);
    return next;
  } catch {
    return "";
  }
}

function readSeenCampaigns() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(AD_SEEN_SESSION_KEY) || "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter(Boolean) : []);
  } catch {
    return new Set();
  }
}

function rememberSeenCampaign(campaignId) {
  if (!campaignId) return;
  const seen = readSeenCampaigns();
  seen.add(campaignId);
  try {
    sessionStorage.setItem(AD_SEEN_SESSION_KEY, JSON.stringify(Array.from(seen).slice(-100)));
  } catch {
    // Frequency capping still continues on the server when storage is unavailable.
  }
}

function normalizeInterests(interests = []) {
  return Array.from(new Set((Array.isArray(interests) ? interests : [])
    .map((interest) => String(interest || "").trim().toLowerCase())
    .filter(Boolean)))
    .slice(0, 20);
}

function getCampaignDates(advert = {}) {
  const durationDays = Math.max(1, Math.min(Number(advert.durationDays) || 14, 365));
  const startsAt = advert.durationPreset === "custom" && advert.customStart
    ? new Date(`${advert.customStart}T00:00:00`).toISOString()
    : new Date().toISOString();
  const endsAt = advert.durationPreset === "custom" && advert.customEnd
    ? new Date(`${advert.customEnd}T23:59:59`).toISOString()
    : new Date(new Date(startsAt).getTime() + durationDays * 86_400_000).toISOString();

  return { durationDays, startsAt, endsAt };
}

export async function createExploreAdvertCampaign(post, advertInput = {}) {
  if (!post?.id || !isAdvert(post)) return null;

  const advert = { ...normalizeAdvert(post), ...advertInput };
  const { durationDays, startsAt, endsAt } = getCampaignDates(advert);
  const creditBudget = normalizeVisibilityCreditSpend(
    advert.creditBudget || advert.creditSpend || advert.budgetAmount,
    MINIMUM_VISIBILITY_CREDITS,
  );
  const minimumAge = advert.ageRange === "18+"
    ? 18
    : advert.ageRange === "custom"
      ? Math.max(13, Number(advert.minimumAge) || 13)
      : 13;
  const maximumAge = advert.ageRange === "custom"
    ? Math.max(minimumAge, Number(advert.maximumAge) || 120)
    : null;

  const { data, error } = await supabase.rpc("create_explore_ad_campaign", {
    p_post_id: post.id,
    p_placement: advert.placement || "urfeed",
    p_objective: advert.objective || "brand_awareness",
    p_audience_type: advert.audienceType || "recommended",
    p_minimum_age: minimumAge,
    p_maximum_age: maximumAge,
    p_gender_target: advert.genderTarget || "all",
    p_interest_categories: normalizeInterests(advert.interests),
    p_target_area: advert.audienceType === "nearby" ? String(advert.targetArea || "").trim() || null : null,
    p_duration_days: durationDays,
    p_starts_at: startsAt,
    p_ends_at: endsAt,
    p_budget_type: "total",
    p_budget_amount: creditBudget,
    p_currency: advert.currency || getCountryCurrencyCode(),
    p_credit_budget: creditBudget,
  });

  if (error) {
    if (isUnavailableDatabaseFeature(error)) return null;
    throw error;
  }

  return (Array.isArray(data) ? data[0] : data) || null;
}

export async function fetchRecommendedExploreAds(surface = "urfeed", options = {}) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) return [];

  const { data: ranked, error: rankedError } = await supabase.rpc("get_recommended_explore_ads", {
    p_user_id: user.id,
    p_surface: surface === "swip" ? "swip" : "urfeed",
    p_limit: Math.max(1, Math.min(Number(options.limit) || 6, 12)),
  });

  if (rankedError) {
    if (isUnavailableDatabaseFeature(rankedError)) return null;
    throw rankedError;
  }

  const seenCampaigns = readSeenCampaigns();
  const rows = (ranked || []).filter((row) => !seenCampaigns.has(row.campaign_id));
  const postIds = rows.map((row) => row.post_id).filter(Boolean);
  if (!postIds.length) return [];

  const { data: posts, error: postError } = await supabase
    .from("explore_posts")
    .select("*")
    .in("id", postIds);

  if (postError) throw postError;
  const postsById = new Map((posts || []).map((post) => [post.id, post]));

  return rows.flatMap((row) => {
    const post = postsById.get(row.post_id);
    if (!post) return [];
    const mediaMeta = post.media_meta || {};
    const advert = mediaMeta.advert || {};
    return [{
      ...post,
      post_privacy: "public",
      post_type: "advert",
      category: "advert",
      ad_campaign_id: row.campaign_id,
      ad_delivery_score: Number(row.score) || 0,
      recommendation_score: Number(row.score) || 0,
      media_meta: {
        ...mediaMeta,
        advert: {
          ...advert,
          campaign: { ...(row.campaign || {}), id: row.campaign_id, reason: row.reason || row.campaign?.reason || "" },
        },
      },
    }];
  });
}

export async function hydrateOwnedExploreAdverts(posts = [], userId = "") {
  if (!userId) return posts;

  const { data: recentOwnedPosts, error: ownedPostError } = await supabase
    .from("explore_posts")
    .select("*")
    .eq("user_id", userId)
    .eq("post_type", "advert")
    .in("moderation_status", ["not_required", "approved", "legacy"])
    .order("created_at", { ascending: false })
    .limit(12);

  if (ownedPostError) throw ownedPostError;
  const basePosts = new Map(posts.map((post) => [post.id, post]));
  (recentOwnedPosts || []).forEach((post) => basePosts.set(post.id, { ...basePosts.get(post.id), ...post }));

  const { data, error } = await supabase
    .from("explore_ad_campaigns")
    .select("*")
    .eq("advertiser_id", userId)
    .in("status", ["active", "pending_review", "paused"])
    .order("created_at", { ascending: false })
    .limit(12);

  if (error) {
    if (isUnavailableDatabaseFeature(error)) return Array.from(basePosts.values());
    throw error;
  }

  const campaignRows = data || [];
  const creativeIds = campaignRows.map((campaign) => campaign.creative_post_id).filter(Boolean);
  if (!creativeIds.length) return Array.from(basePosts.values());

  const { data: ownedPosts, error: postError } = await supabase
    .from("explore_posts")
    .select("*")
    .in("id", creativeIds)
    .in("moderation_status", ["not_required", "approved", "legacy"]);

  if (postError) throw postError;

  const campaigns = new Map(campaignRows.map((campaign) => [campaign.creative_post_id, campaign]));
  const combined = new Map(basePosts);
  (ownedPosts || []).forEach((post) => combined.set(post.id, { ...combined.get(post.id), ...post }));

  return Array.from(combined.values()).map((post) => {
    const campaign = campaigns.get(post.id);
    if (!campaign) return post;
    const mediaMeta = post.media_meta || {};
    return {
      ...post,
      ad_campaign_id: campaign.id,
      media_meta: {
        ...mediaMeta,
        advert: {
          ...(mediaMeta.advert || {}),
          campaign: {
            id: campaign.id,
            placement: campaign.placement,
            objective: campaign.objective,
            audienceType: campaign.audience_type,
            startsAt: campaign.starts_at,
            endsAt: campaign.ends_at,
            creditBudget: Number(campaign.credit_budget || campaign.budget_amount || 0),
            creditsSpent: Number(campaign.credits_spent || 0),
            reason: "Your Explore advertisement campaign",
          },
        },
      },
    };
  });
}

export async function recordExploreAdvertEvent(post, eventType, options = {}) {
  const campaignId = getExploreAdvertCampaignId(post);
  if (!campaignId || !AD_EVENT_TYPES.has(eventType)) return false;
  if (eventType === "impression") rememberSeenCampaign(campaignId);

  const dedupeEvent = ["impression", "view", "video_view"].includes(eventType);
  const { data, error } = await supabase.rpc("record_explore_ad_event", {
    p_campaign_id: campaignId,
    p_event_type: eventType,
    p_surface: options.surface === "swip" ? "swip" : "urfeed",
    p_value: Math.max(0, Math.min(Number(options.value) || 1, 3600)),
    p_completion_rate: options.completionRate == null
      ? null
      : Math.max(0, Math.min(Number(options.completionRate) || 0, 1)),
    p_session_key: dedupeEvent ? getSessionKey() : null,
  });

  if (error) {
    if (isUnavailableDatabaseFeature(error)) return false;
    if (import.meta.env.DEV) console.info("[ExploreAds] analytics event was not recorded", error.code);
    return false;
  }
  return Boolean(data);
}

export async function setExploreAdvertUserControl(post, action, reason = "") {
  const campaignId = getExploreAdvertCampaignId(post);
  if (!campaignId) return false;

  const { data, error } = await supabase.rpc("set_explore_ad_user_control", {
    p_campaign_id: campaignId,
    p_action: action,
    p_reason: String(reason || "").trim() || null,
  });

  if (error) {
    if (isUnavailableDatabaseFeature(error)) return false;
    throw error;
  }
  return Boolean(data);
}

export function recordExploreSearchInterests(query = "") {
  const normalized = String(query || "").trim().toLowerCase();
  if (!normalized) return;
  const matched = SAFE_INTEREST_CATEGORIES.filter((category) => normalized.includes(category));
  matched.forEach((category) => {
    supabase.rpc("record_explore_ad_search_interest", { p_topic: category }).then(({ error }) => {
      if (error && !isUnavailableDatabaseFeature(error) && import.meta.env.DEV) {
        console.info("[ExploreAds] search interest was not recorded", error.code);
      }
    });
  });
}

export async function fetchExploreAdvertAnalytics(post) {
  const campaignId = getExploreAdvertCampaignId(post);
  if (!campaignId) return null;
  const { data, error } = await supabase.rpc("get_explore_ad_analytics", { p_campaign_id: campaignId });
  if (error) {
    if (isUnavailableDatabaseFeature(error)) return null;
    throw error;
  }
  return data?.[0] || null;
}

export function readMutedExploreAdvertisers() {
  try {
    const parsed = JSON.parse(localStorage.getItem(MUTED_ADVERTISERS_KEY) || "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter(Boolean) : []);
  } catch {
    return new Set();
  }
}

export function storeMutedExploreAdvertiser(advertiserId) {
  const next = readMutedExploreAdvertisers();
  if (advertiserId) next.add(advertiserId);
  try {
    localStorage.setItem(MUTED_ADVERTISERS_KEY, JSON.stringify(Array.from(next)));
  } catch {
    // The in-memory feed update still applies when storage is unavailable.
  }
  return next;
}

export function getExploreAdvertReason(post = {}) {
  return getExploreAdvertCampaign(post)?.reason || "This sponsored item was selected from your Explore activity and the advertiser's chosen audience.";
}

export function paceExploreAdvertPosts(posts = [], surface = "feed", currentUserId = "") {
  const organic = posts.filter((post) => !isAdvert(post));
  const ownedAdverts = posts
    .filter((post) => isAdvert(post) && currentUserId && post.user_id === currentUserId)
    .sort((first, second) => new Date(second.created_at || 0) - new Date(first.created_at || 0));
  const ownedAdvertIds = new Set(ownedAdverts.map((post) => post.id));
  const sponsoredAdverts = posts.filter((post) => isAdvert(post) && !ownedAdvertIds.has(post.id)).sort((first, second) => (
    Number(second.ad_delivery_score ?? second.recommendation_score ?? 0)
    - Number(first.ad_delivery_score ?? first.recommendation_score ?? 0)
  ));
  const adverts = [...ownedAdverts, ...sponsoredAdverts];
  if (!adverts.length) return organic;
  if (organic.length < 3) {
    return ownedAdverts.length ? [ownedAdverts[0], ...organic] : organic.length ? organic : adverts.slice(0, 1);
  }

  const firstSlot = surface === "swip" ? 4 : 5;
  const interval = surface === "swip" ? 7 : 9;
  const paced = [];
  let advertIndex = 0;

  // The creator's newest advert remains visible like newly published content
  // in their own UrFeed and does not consume another viewer's sponsored slot.
  if (ownedAdverts.length) {
    paced.push(adverts[advertIndex]);
    advertIndex += 1;
  }

  organic.forEach((post, index) => {
    paced.push(post);
    const organicCount = index + 1;
    if (
      advertIndex < adverts.length
      && organicCount >= firstSlot
      && (organicCount - firstSlot) % interval === 0
    ) {
      paced.push(adverts[advertIndex]);
      advertIndex += 1;
    }
  });

  return paced;
}
