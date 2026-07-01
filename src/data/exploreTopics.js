export const EXPLORE_TOPIC_CATALOG = [
  { slug: "local-news", name: "Local news", category: "Community & news", starter: true },
  { slug: "community", name: "Community", category: "Community & news", starter: true },
  { slug: "world-news", name: "World news", category: "Community & news" },
  { slug: "public-safety", name: "Public safety", category: "Community & news" },
  { slug: "culture-heritage", name: "Culture & heritage", category: "Community & news", starter: true },
  { slug: "music", name: "Music", category: "Entertainment & culture", starter: true },
  { slug: "movies-tv", name: "Movies & TV", category: "Entertainment & culture", starter: true },
  { slug: "comedy", name: "Comedy", category: "Entertainment & culture", starter: true },
  { slug: "fashion", name: "Fashion", category: "Entertainment & culture" },
  { slug: "beauty", name: "Beauty", category: "Entertainment & culture" },
  { slug: "photography", name: "Photography", category: "Entertainment & culture" },
  { slug: "technology", name: "Technology", category: "Technology & business", starter: true },
  { slug: "entrepreneurship", name: "Entrepreneurship", category: "Technology & business", starter: true },
  { slug: "small-business", name: "Small business", category: "Technology & business", starter: true },
  { slug: "finance", name: "Finance", category: "Technology & business" },
  { slug: "jobs-careers", name: "Jobs & careers", category: "Technology & business", starter: true },
  { slug: "digital-skills", name: "Digital skills", category: "Technology & business" },
  { slug: "education", name: "Education", category: "Education & growth", starter: true },
  { slug: "scholarships", name: "Scholarships", category: "Education & growth", starter: true },
  { slug: "skills-training", name: "Skills training", category: "Education & growth" },
  { slug: "books", name: "Books", category: "Education & growth" },
  { slug: "languages", name: "Languages", category: "Education & growth" },
  { slug: "health", name: "Health", category: "Health & lifestyle", starter: true },
  { slug: "fitness", name: "Fitness", category: "Health & lifestyle", starter: true },
  { slug: "mental-wellness", name: "Mental wellness", category: "Health & lifestyle" },
  { slug: "parenting", name: "Parenting", category: "Health & lifestyle" },
  { slug: "relationships", name: "Relationships", category: "Health & lifestyle" },
  { slug: "football", name: "Football", category: "Sports", starter: true },
  { slug: "basketball", name: "Basketball", category: "Sports" },
  { slug: "athletics", name: "Athletics", category: "Sports" },
  { slug: "combat-sports", name: "Combat sports", category: "Sports" },
  { slug: "food", name: "Food", category: "Food & travel", starter: true },
  { slug: "cooking", name: "Cooking", category: "Food & travel" },
  { slug: "travel", name: "Travel", category: "Food & travel", starter: true },
  { slug: "events", name: "Events", category: "Food & travel" },
  { slug: "transport", name: "Transport", category: "Transport & work", starter: true },
  { slug: "logistics", name: "Logistics", category: "Transport & work" },
  { slug: "rides-delivery", name: "Rides & delivery", category: "Transport & work" },
  { slug: "vehicles", name: "Vehicles", category: "Transport & work" },
  { slug: "agriculture", name: "Agriculture", category: "Transport & work", starter: true },
  { slug: "construction", name: "Construction", category: "Transport & work" },
];

export const STARTER_EXPLORE_TOPICS = EXPLORE_TOPIC_CATALOG.filter((topic) => topic.starter);

export function normalizeExploreTopicSlug(value = "") {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function findExploreTopic(slug = "") {
  const normalized = normalizeExploreTopicSlug(slug);
  return EXPLORE_TOPIC_CATALOG.find((topic) => topic.slug === normalized) || null;
}
