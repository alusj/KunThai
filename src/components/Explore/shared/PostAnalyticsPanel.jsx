import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BarChart3,
  Bookmark,
  Eye,
  Heart,
  Lightbulb,
  MessageCircle,
  MousePointerClick,
  Radio,
  Repeat2,
  Share2,
  Timer,
  UsersRound,
  X,
} from "lucide-react";

import { buildPostInsights, fetchPostAnalytics } from "../../../Backend/services/explore/postAnalyticsService";
import useBodyScrollLock from "../../shared/useBodyScrollLock";

const DONUT_COLORS = ["#0ea5e9", "#10b981", "#8b5cf6", "#f59e0b"];

function useCountUp(target = 0, { duration = 950, decimals = 0 } = {}) {
  const [value, setValue] = useState(0);
  const frameRef = useRef(null);

  useEffect(() => {
    const end = Number(target) || 0;
    const start = performance.now();

    function tick(now) {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(end * eased);
      if (progress < 1) frameRef.current = requestAnimationFrame(tick);
    }

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [duration, target]);

  return decimals > 0 ? value.toFixed(decimals) : Math.round(value).toLocaleString();
}

function StatTile({ icon: Icon, label, value, tone = "sky", delayMs = 0, suffix = "" }) {
  const display = useCountUp(value);
  const tones = {
    sky: "bg-sky-50 text-sky-700",
    emerald: "bg-emerald-50 text-emerald-700",
    violet: "bg-violet-50 text-violet-700",
    amber: "bg-amber-50 text-amber-700",
  };

  return (
    <div className="kt-fade-up rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm" style={{ animationDelay: `${delayMs}ms` }}>
      <span className={`grid h-10 w-10 place-items-center rounded-2xl ${tones[tone] || tones.sky}`}>
        <Icon size={18} />
      </span>
      <p className="mt-3 text-2xl font-black tabular-nums text-slate-950">
        {display}
        {suffix}
      </p>
      <p className="mt-0.5 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p>
    </div>
  );
}

function EngagementDonut({ analytics }) {
  const [drawn, setDrawn] = useState(false);
  const segments = useMemo(() => {
    const parts = [
      { label: "Likes", value: analytics.likes },
      { label: "Comments", value: analytics.comments },
      { label: "Saves", value: analytics.saves },
      { label: "Shares", value: analytics.shares },
    ];
    const total = parts.reduce((sum, part) => sum + part.value, 0);
    let offset = 0;
    return parts.map((part, index) => {
      const fraction = total > 0 ? part.value / total : 0;
      const segment = { ...part, fraction, offset, color: DONUT_COLORS[index] };
      offset += fraction;
      return segment;
    });
  }, [analytics]);

  const total = analytics.engagements;
  const radius = 15.915;
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    const frame = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="kt-fade-up rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm" style={{ animationDelay: "180ms" }}>
      <h3 className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">Engagement mix</h3>
      <div className="mt-4 flex items-center gap-5">
        <div className="relative h-36 w-36 flex-none">
          <svg viewBox="0 0 42 42" className="h-full w-full -rotate-90">
            <circle cx="21" cy="21" r={radius} fill="none" stroke="#f1f5f9" strokeWidth="5.5" />
            {segments.filter((segment) => segment.fraction > 0).map((segment) => (
              <circle
                key={segment.label}
                cx="21"
                cy="21"
                r={radius}
                fill="none"
                stroke={segment.color}
                strokeWidth="5.5"
                strokeLinecap="round"
                strokeDasharray={`${drawn ? Math.max(segment.fraction * circumference - 0.6, 0.4) : 0.4} ${circumference}`}
                strokeDashoffset={-segment.offset * circumference}
                style={{ transition: "stroke-dasharray 900ms cubic-bezier(0.22, 1, 0.36, 1)" }}
              />
            ))}
          </svg>
          <div className="absolute inset-0 grid place-items-center text-center">
            <div>
              <p className="text-2xl font-black tabular-nums text-slate-950">{total.toLocaleString()}</p>
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Reactions</p>
            </div>
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          {segments.map((segment) => (
            <div key={segment.label} className="flex items-center gap-2 text-sm">
              <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ backgroundColor: segment.color }} />
              <span className="min-w-0 flex-1 truncate font-bold text-slate-600">{segment.label}</span>
              <span className="font-black tabular-nums text-slate-950">{segment.value.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReachFunnel({ analytics }) {
  const [grown, setGrown] = useState(false);
  const steps = useMemo(() => {
    const raw = [
      { label: "Impressions", value: analytics.impressions, color: "#0ea5e9" },
      { label: analytics.isVideo ? "Views" : "Opens", value: analytics.views, color: "#10b981" },
      { label: "Reactions", value: analytics.engagements, color: "#8b5cf6" },
    ];
    if (analytics.isVideo) {
      raw.push({ label: "Watched to the end", value: analytics.completions, color: "#f59e0b" });
    }
    const max = Math.max(1, ...raw.map((step) => step.value));
    return raw.map((step) => ({ ...step, pct: Math.max(step.value > 0 ? 6 : 2, (step.value / max) * 100) }));
  }, [analytics]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="kt-fade-up rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm" style={{ animationDelay: "260ms" }}>
      <h3 className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">Journey through your {analytics.isVideo ? "video" : "post"}</h3>
      <div className="mt-4 space-y-3">
        {steps.map((step, index) => (
          <div key={step.label}>
            <div className="flex items-center justify-between text-xs font-bold text-slate-500">
              <span>{step.label}</span>
              <span className="font-black tabular-nums text-slate-950">{step.value.toLocaleString()}</span>
            </div>
            <div className="mt-1.5 h-3.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full"
                style={{
                  width: grown ? `${step.pct}%` : "0%",
                  backgroundColor: step.color,
                  transition: `width 800ms cubic-bezier(0.22, 1, 0.36, 1) ${140 * index}ms`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatWatchTime(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  }
  return `${minutes}m ${rest}s`;
}

const INSIGHT_TONES = {
  sky: "border-sky-200 bg-sky-50 text-sky-900",
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
  amber: "border-amber-200 bg-amber-50 text-amber-900",
};

export default function PostAnalyticsPanel({ post, onClose }) {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [closing, setClosing] = useState(false);
  useBodyScrollLock(true);

  useEffect(() => {
    let alive = true;

    fetchPostAnalytics(post)
      .then((result) => {
        if (!alive) return;
        setAnalytics(result);
        if (!result) setError("Insights are only available for your own posts.");
      })
      .catch((err) => {
        if (alive) setError(err.message || "Unable to load insights.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [post]);

  function requestClose() {
    if (closing) return;
    setClosing(true);
    window.setTimeout(() => onClose?.(), 240);
  }

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") requestClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // requestClose identity is stable enough for the lifetime of the panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const insights = useMemo(() => buildPostInsights(analytics, post), [analytics, post]);
  const postedLabel = analytics?.postedAt
    ? new Date(analytics.postedAt).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })
    : "";

  return createPortal(
    <div className={`fixed inset-0 z-[1400] flex flex-col ${closing ? "kt-toast-collapse-out" : "kt-toast-expand-in"} bg-slate-100`}>
      <header className="flex flex-none items-center gap-3 bg-[linear-gradient(120deg,#082f49_0%,#0f172a_55%,#132238_100%)] px-4 pb-5 pt-[calc(env(safe-area-inset-top)+1.1rem)] text-white">
        <span className="grid h-11 w-11 flex-none place-items-center rounded-2xl bg-white/10 text-sky-200">
          <BarChart3 size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-black uppercase tracking-[0.24em] text-sky-300">
            {post?.video_url ? "Swip insights" : "Post insights"}
          </p>
          <h2 className="truncate text-xl font-black">
            {String(post?.body || "").trim() || (post?.video_url ? "Your Swip video" : "Your post")}
          </h2>
          {postedLabel ? <p className="mt-0.5 text-xs font-semibold text-slate-300">Published {postedLabel}</p> : null}
        </div>
        <button
          type="button"
          onClick={requestClose}
          aria-label="Close insights"
          className="kt-touchable grid h-11 w-11 flex-none place-items-center rounded-2xl bg-white/10 text-white transition hover:bg-white/20"
        >
          <X size={19} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        <div className="mx-auto w-full max-w-2xl space-y-4 pb-10">
          {loading ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {[1, 2, 3, 4, 5, 6].map((item) => (
                  <div key={item} className="h-28 animate-pulse rounded-[22px] border border-slate-200 bg-white" />
                ))}
              </div>
              <div className="h-52 animate-pulse rounded-[24px] border border-slate-200 bg-white" />
              <div className="h-44 animate-pulse rounded-[24px] border border-slate-200 bg-white" />
            </div>
          ) : error || !analytics ? (
            <div className="rounded-[24px] border border-slate-200 bg-white p-6 text-center shadow-sm">
              <p className="text-sm font-black text-slate-950">Insights unavailable</p>
              <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">{error || "Try again in a moment."}</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <StatTile icon={Eye} label={analytics.isVideo ? "Views" : "Opens"} value={analytics.views} tone="sky" delayMs={0} />
                <StatTile icon={Radio} label="Impressions" value={analytics.impressions} tone="violet" delayMs={60} />
                <StatTile icon={UsersRound} label="Reach" value={analytics.reach} tone="emerald" delayMs={120} />
                <StatTile icon={Heart} label="Likes" value={analytics.likes} tone="amber" delayMs={180} />
                <StatTile icon={MessageCircle} label="Comments" value={analytics.comments} tone="sky" delayMs={240} />
                <StatTile icon={Bookmark} label="Saves" value={analytics.saves} tone="violet" delayMs={300} />
              </div>

              {analytics.isVideo ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div className="kt-fade-up rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm" style={{ animationDelay: "120ms" }}>
                    <span className="grid h-10 w-10 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><Timer size={18} /></span>
                    <p className="mt-3 text-2xl font-black tabular-nums text-slate-950">{formatWatchTime(analytics.watchTimeSeconds)}</p>
                    <p className="mt-0.5 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Total watch time</p>
                  </div>
                  <StatTile
                    icon={Share2}
                    label="Completion"
                    value={Math.round(analytics.averageCompletion * 100)}
                    suffix="%"
                    tone="sky"
                    delayMs={180}
                  />
                  <StatTile icon={Repeat2} label="Rewatches" value={analytics.rewatches} tone="violet" delayMs={240} />
                </div>
              ) : null}

              {analytics.advert ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <StatTile icon={MousePointerClick} label="Clicks" value={analytics.advert.clicks} tone="emerald" delayMs={80} />
                  <StatTile icon={BarChart3} label="Click rate" value={analytics.advert.ctr} suffix="%" tone="sky" delayMs={140} />
                  <StatTile icon={UsersRound} label="Profile visits" value={analytics.advert.profileVisits} tone="violet" delayMs={200} />
                </div>
              ) : null}

              <EngagementDonut analytics={analytics} />
              <ReachFunnel analytics={analytics} />

              <section className="kt-fade-up space-y-3" style={{ animationDelay: "340ms" }}>
                <div className="flex items-center gap-2 px-1">
                  <span className="grid h-9 w-9 place-items-center rounded-2xl bg-amber-50 text-amber-600">
                    <Lightbulb size={17} />
                  </span>
                  <h3 className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">Suggestions for you</h3>
                </div>
                {insights.map((insight, index) => (
                  <article
                    key={insight.title}
                    className={`kt-fade-up rounded-[22px] border p-4 ${INSIGHT_TONES[insight.tone] || INSIGHT_TONES.sky}`}
                    style={{ animationDelay: `${380 + index * 90}ms` }}
                  >
                    <p className="text-sm font-black">{insight.title}</p>
                    <p className="mt-1 text-sm font-semibold leading-6 opacity-90">{insight.body}</p>
                  </article>
                ))}
              </section>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
