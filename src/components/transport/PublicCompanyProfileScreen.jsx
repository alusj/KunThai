import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  CarFront,
  CheckCircle2,
  ExternalLink,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Star,
} from "lucide-react";

import AppBackTab from "../shared/AppBackTab";
import {
  buildPublicCompanyTabs,
  fetchPublicTransportCompanyProfile,
  fetchTransportCompanyReviewEligibility,
  submitTransportCompanyReview,
} from "../services/publicTransportCompanyService";

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}

function rateLabel(rental) {
  const options = [
    [rental.ratePerHour, "hour"],
    [rental.ratePerDay, "day"],
    [rental.ratePerWeek, "week"],
  ];
  const match = options.find(([amount]) => Number(amount) > 0);
  if (!match) return "Contact company for rate";
  return `${rental.currency || ""} ${Number(match[0]).toLocaleString()} / ${match[1]}`.trim();
}

export default function PublicCompanyProfileScreen({ companyId, onBack, onViewFleet, onViewRental }) {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("");
  const [eligibility, setEligibility] = useState({ eligible: false, tripId: null, reason: "" });
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewStatus, setReviewStatus] = useState("");

  const loadProfile = useCallback(async () => {
    setError("");
    try {
      const result = await fetchPublicTransportCompanyProfile(companyId);
      if (!result) throw new Error("This company profile is not available to passengers.");
      setProfile(result);
    } catch (loadError) {
      setError(loadError.message || "Unable to open this company profile.");
    }
  }, [companyId]);

  useEffect(() => {
    setProfile(null);
    loadProfile();
    fetchTransportCompanyReviewEligibility(companyId)
      .then(setEligibility)
      .catch(() => setEligibility({
        eligible: false,
        tripId: null,
        reason: "Complete a trip with this company before reviewing the company.",
      }));
  }, [companyId, loadProfile]);

  const tabs = useMemo(() => buildPublicCompanyTabs(profile), [profile]);

  useEffect(() => {
    if (!tabs.length) return;
    if (!tabs.some((tab) => tab.id === activeTab)) setActiveTab(tabs[0].id);
  }, [activeTab, tabs]);

  async function publishReview(event) {
    event.preventDefault();
    if (!eligibility.eligible || !eligibility.tripId) return;
    setReviewBusy(true);
    setReviewStatus("");
    try {
      await submitTransportCompanyReview({
        companyId,
        tripId: eligibility.tripId,
        rating: reviewRating,
        reviewText,
      });
      setReviewText("");
      setReviewStatus("Your company review is now public.");
      setEligibility({ eligible: false, tripId: null, reason: "You have reviewed your latest eligible trip." });
      await loadProfile();
    } catch (submitError) {
      setReviewStatus(submitError.message || "Unable to publish your review.");
    } finally {
      setReviewBusy(false);
    }
  }

  if (!profile && !error) {
    return (
      <div className="kt-mobile-viewport kt-safe-screen bg-slate-50 p-4 text-slate-950" data-back-swipe-scope>
        <AppBackTab onBack={onBack} label="Back to UrRide" historyKey="transport-company-opening" />
        <p className="mt-8 text-center text-sm font-bold text-slate-500">Opening company profile…</p>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="kt-mobile-viewport kt-safe-screen bg-slate-50 p-4 text-slate-950" data-back-swipe-scope>
        <AppBackTab onBack={onBack} label="Back to UrRide" historyKey="transport-company-error" />
        <section className="mt-5 rounded-3xl border border-amber-200 bg-white p-5 shadow-sm">
          <h1 className="text-lg font-black">Company profile unavailable</h1>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{error}</p>
          <button type="button" onClick={loadProfile} className="mt-4 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white">Try again</button>
        </section>
      </div>
    );
  }

  const { company, fleets, rentals, reviews } = profile;
  const currentTab = tabs.find((tab) => tab.id === activeTab) || tabs[0];
  const visibleFleets = currentTab?.kind === "fleet"
    ? fleets.filter((fleet) => fleet.fleetType.toLowerCase() === currentTab.fleetType.toLowerCase())
    : [];

  return (
    <div className="kt-mobile-viewport kt-safe-screen bg-slate-50 pb-24 text-slate-950" data-back-swipe-scope>
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-3 py-3 shadow-sm backdrop-blur">
        <div className="flex items-center gap-3">
          <AppBackTab onBack={onBack} label="Back" historyKey="transport-public-company" className="rounded-full border border-slate-200 bg-white" />
          <div className="min-w-0">
            <h1 className="truncate text-base font-black">{company.companyName}</h1>
            <p className="truncate text-xs font-bold text-slate-500">{company.companyCode || "Transport company"}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl space-y-4 px-3 py-4 sm:px-5">
        <section className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-5 text-white shadow-xl shadow-slate-300/30 sm:p-7">
          <div className="flex items-start gap-4">
            <span className="grid h-16 w-16 shrink-0 place-items-center rounded-3xl bg-emerald-400 text-2xl font-black text-slate-950">
              {company.companyName.slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300">Passenger company profile</p>
              <h2 className="mt-1 text-2xl font-black sm:text-3xl">{company.companyName}</h2>
              <p className="mt-1 text-sm font-semibold text-slate-300">
                {[company.companyCode, company.companyType, company.city].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2">
            <Metric value={company.fleetCount} label="Fleets" />
            <Metric value={company.rentalCount} label="Rentals" />
            <Metric value={company.reviewCount ? company.rating.toFixed(1) : "New"} label={`${company.reviewCount} reviews`} />
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs font-bold text-emerald-100">
            <ShieldCheck size={16} className="text-emerald-300" />
            Company reviews and operator reviews are measured separately.
          </div>
        </section>

        <nav aria-label="Company profile sections" className="sticky top-[65px] z-20 -mx-3 border-y border-slate-200 bg-slate-50/95 px-3 py-3 backdrop-blur sm:-mx-5 sm:px-5">
          <div role="tablist" className="flex snap-x gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`shrink-0 snap-start rounded-2xl px-5 py-3 text-sm font-black transition ${activeTab === tab.id ? "bg-slate-950 text-white shadow-lg" : "border border-slate-200 bg-white text-slate-700"}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </nav>

        {currentTab?.kind === "fleet" ? (
          <section className="grid gap-3 md:grid-cols-2">
            {visibleFleets.map((fleet) => (
              <FleetCard key={fleet.id} fleet={fleet} onView={() => onViewFleet?.(fleet.runtimeFleetId, company.id)} />
            ))}
          </section>
        ) : null}

        {currentTab?.kind === "rentals" ? (
          <section className="grid gap-3 md:grid-cols-2">
            {rentals.map((rental) => (
              <RentalCard key={rental.id} rental={rental} onView={() => onViewRental?.(rental.id, company.id)} />
            ))}
          </section>
        ) : null}

        {currentTab?.kind === "reviews" ? (
          <ReviewsPanel
            eligibility={eligibility}
            onSubmit={publishReview}
            rating={reviewRating}
            reviewText={reviewText}
            reviews={reviews}
            busy={reviewBusy}
            status={reviewStatus}
            setRating={setReviewRating}
            setReviewText={setReviewText}
          />
        ) : null}

        {currentTab?.kind === "about" ? <AboutPanel company={company} /> : null}
      </main>
    </div>
  );
}

function Metric({ value, label }) {
  return <div className="rounded-2xl bg-white/10 px-3 py-3 text-center"><strong className="block text-lg font-black">{value}</strong><span className="text-[11px] font-bold text-slate-300">{label}</span></div>;
}

function FleetCard({ fleet, onView }) {
  const vehicle = [fleet.color, fleet.make, fleet.model].filter(Boolean).join(" ");
  return (
    <article className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      {fleet.photos[0] ? <img src={fleet.photos[0]} alt={fleet.fleetName} className="h-40 w-full object-cover" /> : <div className="grid h-28 place-items-center bg-slate-100 text-slate-400"><CarFront size={36} /></div>}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0"><h3 className="truncate text-lg font-black">{fleet.fleetName}</h3><p className="mt-1 text-xs font-bold text-slate-500">{[fleet.fleetCode, fleet.plateNumber].filter(Boolean).join(" · ")}</p></div>
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${fleet.isAvailable ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{fleet.isAvailable ? "Available" : "Offline"}</span>
        </div>
        <p className="mt-3 text-sm font-semibold text-slate-600">{fleet.operatorName}</p>
        {vehicle ? <p className="mt-1 text-xs font-semibold text-slate-500">{vehicle}</p> : null}
        <div className="mt-3 flex items-center gap-2 text-xs font-bold text-amber-700"><Star size={15} fill="currentColor" />{fleet.reviewCount ? `${fleet.rating.toFixed(1)} operator rating · ${fleet.reviewCount}` : "New operator"}</div>
        <button type="button" disabled={!fleet.runtimeFleetId} onClick={onView} className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 text-sm font-black text-white disabled:bg-slate-200 disabled:text-slate-500">
          {fleet.runtimeFleetId ? "View fleet & operator" : "Currently unavailable"}<ExternalLink size={16} />
        </button>
      </div>
    </article>
  );
}

function RentalCard({ rental, onView }) {
  return (
    <article className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      {rental.photos[0] ? <img src={rental.photos[0]} alt={rental.title} className="h-40 w-full object-cover" /> : <div className="grid h-28 place-items-center bg-slate-100 text-slate-400"><CarFront size={36} /></div>}
      <div className="p-4"><h3 className="text-lg font-black">{rental.title}</h3><p className="mt-1 text-xs font-bold text-slate-500">{[rental.fleetCode, rental.fleetType].filter(Boolean).join(" · ")}</p><p className="mt-3 font-black text-emerald-800">{rateLabel(rental)}</p><p className="mt-1 flex items-center gap-2 text-xs font-semibold text-slate-500"><MapPin size={14} />{rental.pickupAddress || "Pickup arranged with company"}</p><button type="button" onClick={onView} className="mt-4 h-11 w-full rounded-2xl bg-slate-950 text-sm font-black text-white">View rental</button></div>
    </article>
  );
}

function ReviewsPanel({ eligibility, onSubmit, rating, reviewText, reviews, busy, status, setRating, setReviewText }) {
  return (
    <section className="space-y-3">
      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-black">Review this company</h2>
        <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">Company reviews cover the company experience. The operator’s driving and service review remains on the operator profile.</p>
        {eligibility.eligible ? (
          <form onSubmit={onSubmit} className="mt-4 space-y-3">
            <div className="flex gap-2" aria-label="Company rating">{[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" onClick={() => setRating(value)} aria-label={`${value} stars`} className={`grid h-10 w-10 place-items-center rounded-xl ${value <= rating ? "bg-amber-100 text-amber-600" : "bg-slate-100 text-slate-400"}`}><Star size={19} fill={value <= rating ? "currentColor" : "none"} /></button>)}</div>
            <textarea required minLength={3} maxLength={1000} value={reviewText} onChange={(event) => setReviewText(event.target.value)} placeholder="Describe your experience with the company…" className="min-h-28 w-full rounded-2xl border border-slate-300 bg-white p-3 text-sm font-semibold text-slate-950 outline-none focus:border-emerald-500" />
            <button type="submit" disabled={busy} className="w-full rounded-2xl bg-emerald-700 p-3 text-sm font-black text-white disabled:opacity-50">{busy ? "Publishing…" : "Publish company review"}</button>
          </form>
        ) : <p className="mt-3 rounded-2xl bg-slate-100 p-3 text-sm font-bold text-slate-600">{eligibility.reason || "Complete a trip with this company before reviewing it."}</p>}
        {status ? <p role="status" className="mt-3 text-sm font-bold text-emerald-700">{status}</p> : null}
      </div>
      {reviews.length ? reviews.map((review) => <article key={review.id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between gap-3"><strong>{review.passengerName}</strong><span className="flex items-center gap-1 text-sm font-black text-amber-600"><Star size={15} fill="currentColor" />{review.rating}</span></div><p className="mt-2 whitespace-pre-line text-sm font-semibold leading-6 text-slate-700">{review.reviewText}</p><p className="mt-2 text-xs font-bold text-slate-400">{formatDate(review.createdAt)}</p>{review.companyResponse ? <div className="mt-3 rounded-2xl bg-emerald-50 p-3"><p className="text-xs font-black uppercase text-emerald-800">Company response</p><p className="mt-1 text-sm font-semibold text-slate-700">{review.companyResponse}</p></div> : null}</article>) : <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-6 text-center"><Star className="mx-auto text-slate-400" /><h3 className="mt-2 font-black">No company reviews yet</h3><p className="mt-1 text-sm font-semibold text-slate-500">Operator reviews may still be available on individual fleet profiles.</p></div>}
    </section>
  );
}

function AboutPanel({ company }) {
  return (
    <section className="space-y-3">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-100 text-emerald-800"><Building2 size={21} /></span><div><h2 className="font-black">About {company.companyName}</h2><p className="text-sm font-semibold text-slate-500">{company.companyType || "Transport company"}</p></div></div><div className="mt-4 grid gap-3 text-sm font-semibold text-slate-700">{company.address || company.city ? <Info icon={MapPin} value={[company.address, company.city, company.country].filter(Boolean).join(", ")} /> : null}{company.phone ? <a href={`tel:${company.phone.replace(/[^+\d]/g, "")}`}><Info icon={Phone} value={company.phone} /></a> : null}{company.email ? <a href={`mailto:${company.email}`}><Info icon={Mail} value={company.email} /></a> : null}</div></div>
      {company.operatingAreas.length ? <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="font-black">Operating areas</h3><div className="mt-3 flex flex-wrap gap-2">{company.operatingAreas.map((area) => <span key={area} className="rounded-full bg-slate-100 px-3 py-2 text-xs font-black text-slate-700">{area}</span>)}</div></div> : null}
      {company.supportPolicy ? <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="font-black">Passenger support</h3><p className="mt-2 whitespace-pre-line text-sm font-semibold leading-6 text-slate-600">{company.supportPolicy}</p></div> : null}
      <div className="flex items-start gap-3 rounded-3xl border border-blue-200 bg-blue-50 p-4 text-blue-950"><CheckCircle2 size={20} className="mt-0.5 shrink-0" /><p className="text-sm font-semibold leading-6">Bookings remain connected to the individual operator or rental selected, while this page provides the company’s public identity and company-level reviews.</p></div>
    </section>
  );
}

function Info({ icon: Icon, value }) {
  return <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3"><Icon size={18} className="shrink-0 text-emerald-700" /><span>{value}</span></div>;
}
