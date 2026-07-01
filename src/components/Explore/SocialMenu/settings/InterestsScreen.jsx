import { useEffect, useMemo, useState } from "react";
import { HiOutlineMagnifyingGlass, HiOutlineSparkles } from "react-icons/hi2";

import {
  fetchExploreTopics,
  fetchUserTopicFollows,
  saveUserTopicFollows,
} from "../../../../Backend/services/explore/topicService";
import SocialScreenHeader from "../shared/SocialScreenHeader";

const ALL_CATEGORIES = "All topics";

export default function InterestsScreen({ hideHeader = false }) {
  const [topics, setTopics] = useState([]);
  const [selected, setSelected] = useState([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(ALL_CATEGORIES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([fetchExploreTopics(), fetchUserTopicFollows()])
      .then(([topicRows, followed]) => {
        if (!active) return;
        setTopics(topicRows);
        setSelected(followed);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const categories = useMemo(
    () => [ALL_CATEGORIES, ...Array.from(new Set(topics.map((topic) => topic.category)))],
    [topics],
  );

  const visibleTopics = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return topics
      .filter((topic) => category === ALL_CATEGORIES || topic.category === category)
      .filter((topic) => !normalizedQuery || `${topic.name} ${topic.category}`.toLowerCase().includes(normalizedQuery))
      .sort((left, right) => {
        const leftSelected = selected.includes(left.slug) ? 1 : 0;
        const rightSelected = selected.includes(right.slug) ? 1 : 0;
        return rightSelected - leftSelected || left.name.localeCompare(right.name);
      });
  }, [category, query, selected, topics]);

  function toggleTopic(slug) {
    setFeedback("");
    setSelected((current) => (
      current.includes(slug) ? current.filter((topic) => topic !== slug) : [...current, slug]
    ));
  }

  async function save() {
    setSaving(true);
    setFeedback("");
    try {
      const result = await saveUserTopicFollows(selected, { source: "settings" });
      setFeedback(result.synced ? "Your topic choices are saved." : "Saved on this device. KunThai will sync them when the service is available.");
    } catch (error) {
      setFeedback(error.message || "Your topic choices could not be saved right now.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {!hideHeader ? (
        <SocialScreenHeader title="Interests" subtitle="Choose topics you enjoy without limiting what Explore can show you." />
      ) : null}

      <div className="w-full space-y-5 px-4 py-4 sm:px-6 lg:px-8">
        <section className="rounded-[26px] border border-sky-100 bg-sky-50/70 p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-sky-700 text-white">
              <HiOutlineSparkles className="text-2xl" />
            </span>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-700">Your Explore interests</p>
              <h3 className="mt-1 text-2xl font-black text-slate-950">Guide discovery, don’t restrict it</h3>
              <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-600">
                Selected topics are private and provide a light personalization signal. Followed accounts, nearby posts, freshness, and fair discovery still remain active.
              </p>
            </div>
          </div>
        </section>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <label className="flex h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 shadow-sm">
            <HiOutlineMagnifyingGlass className="text-xl text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search topics"
              className="min-w-0 flex-1 bg-transparent text-sm font-bold text-slate-900 outline-none placeholder:text-slate-400"
            />
          </label>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 shadow-sm outline-none"
          >
            {categories.map((item) => <option key={item}>{item}</option>)}
          </select>
        </div>

        <section className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-base font-black text-slate-950">Topics</p>
              <p className="mt-1 text-sm font-semibold text-slate-500">Choose any number—or none.</p>
            </div>
            <span className="rounded-full bg-sky-50 px-3 py-1.5 text-xs font-black text-sky-700">{selected.length} selected</span>
          </div>

          {loading ? <p className="mt-5 text-sm font-bold text-slate-500">Loading topics...</p> : null}
          {!loading ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {visibleTopics.map((topic) => {
                const active = selected.includes(topic.slug);
                return (
                  <button
                    key={topic.slug}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleTopic(topic.slug)}
                    className={`rounded-full border px-3.5 py-2 text-sm font-black transition ${
                      active
                        ? "border-sky-700 bg-sky-700 text-white"
                        : "border-slate-200 bg-slate-50 text-slate-700 hover:border-sky-300 hover:bg-sky-50"
                    }`}
                  >
                    {topic.name}
                  </button>
                );
              })}
            </div>
          ) : null}
          {!loading && !visibleTopics.length ? <p className="mt-5 text-sm font-bold text-slate-500">No topics match this search.</p> : null}
        </section>

        {feedback ? <p className="rounded-2xl bg-sky-50 px-4 py-3 text-sm font-black text-sky-800" role="status">{feedback}</p> : null}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              setSelected([]);
              setFeedback("Choose Save to confirm the reset.");
            }}
            className="h-12 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 shadow-sm"
          >
            Reset choices
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="h-12 rounded-2xl bg-slate-950 px-6 text-sm font-black text-white disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save interests"}
          </button>
        </div>
      </div>
    </div>
  );
}
