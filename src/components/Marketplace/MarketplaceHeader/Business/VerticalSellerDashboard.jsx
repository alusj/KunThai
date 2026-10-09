import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BarChart3, Bath, BedDouble, CalendarDays, Clock3, Copy, Film, Hotel, House, LoaderCircle, Lock, MapPin, MessageCircle, MoreVertical, PackageCheck, Pencil, Plus, Rocket, Share2, Star, ToggleLeft, ToggleRight, Trash2, UtensilsCrossed, X } from "lucide-react";

import {
  fetchHotelWorkspace,
  fetchPropertyListings,
  fetchRestaurantMenu,
  fetchVerticalBusinessActivity,
  fetchVerticalListingInsights,
  deleteHotelImage,
  deleteHotelVideo,
  deletePropertyListing,
  deleteRestaurantMenuItem,
  getMarketplaceBusinessDay,
  promoteVerticalListing,
  saveHotelMediaPackage,
  savePropertyListing,
  saveRestaurantMenuItem,
  subscribeVerticalBusinessActivity,
  toggleRestaurantMenuItem,
} from "../../../../Backend/services/marketplace/marketplaceVerticalService";
import {
  assertVisibilityCreditsAvailable,
  decorateShareUrl,
} from "../../../../Backend/services/visibilityCreditService";
import { showToast } from "../../../../Backend/services/toastService";
import { resizedImageUrl } from "../../../../Backend/lib/imageProxy";
import { urMallShareToastOptions } from "../../../../Backend/services/shareCtaService";
import { haptics, sounds } from "../../../../Backend/services/feedbackService";
import { createEmptyVerticalMedia } from "../../../../Backend/services/marketplace/verticalMediaValidation";
import { consumePendingVerticalEditor, subscribeVerticalEditor } from "../../../../Backend/services/marketplace/verticalEditorBus";
import VerticalMediaFields from "./VerticalMediaFields";
import ProductInsightsScreen from "./BusinessCatalog/ProductInsightsScreen";
import PlanFeatureGate from "../../../shared/PlanFeatureGate";
import { t as i18nText } from "../../../../i18n/index";
import AddressLocationField from "../../../shared/AddressLocationField";
import ListingUploadProgressCard from "../../shared/ListingUploadProgressCard";
import useBodyScrollLock from "../../../shared/useBodyScrollLock";
import { useI18n, t } from "../../../../i18n";
import PromotionSetupPanel from "./Promotion/PromotionSetupPanel";
import { normalizePromotionSettings } from "./Promotion/promotionSetup";
import { uiText as translateUi, useI18n as useUiLocale } from "../../../../i18n/index.js";
import { inlineErrorMessage, shortErrorToast } from "../../../../Backend/services/friendlyErrorService";
import { fetchBusinessSubscription, getMealDayLimit } from "../../../../Backend/services/businessSubscriptionService";
import { ALL_WEEKDAYS, checkMealDays, mealServedDays, restaurantMealDays } from "../../../../Backend/services/marketplace/restaurantMealDays";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const dayLong = (index) => t(`urmall.biz.vert.dayLong${index}`);
const dayShort = (index) => t(`urmall.biz.vert.dayShort${index}`);
const emptyMealForm = () => ({ name: "", description: "", price: "", meal_period: "all_day", preparation_minutes: 20, available_everyday: true, available_days: [], ...createEmptyVerticalMedia() });
const mealFormDays = (form) => (form.available_everyday !== false ? [...ALL_WEEKDAYS] : (form.available_days || []).map(Number));
const SELLER_VERTICAL_STORAGE_KEY = "kunthai.marketplace.sellerVerticals.v1";
const SELLER_VERTICAL_MEMORY = new Map();

if (typeof localStorage !== "undefined") {
  try {
    const stored = JSON.parse(localStorage.getItem(SELLER_VERTICAL_STORAGE_KEY) || "null");
    Object.entries(stored?.entries || {}).forEach(([key, entry]) => {
      if (entry && Object.prototype.hasOwnProperty.call(entry, "value")) {
        SELLER_VERTICAL_MEMORY.set(key, entry);
      }
    });
  } catch {
    // The dashboard still works without persistent caching.
  }
}

function readSellerVerticalCache(key, fallback) {
  const entry = SELLER_VERTICAL_MEMORY.get(key);
  return entry
    ? { hasValue: true, value: entry.value }
    : { hasValue: false, value: fallback };
}

function rememberSellerVerticalData(key, value) {
  SELLER_VERTICAL_MEMORY.set(key, { value, savedAt: Date.now() });
  try {
    localStorage.setItem(
      SELLER_VERTICAL_STORAGE_KEY,
      JSON.stringify({ entries: Object.fromEntries(SELLER_VERTICAL_MEMORY) }),
    );
  } catch {
    // In-memory caching still keeps category and business switches instant.
  }
  return value;
}

function notifyVerticalListingUpdated(businessId) {
  window.dispatchEvent(new CustomEvent("marketplace-vertical-listing-updated", { detail: { businessId } }));
}

function useRetentionInventoryRefresh(businessId, load) {
  useEffect(() => {
    const refresh = (event) => {
      if (event.detail?.businessId && event.detail.businessId !== businessId) return;
      for (const key of SELLER_VERTICAL_MEMORY.keys()) {
        if (key.includes(`:${businessId}`)) SELLER_VERTICAL_MEMORY.delete(key);
      }
      try {
        localStorage.setItem(SELLER_VERTICAL_STORAGE_KEY, JSON.stringify({ entries: Object.fromEntries(SELLER_VERTICAL_MEMORY) }));
      } catch { /* Optional cache. */ }
      load().catch(() => {});
    };
    window.addEventListener("kunthai-urmall-retention-updated", refresh);
    return () => window.removeEventListener("kunthai-urmall-retention-updated", refresh);
  }, [businessId, load]);
}

function useVerticalActivity(businessId) {
  const emptyActivity = useMemo(() => ({ reviews: 0, messages: 0, orders: 0, bookings: 0, recentBookings: [] }), []);
  const cacheKey = `activity:${businessId}`;
  const [activity, setActivity] = useState(() => readSellerVerticalCache(cacheKey, emptyActivity).value);
  const load = useCallback(() => fetchVerticalBusinessActivity(businessId)
    .then((nextActivity) => {
      setActivity(rememberSellerVerticalData(cacheKey, nextActivity));
      return nextActivity;
    })
    .catch(() => null), [businessId, cacheKey]);
  useEffect(() => {
    let timer;
    setActivity(readSellerVerticalCache(cacheKey, emptyActivity).value);
    const refresh = (event) => {
      if (event?.detail?.businessId && event.detail.businessId !== businessId) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(load, 100);
    };
    load();
    const unsubscribe = subscribeVerticalBusinessActivity(businessId, refresh);
    window.addEventListener("marketplace-vertical-activity-updated", refresh);
    return () => {
      window.clearTimeout(timer);
      unsubscribe?.();
      window.removeEventListener("marketplace-vertical-activity-updated", refresh);
    };
  }, [businessId, cacheKey, emptyActivity, load]);
  return activity;
}

// Listing insights are a Pro feature on every UrMall business kind, exactly
// like retail: the "..." menu shows a Pro badge while locked and the insights
// sheet renders behind PlanFeatureGate (which fails open if plans are down).
const VerticalPlanContext = createContext({ plansEnabled: false, insightsLocked: false, onOpenPlans: null });

export default function VerticalSellerDashboard({ business, canManage = true, initialWorkspace = null, plansEnabled = false, insightsLocked = false, onOpenPlans = null }) {
  useI18n();
  const plan = useMemo(() => ({ plansEnabled, insightsLocked, onOpenPlans }), [insightsLocked, onOpenPlans, plansEnabled]);
  if (!business?.id) return null;
  // The key makes same-category business switches hydrate from that business's
  // own cache on the first render instead of briefly retaining the prior store.
  let dashboard = null;
  if (business.kind === "restaurant") dashboard = <RestaurantDashboard key={business.id} business={business} canManage={canManage} initialWorkspace={initialWorkspace} />;
  else if (business.kind === "hotel") dashboard = <HotelDashboard key={business.id} business={business} canManage={canManage} initialWorkspace={initialWorkspace} />;
  else if (business.kind === "property_agent") dashboard = <PropertyDashboard key={business.id} business={business} canManage={canManage} initialWorkspace={initialWorkspace} />;
  return dashboard ? <VerticalPlanContext.Provider value={plan}>{dashboard}</VerticalPlanContext.Provider> : null;
}

function WorkspaceShell({ children, icon: Icon, eyebrow, title, subtitle, stats = [] }) {
  useUiLocale();
  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[28px] bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-5 text-white shadow-xl">
        <div className="flex items-start gap-4"><span className="grid h-13 w-13 flex-none place-items-center rounded-2xl bg-white/10"><Icon size={24} /></span><div><p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">{eyebrow}</p><h1 className="mt-1 text-2xl font-black">{title}</h1><p className="mt-2 text-sm font-semibold leading-6 text-slate-300">{translateUi(subtitle)}</p></div></div>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">{stats.map((stat) => <div key={stat.label} className="rounded-2xl bg-white/8 p-3"><p className="text-xl font-black">{stat.value}</p><p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-slate-300">{translateUi(stat.label)}</p></div>)}</div>
      </section>
      {children}
    </div>
  );
}

function RestaurantDashboard({ business, canManage = true, initialWorkspace = null }) {
  useUiLocale();
  const today = getMarketplaceBusinessDay(business.countryIso);
  const [day, setDay] = useState(today);
  const menuCacheKey = `restaurant:${business.id}:${day}`;
  const overviewMenu = initialWorkspace?.businessId === business.id && initialWorkspace.kind === "restaurant" && initialWorkspace.day === day
    ? { hasValue: true, value: initialWorkspace.data || [] }
    : null;
  const initialMenuCache = overviewMenu || readSellerVerticalCache(menuCacheKey, []);
  const overviewMenuRef = useRef(overviewMenu);
  const [items, setItems] = useState(() => initialMenuCache.value);
  const [loading, setLoading] = useState(() => !initialMenuCache.hasValue);
  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadStage, setUploadStage] = useState("");
  const [promoteItem, setPromoteItem] = useState(null);
  const [insightsItem, setInsightsItem] = useState(null);
  const submissionLock = useRef(false);
  const [form, setForm] = useState(emptyMealForm);
  const editingMeal = Boolean(form.id);
  // Free plan: meals on at most N weekdays (null = every day allowed). The
  // database enforces the same rule; this explains it before saving.
  const plan = useContext(VerticalPlanContext);
  const [mealDayLimit, setMealDayLimit] = useState(null);
  const mealDayLimitRef = useRef(null);
  const [allMeals, setAllMeals] = useState([]);
  const allMealsRef = useRef([]);
  const [mealBaselineDays, setMealBaselineDays] = useState([]);
  const [limitNotice, setLimitNotice] = useState(null);
  const refreshMealDayRules = useCallback(async () => {
    const [state, meals] = await Promise.all([
      plan.plansEnabled ? fetchBusinessSubscription("urmall", business.id).catch(() => null) : null,
      fetchRestaurantMenu(business.id, null).catch(() => null),
    ]);
    const limit = getMealDayLimit(state);
    mealDayLimitRef.current = limit;
    setMealDayLimit(limit);
    if (Array.isArray(meals)) {
      allMealsRef.current = meals;
      setAllMeals(meals);
    }
  }, [business.id, plan.plansEnabled]);
  useEffect(() => { refreshMealDayRules(); }, [refreshMealDayRules]);
  const mealDayRules = useMemo(() => ({
    limit: mealDayLimit,
    oldDays: mealBaselineDays,
    otherDays: restaurantMealDays(allMeals, form.id),
  }), [allMeals, form.id, mealBaselineDays, mealDayLimit]);
  const openPlansFromMeal = plan.onOpenPlans ? () => { setFormOpen(false); plan.onOpenPlans(); } : null;
  const activity = useVerticalActivity(business.id);
  const load = useCallback(async () => {
    const cached = overviewMenuRef.current || readSellerVerticalCache(menuCacheKey, []);
    overviewMenuRef.current = null;
    setItems(cached.value);
    setLoading(!cached.hasValue);
    try {
      const nextItems = await fetchRestaurantMenu(business.id, day);
      setItems(rememberSellerVerticalData(menuCacheKey, nextItems));
    } catch (error) {
      showToast(shortErrorToast(error, "Couldn't load menu"), "danger");
    } finally {
      setLoading(false);
    }
  }, [business.id, day, menuCacheKey]);
  useEffect(() => { load(); }, [load]);
  const openNewMeal = useCallback(() => {
    const next = emptyMealForm();
    const limit = mealDayLimitRef.current;
    if (limit !== null) {
      // On a limited plan a new meal starts on the selected day (when the
      // restaurant may still use it) instead of "every day".
      const fits = checkMealDays({ limit, newDays: [day], otherDays: restaurantMealDays(allMealsRef.current) }).allowed;
      next.available_everyday = false;
      next.available_days = fits ? [day] : [];
    }
    setForm(next);
    setMealBaselineDays([]);
    setLimitNotice(null);
    setFormOpen(true);
    refreshMealDayRules();
  }, [day, refreshMealDayRules]);
  useOpenVerticalEditor(openNewMeal, canManage);
  useRetentionInventoryRefresh(business.id, load);

  function editMeal(item) {
    setDay(Number(item.day_of_week));
    setMealBaselineDays(mealServedDays(item));
    setLimitNotice(null);
    refreshMealDayRules();
    setForm({
      id: item.id,
      name: item.name || "",
      description: item.description || "",
      price: item.price ?? "",
      meal_period: item.meal_period || "all_day",
      preparation_minutes: item.preparation_minutes || 20,
      available_everyday: item.available_everyday !== false,
      available_days: Array.isArray(item.available_days) ? item.available_days.map(Number) : [],
      image_url: item.image_url || "",
      image_urls: item.image_urls || [],
      video_url: item.video_url || "",
      ...createEmptyVerticalMedia(),
    });
    setFormOpen(true);
  }

  async function save(event) {
    event.preventDefault();
    if (submissionLock.current) return;
    if (!form.available_everyday && !(form.available_days || []).length) {
      showToast("Pick at least one day", "danger");
      return;
    }
    const dayCheck = checkMealDays({ ...mealDayRules, newDays: mealFormDays(form) });
    if (!dayCheck.allowed) {
      setLimitNotice({ reason: dayCheck.reason });
      return;
    }
    submissionLock.current = true;
    setSubmitting(true);
    try {
      const wasEditing = editingMeal;
      const promotionSettings = normalizePromotionSettings(form);
      if (!wasEditing && form.promote) {
        await assertVisibilityCreditsAvailable(promotionSettings.promotionCredits);
      }
      const saved = await saveRestaurantMenuItem(business.id, { ...form, day_of_week: day }, setUploadStage);
      // Post & promote: boost the freshly created meal. Best-effort — the meal
      // is already saved, so a boost failure only shows a traceable warning.
      if (!wasEditing && form.promote && saved?.id) {
        try {
          await promoteVerticalListing("meal", { id: saved.id, name: saved.name }, {
            credits: promotionSettings.promotionCredits,
            audience: promotionSettings.promotionAudience,
            regionMode: promotionSettings.promotionRegionMode,
            regions: promotionSettings.promotionRegions,
            countries: promotionSettings.promotionCountries,
          });
        } catch (promoError) {
          showToast(shortErrorToast(promoError, "Boost couldn't start"), "danger");
        }
      }
      setForm(emptyMealForm());
      setLimitNotice(null);
      setFormOpen(false);
      await load();
      refreshMealDayRules();
      notifyVerticalListingUpdated(business.id);
      haptics.medium("marketplace");
      sounds.success("marketplace");
      showToast(wasEditing ? "Updated successfully" : "Added successfully", "success", urMallShareToastOptions());
    } catch (error) {
      if (error?.code === "KUNTHAI_PLAN_LIMIT") {
        // Explain the plan limit inside the form, with the way to upgrade.
        const reason = error.resource === "meal_days"
          ? (mealFormDays(form).length > Number(error.limit || 0) ? "meal" : "restaurant")
          : "products";
        setLimitNotice({ reason, current: error.current, limit: error.limit, planCode: error.planCode });
        if (reason !== "products" && Number(error.limit) > 0) {
          mealDayLimitRef.current = Number(error.limit);
          setMealDayLimit(Number(error.limit));
        }
        showToast(t("urmallPlans2026.limits.toast"), "danger");
      } else {
        showToast(shortErrorToast(error, "Couldn't save meal"), "danger");
      }
    } finally { submissionLock.current = false; setSubmitting(false); setUploadStage(""); }
  }

  return (
    <WorkspaceShell icon={UtensilsCrossed} eyebrow={t("urmall.biz.vert.restaurantWorkspace")} title={business.name} subtitle={t("urmall.biz.vert.restaurantSubtitle")} stats={[{ label: t("urmall.biz.vert.today"), value: dayShort(today) }, { label: t("urmall.biz.vert.itemsToday"), value: day === today ? items.length : "—" }, { label: t("urmall.biz.vert.selectedDay"), value: dayShort(day) }, { label: t("urmall.biz.vert.available"), value: items.filter((item) => item.available).length }]}>
      <DaySelector day={day} setDay={setDay} />
      <VerticalActivityStrip activity={activity} commerceLabel={t("urmall.biz.vert.orders")} commerceValue={activity.orders} />
      <section className="rounded-[26px] border border-gray-200 bg-white p-5 shadow-sm">
        <SectionHeading eyebrow={t("urmall.biz.vert.dayMenu", { day: dayLong(day) })} title={t("urmall.biz.vert.mealsTitle")}>{canManage ? <PrimaryButton onClick={openNewMeal} label={t("urmall.biz.vert.addMeal")} className="bg-orange-600" /> : null}</SectionHeading>
        <div className="mt-5 grid gap-3 md:grid-cols-2" aria-busy={loading || undefined}>{loading ? <VerticalListingsSkeleton variant="meal" /> : items.map((item) => <MealCard key={item.id} item={item} business={business} canManage={canManage} onEdit={() => editMeal(item)} onInsights={() => setInsightsItem(item)} onPromote={() => setPromoteItem(item)} onDelete={async () => { await deleteRestaurantMenuItem(item); await load(); refreshMealDayRules(); notifyVerticalListingUpdated(business.id); showToast("Meal has been deleted", "success"); }} onToggle={async () => { await toggleRestaurantMenuItem(item, !item.available); await load(); notifyVerticalListingUpdated(business.id); }} />)}</div>
        {!loading && !items.length ? <EmptyState text={t("urmall.biz.vert.noMeals", { day: dayLong(day) })} /> : null}
      </section>
      <VerticalEditorSheet open={formOpen} onClose={() => setFormOpen(false)} title={editingMeal ? t("urmall.biz.vert.editMeal") : t("urmall.biz.vert.addMeal")} subtitle={t("urmall.biz.vert.dayMenu", { day: dayLong(day) })} formId="restaurant-meal-form" actionLabel={editingMeal ? t("urmall.biz.vert.saveChanges") : form.promote ? t("urmall.biz.pform.pubPromote") : t("urmall.biz.vert.addMeal")} processingLabel={editingMeal ? t("urmall.biz.vert.saving") : t("urmall.biz.vert.adding")} processing={submitting} accentClass="bg-orange-600" uploadStage={uploadStage} uploadTitle={t("urmall.biz.vert.addingMeal")}>
        <RestaurantForm formId="restaurant-meal-form" form={form} setForm={setForm} onSubmit={save} dayRules={mealDayRules} limitNotice={limitNotice} onLimitNotice={setLimitNotice} onOpenPlans={openPlansFromMeal} />
      </VerticalEditorSheet>
      {promoteItem ? <VerticalPromoteSheet listingType="meal" listing={promoteItem} onClose={() => setPromoteItem(null)} onPromoted={load} /> : null}
      {insightsItem ? <VerticalInsightsSheet listingType="meal" businessId={business.id} listing={insightsItem} onClose={() => setInsightsItem(null)} /> : null}
    </WorkspaceShell>
  );
}

function RestaurantForm({ formId, form, setForm, onSubmit, dayRules = null, limitNotice = null, onLimitNotice, onOpenPlans = null }) {
  useUiLocale();
  return (
    <form id={formId} onSubmit={onSubmit} className="grid gap-3 rounded-2xl bg-orange-50 p-4 sm:grid-cols-2">
      <Input label={t("urmall.biz.vert.mealName")} value={form.name} onChange={(value) => setForm({ ...form, name: value })} /><Input label={t("urmall.biz.cat.price")} type="number" value={form.price} onChange={(value) => setForm({ ...form, price: value })} />
      <Select label={t("urmall.biz.vert.mealPeriod")} value={form.meal_period} onChange={(value) => setForm({ ...form, meal_period: value })} options={["all_day", "breakfast", "lunch", "dinner", "drinks"]} labels={{ all_day: t("urmall.biz.vert.allDay"), breakfast: t("urmall.biz.vert.breakfast"), lunch: t("urmall.biz.vert.lunch"), dinner: t("urmall.biz.vert.dinner"), drinks: t("urmall.biz.vert.drinks") }} /><Input label={t("urmall.biz.vert.prepMinutes")} type="number" value={form.preparation_minutes} onChange={(value) => setForm({ ...form, preparation_minutes: value })} />
      <AvailabilityField form={form} setForm={setForm} rules={dayRules} onLimitNotice={onLimitNotice} />
      <PlanLimitNotice notice={limitNotice} limit={dayRules?.limit} onOpenPlans={onOpenPlans} />
      <TextArea label={t("urmall.detail.description")} value={form.description} onChange={(value) => setForm({ ...form, description: value })} />
      <VerticalMediaFields media={form} setMedia={setForm} accent="orange" noun="meal" />
      <PromoteToggleField form={form} setForm={setForm} />
    </form>
  );
}

function AvailabilityField({ form, setForm, rules = null, onLimitNotice }) {
  useUiLocale();
  const everyday = form.available_everyday !== false;
  const selected = (form.available_days || []).map(Number);
  const limit = rules?.limit ?? null;
  const check = (days) => checkMealDays({ limit, newDays: days, oldDays: rules?.oldDays || [], otherDays: rules?.otherDays || [] });
  const everydayLocked = limit !== null && !check([...ALL_WEEKDAYS]).allowed;
  const usedDays = limit !== null ? check(everyday ? [...ALL_WEEKDAYS] : selected).restaurantDays : 0;
  const toggleEveryday = () => {
    if (!everyday) {
      const result = check([...ALL_WEEKDAYS]);
      if (!result.allowed) { onLimitNotice?.({ reason: result.reason }); return; }
    }
    onLimitNotice?.(null);
    setForm({ ...form, available_everyday: !everyday });
  };
  const toggleDay = (index) => {
    const set = new Set(selected);
    const adding = !set.has(index);
    if (adding) set.add(index); else set.delete(index);
    const next = Array.from(set).sort((a, b) => a - b);
    if (adding) {
      const result = check(next);
      if (!result.allowed) { onLimitNotice?.({ reason: result.reason }); return; }
    }
    onLimitNotice?.(null);
    setForm({ ...form, available_days: next });
  };
  return (
    <div className="rounded-2xl border border-orange-100 bg-white p-3 sm:col-span-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-wide text-gray-500">{t("urmall.biz.vert.availability")}</p>
          <p className="mt-0.5 truncate text-sm font-black text-gray-900">{t("urmall.biz.vert.availableEveryday")}</p>
          {everydayLocked && !everyday ? <p className="mt-0.5 flex items-center gap-1 text-[11px] font-bold text-amber-700"><Lock size={11} className="shrink-0" />{t("urmallPlans2026.mealDays.everydayNeedsUpgrade")}</p> : null}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={everyday}
          aria-label={t("urmall.biz.vert.availableEveryday")}
          onClick={toggleEveryday}
          className={`relative h-7 w-12 shrink-0 rounded-full transition ${everyday ? "bg-orange-600" : "bg-gray-300"}`}
        >
          <span className={`absolute top-0.5 grid h-6 w-6 place-items-center rounded-full bg-white shadow transition-all ${everyday ? "left-[1.375rem]" : "left-0.5"}`} />
        </button>
      </div>
      {limit !== null ? <p className="mt-2 text-[11px] font-bold text-gray-500">{t("urmallPlans2026.mealDays.usage", { used: usedDays, limit })}</p> : null}
      {!everyday ? (
        <div className="mt-3">
          <p className="text-xs font-black text-gray-600">{t("urmall.biz.vert.selectDays")}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {DAYS.map((label, index) => {
              const active = selected.includes(index);
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => toggleDay(index)}
                  aria-pressed={active}
                  className={`min-w-[56px] rounded-xl border px-3 py-2 text-xs font-black transition ${active ? "border-orange-600 bg-orange-600 text-white" : "border-gray-200 bg-white text-gray-600"}`}
                >
                  {dayShort(index)}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// The plan limit explained inside the meal form, with the way to upgrade.
function PlanLimitNotice({ notice, limit, onOpenPlans }) {
  useUiLocale();
  if (!notice) return null;
  const dayLimit = notice.limit ?? limit ?? 5;
  const text = notice.reason === "meal"
    ? t("urmallPlans2026.mealDays.mealLimit", { limit: dayLimit })
    : notice.reason === "restaurant"
      ? t("urmallPlans2026.mealDays.restaurantLimit", { limit: dayLimit })
      : t("urmallPlans2026.limits.listingsFull", {
        plan: notice.planCode === "pro" ? "Pro" : notice.planCode === "premium" ? "Premium" : "Free",
        limit: notice.limit ?? 0,
        current: notice.current ?? 0,
      });
  return (
    <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-3 sm:col-span-2">
      <p className="flex items-start gap-2 text-xs font-semibold leading-5 text-amber-900"><Lock size={14} className="mt-0.5 shrink-0" />{text}</p>
      {onOpenPlans ? (
        <button type="button" onClick={onOpenPlans} className="mt-2 inline-flex min-h-9 items-center rounded-xl bg-orange-600 px-3 text-xs font-black text-white">
          {t("urmallPlans2026.mealDays.upgrade")}
        </button>
      ) : null}
    </div>
  );
}

// "Post & promote" is shown on create forms only. Its expanded state uses the
// same transparent budget and audience planner as retail product promotions.
function PromoteToggleField({ form, setForm }) {
  useUiLocale();
  if (form.id) return null;
  const on = Boolean(form.promote);
  return (
    <div className="rounded-2xl border border-emerald-100 bg-white p-3 sm:col-span-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-emerald-600 text-white"><Rocket size={16} /></span>
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-wide text-gray-500">{t("urmall.biz.vert.promote")}</p>
            <p className="mt-0.5 truncate text-sm font-black text-gray-900">{t("urmall.biz.vert.promoteSubtitle")}</p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={t("urmall.biz.vert.promote")}
          onClick={() => setForm({
            ...form,
            promote: !on,
            ...(!on ? normalizePromotionSettings(form) : {}),
            ...(!on && Object.prototype.hasOwnProperty.call(form, "published") ? { published: true } : {}),
          })}
          className={`relative h-7 w-12 shrink-0 rounded-full transition ${on ? "bg-emerald-600" : "bg-gray-300"}`}
        >
          <span className={`absolute top-0.5 grid h-6 w-6 place-items-center rounded-full bg-white shadow transition-all ${on ? "left-[1.375rem]" : "left-0.5"}`} />
        </button>
      </div>
      {on ? (
        <div className="mt-4">
          <PromotionSetupPanel
            title={t("urmall.biz.promo.setupTitle")}
            settings={form}
            onChange={(nextSettings) => setForm({ ...form, ...nextSettings })}
          />
        </div>
      ) : null}
    </div>
  );
}

function HotelDashboard({ business, canManage = true, initialWorkspace = null }) {
  useUiLocale();
  const hotelCacheKey = `hotel:${business.id}`;
  const emptyWorkspace = useMemo(() => ({ images: [], rooms: [], videoUrl: "" }), []);
  const overviewWorkspace = initialWorkspace?.businessId === business.id && initialWorkspace.kind === "hotel"
    ? { hasValue: true, value: initialWorkspace.data || emptyWorkspace }
    : null;
  const overviewWorkspaceRef = useRef(overviewWorkspace);
  const [workspace, setWorkspace] = useState(() => (overviewWorkspace || readSellerVerticalCache(hotelCacheKey, emptyWorkspace)).value);
  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadStage, setUploadStage] = useState("");
  const submissionLock = useRef(false);
  const [media, setMedia] = useState(createEmptyVerticalMedia);
  const activity = useVerticalActivity(business.id);
  const load = useCallback(async () => {
    const cached = overviewWorkspaceRef.current || readSellerVerticalCache(hotelCacheKey, emptyWorkspace);
    overviewWorkspaceRef.current = null;
    setWorkspace(cached.value);
    const nextWorkspace = await fetchHotelWorkspace(business.id);
    setWorkspace(rememberSellerVerticalData(hotelCacheKey, nextWorkspace));
    return nextWorkspace;
  }, [business.id, emptyWorkspace, hotelCacheKey]);
  useEffect(() => { load().catch((error) => showToast(shortErrorToast(error, "Couldn't load hotel"), "danger")); }, [load]);
  useOpenVerticalEditor(() => setFormOpen(true), canManage);

  async function save(event) {
    event.preventDefault();
    if (submissionLock.current) return;
    submissionLock.current = true;
    setSubmitting(true);
    try {
      await saveHotelMediaPackage(business.id, media, setUploadStage);
      setMedia(createEmptyVerticalMedia());
      setFormOpen(false);
      await load();
      notifyVerticalListingUpdated(business.id);
      haptics.medium("marketplace");
      sounds.success("marketplace");
      showToast("Added successfully", "success", urMallShareToastOptions());
    } catch (error) { showToast(shortErrorToast(error, "Couldn't add media"), "danger"); } finally { submissionLock.current = false; setSubmitting(false); setUploadStage(""); }
  }

  return (
    <WorkspaceShell icon={Hotel} eyebrow={t("urmall.biz.vert.hotelWorkspace")} title={business.name} subtitle={t("urmall.biz.vert.hotelSubtitle")} stats={[{ label: t("urmall.biz.vert.photos"), value: workspace.images.length }, { label: t("urmall.biz.vert.videoStat"), value: workspace.videoUrl ? t("urmall.biz.vert.ready") : t("urmall.biz.vert.missing") }, { label: t("urmall.biz.vert.roomTypes"), value: workspace.rooms.length }, { label: t("urmall.biz.vert.availableRooms"), value: workspace.rooms.reduce((sum, item) => sum + Number(item.rooms_available || 0), 0) }]}>
      <VerticalActivityStrip activity={activity} commerceLabel={t("urmall.biz.vert.bookings")} commerceValue={activity.bookings} />
      <section className="rounded-[26px] border border-gray-200 bg-white p-5 shadow-sm">
        <SectionHeading eyebrow={t("urmall.biz.vert.hotelProfile")} title={t("urmall.biz.vert.hotelImagesVideo")}>{canManage ? <PrimaryButton onClick={() => setFormOpen(true)} label={t("urmall.biz.vert.addHotel")} className="bg-blue-600" /> : null}</SectionHeading>
        <div className="mt-4 flex gap-3 overflow-x-auto pb-24">{workspace.images.map((image) => <div key={image.id} className="relative min-w-[240px]"><MediaImage src={image.image_url} alt={image.caption || t("urmall.biz.vert.hotelImage")} className="h-40 w-full rounded-2xl object-cover" icon={Hotel} /><div className="absolute right-2 top-2"><SellerItemActions label={image.caption || t("urmall.biz.vert.hotelImage")} canManage={canManage} shareUrl={image.image_url} onDelete={async () => { await deleteHotelImage(image); await load(); notifyVerticalListingUpdated(business.id); showToast(t("urmall.biz.vert.hotelImageDeleted"), "success"); }} /></div></div>)}{!workspace.images.length ? <EmptyState text={t("urmall.biz.vert.hotelEmpty")} /> : null}</div>
        {workspace.videoUrl ? <div className="relative mt-4"><video src={workspace.videoUrl} controls preload="metadata" className="max-h-72 w-full rounded-2xl bg-black" /><div className="absolute right-3 top-3"><SellerItemActions label={t("urmall.biz.vert.hotelVideoLabel", { name: business.name })} canManage={canManage} shareUrl={workspace.videoUrl} onDelete={async () => { await deleteHotelVideo(business.id, workspace.videoUrl); await load(); notifyVerticalListingUpdated(business.id); showToast(t("urmall.biz.vert.hotelVideoDeleted"), "success"); }} /></div></div> : null}
      </section>
      <BookingRequests bookings={activity.recentBookings} />
      <VerticalEditorSheet open={formOpen} onClose={() => setFormOpen(false)} title={t("urmall.biz.vert.addHotel")} subtitle={t("urmall.biz.vert.hotelGalleryVideo")} formId="hotel-media-form" actionLabel={t("urmall.biz.vert.addHotel")} processingLabel={t("urmall.biz.vert.adding")} processing={submitting} accentClass="bg-blue-600" uploadStage={uploadStage} uploadTitle={t("urmall.biz.vert.addingHotelMedia")}>
        <form id="hotel-media-form" onSubmit={save} className="grid gap-3 rounded-2xl bg-blue-50 p-4"><p className="text-sm font-semibold leading-6 text-blue-950">{t("urmall.biz.vert.hotelFormHint")}</p><VerticalMediaFields media={media} setMedia={setMedia} accent="blue" noun="hotel" /></form>
      </VerticalEditorSheet>
    </WorkspaceShell>
  );
}

function PropertyDashboard({ business, canManage = true, initialWorkspace = null }) {
  useUiLocale();
  const propertyCacheKey = `property:${business.id}`;
  const overviewListings = initialWorkspace?.businessId === business.id && initialWorkspace.kind === "property_agent"
    ? { hasValue: true, value: initialWorkspace.data || [] }
    : null;
  const initialListings = overviewListings || readSellerVerticalCache(propertyCacheKey, []);
  const overviewListingsRef = useRef(overviewListings);
  const [listings, setListings] = useState(() => initialListings.value);
  const [loading, setLoading] = useState(() => !initialListings.hasValue);
  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadStage, setUploadStage] = useState("");
  const [promoteItem, setPromoteItem] = useState(null);
  const [insightsItem, setInsightsItem] = useState(null);
  const submissionLock = useRef(false);
  const [form, setForm] = useState({ title: "", description: "", purpose: "rent", property_type: "house", price: "", rent_period: "month", bedrooms: 0, bathrooms: 0, furnished: false, parking_spaces: 0, land_size: "", land_size_unit: "plots", floor_area: "", floor_area_unit: "sqm", rooms: 0, star_rating: "", address: "", city: business.location || "", latitude: "", longitude: "", amenitiesText: "", published: true, ...createEmptyVerticalMedia() });
  const editingProperty = Boolean(form.id);
  const activity = useVerticalActivity(business.id);
  const load = useCallback(async () => {
    const cached = overviewListingsRef.current || readSellerVerticalCache(propertyCacheKey, []);
    overviewListingsRef.current = null;
    setListings(cached.value);
    setLoading(!cached.hasValue);
    try {
      const nextListings = await fetchPropertyListings(business.id);
      setListings(rememberSellerVerticalData(propertyCacheKey, nextListings));
      return nextListings;
    } finally {
      setLoading(false);
    }
  }, [business.id, propertyCacheKey]);
  useEffect(() => { load().catch((error) => showToast(shortErrorToast(error, "Couldn't load property"), "danger")); }, [load]);
  const openNewProperty = useCallback(() => {
    setForm({ title: "", description: "", purpose: "rent", property_type: "house", price: "", rent_period: "month", bedrooms: 0, bathrooms: 0, furnished: false, parking_spaces: 0, land_size: "", land_size_unit: "plots", floor_area: "", floor_area_unit: "sqm", rooms: 0, star_rating: "", address: "", city: business.location || "", latitude: "", longitude: "", amenitiesText: "", published: true, ...createEmptyVerticalMedia() });
    setFormOpen(true);
  }, [business.location]);
  useOpenVerticalEditor(openNewProperty, canManage);
  useRetentionInventoryRefresh(business.id, load);

  function editProperty(item) {
    setForm({
      ...item,
      amenitiesText: (item.amenities || []).join(", "),
      image_urls: item.image_urls || [],
      video_url: item.video_url || "",
      ...createEmptyVerticalMedia(),
    });
    setFormOpen(true);
  }
  const counts = useMemo(() => ({ available: listings.filter((item) => item.availability_status === "available").length, published: listings.filter((item) => item.published).length }), [listings]);

  async function save(event) {
    event.preventDefault();
    if (submissionLock.current) return;
    submissionLock.current = true;
    setSubmitting(true);
    try {
      const wasEditing = editingProperty;
      const promotionSettings = normalizePromotionSettings(form);
      if (!wasEditing && form.promote) {
        await assertVisibilityCreditsAvailable(promotionSettings.promotionCredits);
      }
      const saved = await savePropertyListing(business.id, form, setUploadStage);
      // Post & promote: boost the freshly created property (best-effort).
      if (!wasEditing && form.promote && saved?.id) {
        try {
          await promoteVerticalListing("property", { id: saved.id, name: saved.title }, {
            credits: promotionSettings.promotionCredits,
            audience: promotionSettings.promotionAudience,
            regionMode: promotionSettings.promotionRegionMode,
            regions: promotionSettings.promotionRegions,
            countries: promotionSettings.promotionCountries,
          });
        } catch (promoError) {
          showToast(shortErrorToast(promoError, "Boost couldn't start"), "danger");
        }
      }
      setForm({ title: "", description: "", purpose: "rent", property_type: "house", price: "", rent_period: "month", bedrooms: 0, bathrooms: 0, furnished: false, parking_spaces: 0, land_size: "", land_size_unit: "plots", floor_area: "", floor_area_unit: "sqm", rooms: 0, star_rating: "", address: "", city: business.location || "", latitude: "", longitude: "", amenitiesText: "", published: true, ...createEmptyVerticalMedia() });
      setFormOpen(false);
      await load();
      notifyVerticalListingUpdated(business.id);
      haptics.medium("marketplace");
      sounds.success("marketplace");
      showToast(wasEditing ? "Updated successfully" : "Added successfully", "success", urMallShareToastOptions());
    } catch (error) { showToast(shortErrorToast(error, "Couldn't save property"), "danger"); } finally { submissionLock.current = false; setSubmitting(false); setUploadStage(""); }
  }

  return (
    <WorkspaceShell icon={House} eyebrow={t("urmall.biz.vert.propertyWorkspace")} title={business.name} subtitle={t("urmall.biz.vert.propertySubtitle")} stats={[{ label: t("urmall.biz.vert.listings"), value: listings.length }, { label: t("urmall.biz.vert.available"), value: counts.available }, { label: t("urmall.biz.vert.published"), value: counts.published }, { label: t("urmall.biz.vert.drafts"), value: listings.filter((item) => !item.published).length }]}>
      <VerticalActivityStrip activity={activity} commerceLabel={t("urmall.biz.vert.bookings")} commerceValue={activity.bookings} />
      <section className="rounded-[26px] border border-gray-200 bg-white p-5 shadow-sm">
        <SectionHeading eyebrow={t("urmall.biz.vert.propertyDesk")} title={t("urmall.biz.vert.propertiesEnquiries")}>{canManage ? <PrimaryButton onClick={openNewProperty} label={t("urmall.biz.vert.addProperty")} className="bg-violet-700" /> : null}</SectionHeading>
        <div className="mt-5 grid gap-4 md:grid-cols-2" aria-busy={loading || undefined}>{loading ? <VerticalListingsSkeleton variant="property" /> : listings.map((item) => <PropertyListingCard key={item.id} item={item} business={business} canManage={canManage} onEdit={() => editProperty(item)} onInsights={() => setInsightsItem(item)} onPromote={() => setPromoteItem(item)} onDelete={async () => { await deletePropertyListing(item); await load(); notifyVerticalListingUpdated(business.id); showToast(t("urmall.biz.vert.propertyDeleted"), "success"); }} />)}</div>
        {!loading && !listings.length ? <EmptyState text={t("urmall.biz.vert.propertyEmpty")} /> : null}
      </section>
      <BookingRequests bookings={activity.recentBookings} />
      <VerticalEditorSheet open={formOpen} onClose={() => setFormOpen(false)} title={editingProperty ? t("urmall.biz.vert.editProperty") : t("urmall.biz.vert.addProperty")} subtitle={t("urmall.biz.vert.propertyListing")} formId="property-listing-form" actionLabel={editingProperty ? t("urmall.biz.vert.saveChanges") : form.promote ? t("urmall.biz.pform.pubPromote") : t("urmall.biz.vert.addProperty")} processingLabel={editingProperty ? t("urmall.biz.vert.saving") : t("urmall.biz.vert.adding")} processing={submitting} accentClass="bg-violet-700" uploadStage={uploadStage} uploadTitle={t("urmall.biz.vert.addingProperty")}>
        <PropertyForm formId="property-listing-form" form={form} setForm={setForm} onSubmit={save} />
      </VerticalEditorSheet>
      {promoteItem ? <VerticalPromoteSheet listingType="property" listing={promoteItem} onClose={() => setPromoteItem(null)} onPromoted={load} /> : null}
      {insightsItem ? <VerticalInsightsSheet listingType="property" businessId={business.id} listing={insightsItem} onClose={() => setInsightsItem(null)} /> : null}
    </WorkspaceShell>
  );
}

const RESIDENTIAL_TYPES = ["house", "apartment"];

// Each property type reads differently, so the description prompt is tailored
// rather than a single generic one.
function propertyDescriptionPlaceholder(type) {
  if (type === "land") return t("urmall.biz.vert.descPhLand");
  if (type === "commercial") return t("urmall.biz.vert.descPhCommercial");
  if (type === "hotel") return t("urmall.biz.vert.descPhHotel");
  if (type === "apartment") return t("urmall.biz.vert.descPhApartment");
  return t("urmall.biz.vert.descPhHouse");
}

function propertyAmenitiesPlaceholder(type) {
  if (type === "land") return t("urmall.biz.vert.amenitiesPhLand");
  if (type === "commercial") return t("urmall.biz.vert.amenitiesPhCommercial");
  if (type === "hotel") return t("urmall.biz.vert.amenitiesPhHotel");
  return t("urmall.biz.vert.amenitiesPhResidential");
}

// The property type is the first choice; every field beneath it is shown or
// hidden based on that type so a land listing never asks for bedrooms, etc.
function PropertyForm({ formId, form, setForm, onSubmit }) {
  useUiLocale();
  const type = form.property_type || "house";
  const isResidential = RESIDENTIAL_TYPES.includes(type);
  const isLand = type === "land";
  const isCommercial = type === "commercial";
  const isHotel = type === "hotel";
  const hasFloorArea = isCommercial || isHotel;
  const isRent = form.purpose === "rent";

  const update = (patch) => setForm({ ...form, ...patch });
  // Switching type clears fields that do not apply to the new type so stale
  // values (e.g. bedrooms left over from a house) never save onto land.
  const changeType = (next) => update({ property_type: next, bedrooms: 0, bathrooms: 0, furnished: false, parking_spaces: 0, land_size: "", floor_area: "", rooms: 0, star_rating: "" });

  return (
    <form id={formId} onSubmit={onSubmit} className="grid gap-3 rounded-2xl bg-violet-50 p-4 sm:grid-cols-2">
      <Select full label={t("urmall.biz.vert.propertyType")} hint={t("urmall.biz.vert.propertyTypeHint")} value={type} onChange={changeType} options={["house", "apartment", "land", "commercial", "hotel"]} labels={{ house: t("urmall.biz.vert.house"), apartment: t("urmall.biz.vert.apartment"), land: t("urmall.biz.vert.land"), commercial: t("urmall.biz.vert.commercial"), hotel: t("urmall.biz.vert.hotelType") }} />

      <FormSectionLabel label={t("urmall.biz.vert.secBasics")} />
      <Input full label={t("urmall.biz.vert.propertyTitle")} value={form.title} onChange={(value) => update({ title: value })} placeholder={t("urmall.biz.vert.propertyTitlePh")} />
      <Select label={t("urmall.biz.vert.purpose")} value={form.purpose} onChange={(value) => update({ purpose: value })} options={["rent", "sale"]} labels={{ rent: t("urmall.biz.vert.rent"), sale: t("urmall.biz.vert.sale") }} />
      <Input label={t("urmall.biz.cat.price")} type="number" min="0" value={form.price} onChange={(value) => update({ price: value })} />
      {isRent ? <Select label={t("urmall.biz.vert.rentPeriod")} value={form.rent_period || "month"} onChange={(value) => update({ rent_period: value })} options={["day", "week", "month", "year"]} labels={{ day: t("urmall.biz.vert.perDay"), week: t("urmall.biz.vert.perWeek"), month: t("urmall.biz.vert.perMonth"), year: t("urmall.biz.vert.perYear") }} /> : null}

      <FormSectionLabel label={t("urmall.biz.vert.secDetails")} />
      {isResidential ? (
        <>
          <Input label={t("urmall.biz.vert.bedrooms")} type="number" min="0" value={form.bedrooms} onChange={(value) => update({ bedrooms: value })} />
          <Input label={t("urmall.biz.vert.bathrooms")} type="number" min="0" value={form.bathrooms} onChange={(value) => update({ bathrooms: value })} />
          <Input required={false} label={t("urmall.biz.vert.parkingSpaces")} type="number" min="0" value={form.parking_spaces} onChange={(value) => update({ parking_spaces: value })} />
        </>
      ) : null}
      {isLand ? (
        <>
          <Input required={false} label={t("urmall.biz.vert.landSize")} type="number" min="0" value={form.land_size} onChange={(value) => update({ land_size: value })} />
          <Select label={t("urmall.biz.vert.landSizeUnit")} value={form.land_size_unit || "plots"} onChange={(value) => update({ land_size_unit: value })} options={["plots", "sqm", "acres", "hectares", "sqft"]} labels={{ plots: t("urmall.biz.vert.unitPlots"), sqm: t("urmall.biz.vert.unitSqm"), acres: t("urmall.biz.vert.unitAcres"), hectares: t("urmall.biz.vert.unitHectares"), sqft: t("urmall.biz.vert.unitSqft") }} />
        </>
      ) : null}
      {isHotel ? (
        <>
          <Input required={false} label={t("urmall.biz.vert.rooms")} type="number" min="0" value={form.rooms} onChange={(value) => update({ rooms: value })} />
          <Input required={false} label={t("urmall.biz.vert.starRating")} hint={t("urmall.biz.vert.starRatingHint")} type="number" min="1" max="5" value={form.star_rating} onChange={(value) => update({ star_rating: value })} />
          <Input required={false} label={t("urmall.biz.vert.parkingSpaces")} type="number" min="0" value={form.parking_spaces} onChange={(value) => update({ parking_spaces: value })} />
        </>
      ) : null}
      {isCommercial ? (
        <>
          <Input label={t("urmall.biz.vert.bathrooms")} type="number" min="0" value={form.bathrooms} onChange={(value) => update({ bathrooms: value })} />
          <Input required={false} label={t("urmall.biz.vert.parkingSpaces")} type="number" min="0" value={form.parking_spaces} onChange={(value) => update({ parking_spaces: value })} />
        </>
      ) : null}
      {hasFloorArea ? (
        <>
          <Input required={false} label={t("urmall.biz.vert.floorArea")} type="number" min="0" value={form.floor_area} onChange={(value) => update({ floor_area: value })} />
          <Select label={t("urmall.biz.vert.floorAreaUnit")} value={form.floor_area_unit || "sqm"} onChange={(value) => update({ floor_area_unit: value })} options={["sqm", "sqft"]} labels={{ sqm: t("urmall.biz.vert.unitSqm"), sqft: t("urmall.biz.vert.unitSqft") }} />
        </>
      ) : null}
      <Input full required={false} label={t("urmall.biz.vert.amenitiesLabel")} value={form.amenitiesText} onChange={(value) => update({ amenitiesText: value })} placeholder={propertyAmenitiesPlaceholder(type)} hint={t("urmall.biz.vert.amenitiesHint")} />
      {isResidential || isCommercial ? <CheckboxRow checked={form.furnished} onChange={(value) => update({ furnished: value })} label={t(isCommercial ? "urmall.biz.vert.fitted" : "urmall.biz.vert.furnishedLabel")} /> : null}

      <FormSectionLabel label={t("urmall.biz.vert.secLocation")} />
      <AddressLocationField
        value={{ address: form.address, city: form.city, latitude: form.latitude, longitude: form.longitude }}
        onChange={(patch) => update(patch)}
      />
      <Input full label={t("urmall.biz.vert.cityArea")} value={form.city} onChange={(value) => update({ city: value })} />

      <FormSectionLabel label={t("urmall.biz.vert.secDescription")} />
      <TextArea label={t("urmall.detail.description")} value={form.description} onChange={(value) => update({ description: value })} placeholder={propertyDescriptionPlaceholder(type)} />
      <VerticalMediaFields media={form} setMedia={setForm} accent="violet" noun="property" />
      <CheckboxRow checked={form.published} onChange={(value) => update({ published: value, ...(!value ? { promote: false } : {}) })} label={t("urmall.biz.vert.publishToMarketplace")} />
      <PromoteToggleField form={form} setForm={setForm} />
    </form>
  );
}

function VerticalEditorSheet({ accentClass, actionLabel, children, formId, onClose, open, processing, processingLabel, subtitle, title, uploadStage = "", uploadTitle = t("urmall.biz.vert.addingListing") }) {
  useUiLocale();
  useBodyScrollLock(open);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[1200] flex items-end" role="presentation">
      <button type="button" aria-label={t("urmall.biz.vert.closeSheet", { title })} disabled={processing} onClick={onClose} className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px] disabled:cursor-wait" />
      <section role="dialog" aria-modal="true" aria-labelledby={`${formId}-title`} className="relative z-10 flex h-[68dvh] min-h-[420px] w-full flex-col overflow-hidden rounded-t-[30px] bg-white shadow-2xl">
        <header className="flex shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-4 py-3 sm:px-6">
          <button type="button" onClick={onClose} disabled={processing} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gray-100 text-gray-700 disabled:opacity-40" aria-label={t("urmall.biz.vert.closeSheet", { title })}><X size={19} /></button>
          <div className="min-w-0 flex-1"><p className="truncate text-xs font-black uppercase tracking-wide text-emerald-700">{translateUi(subtitle)}</p><h2 id={`${formId}-title`} className="truncate text-lg font-black text-gray-950">{translateUi(title)}</h2></div>
          <button type="submit" form={formId} disabled={processing} className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-black text-white shadow-sm disabled:cursor-wait disabled:opacity-70 ${accentClass}`}>
            {processing ? <LoaderCircle size={16} className="animate-spin" /> : <Plus size={16} />}
            {processing ? processingLabel : actionLabel}
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] sm:p-6">{children}</div>
        {processing && uploadStage ? (
          <div className="absolute inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-20 mx-auto max-w-md">
            <ListingUploadProgressCard stage={uploadStage} title={translateUi(uploadTitle)} />
          </div>
        ) : null}
      </section>
    </div>,
    document.body,
  );
}

function VerticalActivityStrip({ activity, commerceLabel, commerceValue }) {
  useUiLocale();
  const items = [
    { label: t("urmall.biz.vert.reviews"), value: activity.reviews, icon: Star, tone: "bg-amber-50 text-amber-700" },
    { label: t("urmall.biz.vert.messages"), value: activity.messages, icon: MessageCircle, tone: "bg-sky-50 text-sky-700" },
    { label: commerceLabel, value: commerceValue, icon: PackageCheck, tone: "bg-emerald-50 text-emerald-700" },
  ];
  return <section className="grid grid-cols-3 gap-2 rounded-[24px] border border-gray-200 bg-white p-3 shadow-sm">{items.map(({ icon: Icon, label, tone, value }) => <div key={label} className="flex min-w-0 items-center gap-2 rounded-2xl bg-gray-50 p-3"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${tone}`}><Icon size={17} /></span><div className="min-w-0"><p className="text-lg font-black text-gray-950">{value}</p><p className="truncate text-[10px] font-black uppercase tracking-wide text-gray-500">{translateUi(label)}</p></div></div>)}</section>;
}

function BookingRequests({ bookings = [] }) {
  useUiLocale();
  if (!bookings.length) return null;
  return <section className="rounded-[26px] border border-gray-200 bg-white p-5 shadow-sm"><SectionHeading eyebrow={t("urmall.biz.vert.buyerActivity")} title={t("urmall.biz.vert.recentBookings")} /><div className="mt-4 grid gap-3 md:grid-cols-2">{bookings.map((booking) => <article key={booking.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-black text-gray-950">{booking.listing_name || t("urmall.biz.vert.bookingRequest")}</h3><p className="mt-1 text-sm font-bold text-gray-600">{booking.buyer_name} · {booking.phone}</p></div><span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black uppercase text-amber-800">{translateUi(booking.status)}</span></div><p className="mt-3 flex items-center gap-2 text-xs font-black text-gray-600"><CalendarDays size={15} /> {booking.start_date}{booking.end_date ? t("urmall.biz.vert.dateRangeTo", { end: booking.end_date }) : ""}</p>{booking.note ? <p className="mt-2 text-sm font-semibold leading-5 text-gray-500">{booking.note}</p> : null}</article>)}</div></section>;
}

function useOpenVerticalEditor(open, enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;
    // Replay a request that arrived before this editor finished mounting (e.g.
    // the header "+" tapped while the dashboard was still remounting after a
    // business switch).
    if (consumePendingVerticalEditor()) open();
    const handleRequest = () => {
      consumePendingVerticalEditor();
      open();
    };
    return subscribeVerticalEditor(handleRequest);
  }, [open, enabled]);
}
function DaySelector({ day, setDay }) {
  useUiLocale(); return <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{DAYS.map((label, index) => <button key={label} type="button" onClick={() => setDay(index)} className={`min-w-[92px] rounded-2xl border px-3 py-3 text-sm font-black ${day === index ? "border-orange-600 bg-orange-600 text-white" : "border-gray-200 bg-white text-gray-600"}`}>{dayShort(index)}</button>)}</div>; }
function SectionHeading({ children, eyebrow, title }) {
  useUiLocale(); return <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wide text-emerald-700">{eyebrow}</p><h2 className="mt-1 text-xl font-black text-gray-950">{translateUi(title)}</h2></div>{children}</div>; }
function PrimaryButton({ className, label, onClick }) {
  useUiLocale(); return <button type="button" onClick={onClick} className={`flex h-11 shrink-0 items-center gap-2 rounded-2xl px-4 text-sm font-black text-white ${className}`}><Plus size={18} /> {translateUi(label)}</button>; }
function VerticalListingsSkeleton({ variant = "property" }) {
  useUiLocale();
  return [0, 1].map((item) => (
    <article key={item} className="overflow-hidden rounded-2xl border border-gray-200 bg-white" data-loading-region={`${variant}-listing`}>
      {variant === "property" ? <div className="kt-startup-shimmer h-44 w-full" /> : null}
      <div className={`flex gap-3 p-3 ${variant === "meal" ? "pr-14" : "p-4"}`}>
        {variant === "meal" ? <div className="kt-startup-shimmer h-20 w-20 shrink-0 rounded-xl" /> : null}
        <div className="min-w-0 flex-1 space-y-2.5 py-1">
          <div className="kt-startup-shimmer h-4 w-4/5 rounded-full" />
          <div className="kt-startup-shimmer h-3 w-3/5 rounded-full" />
          <div className="kt-startup-shimmer h-3 w-2/5 rounded-full" />
        </div>
      </div>
    </article>
  ));
}
function MealCard({ business, item, canManage = true, onDelete, onEdit, onInsights, onPromote, onToggle }) {
  useUiLocale();
  const gallery = item.image_urls || [];
  return <article className="relative rounded-2xl border border-gray-200 p-3 pr-14"><div className="absolute right-3 top-3 z-10 flex flex-col items-center gap-2"><SellerItemActions label={item.name} canManage={canManage} shareUrl={buildShareUrl("meal", item.id)} onDelete={onDelete} onEdit={onEdit} onInsights={onInsights} onPromote={onPromote} />{canManage ? <button type="button" onClick={onToggle} className={item.available ? "text-emerald-600" : "text-gray-400"} aria-label={item.available ? t("urmall.biz.vert.hideItem", { name: item.name }) : t("urmall.biz.vert.showItem", { name: item.name })}>{item.available ? <ToggleRight /> : <ToggleLeft />}</button> : null}</div><div className="flex gap-3"><MediaImage src={item.image_url} alt={item.name} className="h-20 w-20 shrink-0 rounded-xl object-cover" icon={UtensilsCrossed} /><div className="min-w-0 flex-1"><h3 className="truncate font-black text-gray-950">{item.name}</h3><p className="mt-1 text-sm font-black text-gray-800">{business.currency} {Number(item.price).toLocaleString()}</p><p className="mt-2 flex items-center gap-1 text-xs font-bold text-gray-500"><Clock3 size={14} /> {t("urmall.biz.vert.minutes", { n: item.preparation_minutes })}</p><p className="mt-1 flex flex-wrap items-center gap-1 text-[11px] font-black text-orange-600"><CalendarDays size={13} /> {item.available_everyday !== false ? t("urmall.biz.vert.everydayBadge") : (Array.isArray(item.available_days) && item.available_days.length ? item.available_days.map(Number).sort((a, b) => a - b).map((d) => dayShort(d)).join(", ") : dayShort(item.day_of_week))}</p></div></div>{gallery.length || item.video_url ? <div className="mt-3 flex gap-2 overflow-x-auto border-t border-gray-100 pt-3">{gallery.slice(0, 5).map((image, index) => <MediaImage key={`${image}-${index}`} src={image} alt={`${item.name} ${index + 2}`} className="h-12 w-12 shrink-0 rounded-lg object-cover" icon={UtensilsCrossed} />)}{item.video_url ? <div className="flex h-12 min-w-24 shrink-0 items-center justify-center gap-1 rounded-lg bg-slate-950 px-2 text-xs font-black text-white"><Film size={15} /> {t("urmall.biz.vert.video")}</div> : null}</div> : null}</article>;
}

function PropertyListingCard({ business, item, canManage = true, onDelete, onEdit, onInsights, onPromote }) {
  useUiLocale();
  const listingState = item.published ? t("urmall.biz.vert.published") : t("urmall.biz.vert.draft");
  item.authorization_status = listingState;
  return <article className="relative rounded-2xl border border-gray-200 bg-white"><div className="absolute right-3 top-3 z-10"><SellerItemActions label={item.title} canManage={canManage} shareUrl={buildShareUrl("property", item.id)} onDelete={onDelete} onEdit={onEdit} onInsights={onInsights} onPromote={onPromote} /></div><MediaImage src={item.image_urls?.[0]} alt={item.title} className="h-44 w-full rounded-t-2xl object-cover" icon={House} /><div className="p-4"><span className="rounded-full bg-violet-50 px-2 py-1 text-[11px] font-black uppercase text-violet-700">{t("urmall.biz.vert.forPurpose", { purpose: t(`urmall.biz.vert.${item.purpose}`) })}</span><h3 className="mt-3 truncate pr-8 text-lg font-black">{item.title}</h3><p className="mt-1 flex items-center gap-1 text-sm font-bold text-gray-500"><MapPin size={15} /> {item.address}</p><div className="mt-3 flex gap-3 text-xs font-bold text-gray-500"><span className="flex gap-1"><BedDouble size={15} /> {item.bedrooms}</span><span className="flex gap-1"><Bath size={15} /> {item.bathrooms}</span><strong className="ml-auto text-gray-950">{business.currency} {Number(item.price).toLocaleString()}</strong></div><div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-black text-gray-500"><span>{item.authorization_status}</span><span>·</span><span>{t("urmall.biz.vert.imagesCount", { count: item.image_urls?.length || 0 })}</span>{item.video_url ? <><span>·</span><span className="flex items-center gap-1"><Film size={13} /> {t("urmall.biz.vert.video")}</span></> : null}</div></div></article>;
}

function MediaImage({ alt, className, icon: Icon, src }) {
  useUiLocale();
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <span role="img" aria-label={t("urmall.biz.vert.imageUnavailable", { alt: alt || t("urmall.biz.vert.listing") })} className={`grid place-items-center bg-slate-100 text-slate-400 ${className}`}><Icon size={28} /></span>;
  return <img src={resizedImageUrl(src, { width: 720, quality: 72 })} alt={alt} className={className} onError={() => setFailed(true)} />;
}

function buildShareUrl(type, id) { if (typeof window === "undefined") return ""; return `${window.location.origin}${window.location.pathname}#urmall-${type}-${id}`; }

function SellerItemActions({ label, canManage = true, onDelete, onEdit, onInsights, onPromote, shareUrl }) {
  useUiLocale();
  const plan = useContext(VerticalPlanContext);
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function copyLink() {
    try { await navigator.clipboard.writeText(await decorateShareUrl(shareUrl)); showToast("Link has been copied", "success"); } catch { showToast(t("urmall.biz.vert.copyFailed"), "danger"); }
    setOpen(false);
  }

  async function share() {
    try {
      const decoratedUrl = await decorateShareUrl(shareUrl);
      if (navigator.share) await navigator.share({ title: label, text: t("urmall.biz.vert.shareText", { label }), url: decoratedUrl });
      else await navigator.clipboard.writeText(decoratedUrl);
      showToast(navigator.share ? t("urmall.biz.vert.shared") : t("urmall.biz.vert.linkCopiedShare"), "success");
    } catch (error) { if (error?.name !== "AbortError") showToast("Couldn't share item", "danger"); }
    setOpen(false);
  }

  async function remove() {
    setDeleting(true);
    try { await onDelete?.(); setOpen(false); setConfirmDelete(false); } catch (error) { showToast(shortErrorToast(error, "Couldn't delete item"), "danger"); } finally { setDeleting(false); }
  }

  return <><button type="button" onClick={() => setOpen(true)} className="grid h-10 w-10 place-items-center rounded-full border border-white/70 bg-slate-950/80 text-white shadow-lg backdrop-blur-md transition hover:bg-slate-950" aria-label={t("urmall.biz.vert.actionsFor", { label })}><MoreVertical size={19} /></button>{open ? createPortal(<div className="fixed inset-0 z-[1350]" role="presentation"><button type="button" aria-label={t("urmall.biz.vert.closeItemActions")} onClick={() => { setOpen(false); setConfirmDelete(false); }} className="absolute inset-0 bg-slate-950/35 backdrop-blur-[1px]" /><section role="dialog" aria-modal="true" aria-label={t("urmall.biz.vert.actionsFor", { label })} className="kt-detail-zoom-enter absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] right-3 left-auto w-56 max-w-[calc(100vw-1.5rem)] rounded-2xl border border-white/70 bg-white p-1.5 shadow-2xl sm:right-4 sm:w-60"><div className="mb-0.5 flex items-center justify-between gap-2 px-2 py-1"><p className="truncate text-sm font-black text-gray-950">{translateUi(label)}</p><button type="button" onClick={() => setOpen(false)} className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gray-100 text-gray-600" aria-label={t("urmall.biz.vert.closeActions")}><X size={15} /></button></div>{canManage && onInsights ? <button type="button" onClick={() => { setOpen(false); onInsights(); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-black text-gray-700 hover:bg-gray-50"><BarChart3 size={17} /> <span className="truncate">{t("urmall.biz.intel.insightsTab")}</span>{plan.insightsLocked ? <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-emerald-700"><Lock size={10} strokeWidth={2.6} />Pro</span> : null}</button> : null}{canManage && onEdit ? <button type="button" onClick={() => { setOpen(false); onEdit(); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-black text-gray-700 hover:bg-gray-50"><Pencil size={17} /> {t("urmall.biz.reg.edit")}</button> : null}<button type="button" onClick={copyLink} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-black text-gray-700 hover:bg-gray-50"><Copy size={17} /> {t("urmall.biz.vert.copyLink")}</button><button type="button" onClick={share} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-black text-gray-700 hover:bg-gray-50"><Share2 size={17} /> {t("urmall.biz.vert.share")}</button>{canManage && onPromote ? <button type="button" onClick={() => { setOpen(false); onPromote(); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-black text-emerald-700 hover:bg-emerald-50"><Rocket size={17} /> {t("urmall.biz.vert.promote")}</button> : null}{canManage ? (confirmDelete ? <div className="mt-1 rounded-xl bg-red-50 p-3"><p className="text-xs font-bold text-red-700">{t("urmall.biz.vert.deletePermanently")}</p><div className="mt-2 grid grid-cols-2 gap-2"><button type="button" onClick={() => setConfirmDelete(false)} className="rounded-lg bg-white px-2 py-2 text-xs font-black text-gray-700">{t("urmall.biz.vert.cancel")}</button><button type="button" disabled={deleting} onClick={remove} className="rounded-lg bg-red-600 px-2 py-2 text-xs font-black text-white disabled:opacity-60">{deleting ? t("urmall.biz.vert.deleting") : t("urmall.biz.vert.delete")}</button></div></div> : <button type="button" onClick={() => setConfirmDelete(true)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-black text-red-600 hover:bg-red-50"><Trash2 size={17} /> {t("urmall.biz.vert.delete")}</button>) : null}</section></div>, document.body) : null}</>;
}
// Meals and properties use the same promotion planner as retail products. The
// actual credit assertion and spend still happen server-side.
function VerticalPromoteSheet({ listingType, listing, onClose, onPromoted }) {
  useUiLocale();
  useBodyScrollLock(true);
  const [settings, setSettings] = useState(() => normalizePromotionSettings({ audience: "recommended" }));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const name = listing?.name || listing?.title || "";

  async function confirm(nextSettings) {
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      await promoteVerticalListing(listingType, listing, {
        credits: nextSettings.promotionCredits,
        audience: nextSettings.promotionAudience,
        regionMode: nextSettings.promotionRegionMode,
        regions: nextSettings.promotionRegions,
        countries: nextSettings.promotionCountries,
      });
      haptics.medium("marketplace");
      sounds.success("marketplace");
      showToast("Product is now boosted", "success", urMallShareToastOptions());
      onPromoted?.();
      onClose?.();
    } catch (err) {
      setError(inlineErrorMessage(err, t("urmall.biz.vert.promoteFailed")));
    } finally {
      setSubmitting(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[1360]" role="presentation">
      <button type="button" aria-label={t("urmall.biz.vert.closeActions")} onClick={onClose} className="absolute inset-0 bg-slate-950/45 backdrop-blur-[1px]" />
      <section role="dialog" aria-modal="true" aria-label={t("urmall.biz.vert.promoteTitle")} className="kt-detail-zoom-enter absolute inset-x-0 bottom-0 mx-auto max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-[28px] border border-white/70 bg-white p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-emerald-600 text-white"><Rocket size={20} /></span>
            <div className="min-w-0">
              <h3 className="text-lg font-black text-gray-950">{t("urmall.biz.vert.promoteTitle")}</h3>
              <p className="truncate text-xs font-bold text-gray-500">{name}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gray-100 text-gray-600" aria-label={t("urmall.biz.vert.closeActions")}><X size={16} /></button>
        </div>
        <div className="mt-4">
          <PromotionSetupPanel
            title={t("urmall.biz.promo.setupTitle")}
            settings={settings}
            onChange={setSettings}
            onConfirm={confirm}
            confirmLabel={t("urmall.biz.vert.promoteConfirm")}
            submitting={submitting}
            error={error}
          />
        </div>
      </section>
    </div>,
    document.body,
  );
}
// Vertical listings reuse the retail ProductInsightsScreen, fed by the vertical
// insights fetcher so the seller sees the same insight layout for meals and
// properties as for retail products.
function VerticalInsightsSheet({ listingType, businessId, listing, onClose }) {
  useUiLocale();
  useBodyScrollLock(true);
  const plan = useContext(VerticalPlanContext);
  const fetchInsights = useCallback(() => fetchVerticalListingInsights(listingType, listing), [listingType, listing]);
  const name = listing?.name || listing?.title || "";
  // Must be referentially stable: ProductInsightsScreen refetches when its
  // product changes, and a fresh object literal every render made the sheet
  // flash back to the skeleton in an endless reload loop.
  const insightsProduct = useMemo(
    () => ({ id: listing.id, name, mainImageUrl: listing.image_url || listing.image_urls?.[0] || "", views: listing.views }),
    [listing.id, listing.image_url, listing.image_urls, listing.views, name],
  );
  const insightsScreen = <ProductInsightsScreen product={insightsProduct} fetchInsights={fetchInsights} />;

  return createPortal(
    <div className="fixed inset-0 z-[1360]" role="presentation">
      <button type="button" aria-label={t("urmall.biz.vert.closeActions")} onClick={onClose} className="absolute inset-0 bg-slate-950/45 backdrop-blur-[1px]" />
      <section role="dialog" aria-modal="true" aria-label={t("urmall.biz.intel.insightsTab")} className="kt-detail-zoom-enter absolute inset-x-0 bottom-0 mx-auto max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-[28px] border border-white/70 bg-white p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-sky-600 text-white"><BarChart3 size={20} /></span>
            <div className="min-w-0">
              <h3 className="text-lg font-black text-gray-950">{t("urmall.biz.intel.insightsTab")}</h3>
              <p className="truncate text-xs font-bold text-gray-500">{name}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gray-100 text-gray-600" aria-label={t("urmall.biz.vert.closeActions")}><X size={16} /></button>
        </div>
        <div className="mt-4">
          {plan.plansEnabled ? (
            <PlanFeatureGate
              surface="urmall"
              entityId={businessId}
              requiredTier="pro"
              featureName={t("urmall.biz.intel.insightsTab")}
              description={i18nText("ui.literals.kfe48d0530221")}
              onOpenPlans={plan.onOpenPlans ? () => { onClose(); plan.onOpenPlans(); } : undefined}
            >
              {insightsScreen}
            </PlanFeatureGate>
          ) : insightsScreen}
        </div>
      </section>
    </div>,
    document.body,
  );
}

function FieldHint({ hint }) {
  useUiLocale(); return hint ? <span className="mt-1 block text-[11px] font-semibold leading-4 text-gray-400">{translateUi(hint)}</span> : null; }
function Input({ full = false, hint, label, max, min, onChange, placeholder = "", required = true, type = "text", value }) {
  useUiLocale(); return <label className={full ? "sm:col-span-2" : undefined}><span className="text-xs font-black text-gray-600">{translateUi(label)}</span><input required={required} type={type} min={min} max={max} placeholder={translateUi(placeholder)} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold outline-none focus:border-emerald-400" /><FieldHint hint={hint} /></label>; }
function Select({ full = false, hint, label, labels = null, onChange, options, value }) {
  useUiLocale(); return <label className={full ? "sm:col-span-2" : undefined}><span className="text-xs font-black text-gray-600">{translateUi(label)}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold outline-none focus:border-emerald-400">{options.map((option) => <option key={option} value={option}>{labels?.[option] ?? option.replaceAll("_", " ")}</option>)}</select><FieldHint hint={hint} /></label>; }
function TextArea({ hint, label, onChange, placeholder = "", required = true, value }) {
  useUiLocale(); return <label className="sm:col-span-2"><span className="text-xs font-black text-gray-600">{translateUi(label)}</span><textarea required={required} placeholder={translateUi(placeholder)} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 min-h-24 w-full rounded-xl border border-gray-200 bg-white p-3 text-sm outline-none focus:border-emerald-400" /><FieldHint hint={hint} /></label>; }
function CheckboxRow({ checked, label, onChange }) {
  useUiLocale(); return <label className="flex items-center gap-2 rounded-xl border border-violet-100 bg-white p-3 text-sm font-black sm:col-span-2"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /> {translateUi(label)}</label>; }
function FormSectionLabel({ label }) {
  useUiLocale(); return <p className="mt-1 text-[11px] font-black uppercase tracking-wide text-violet-700 sm:col-span-2">{translateUi(label)}</p>; }
function EmptyState({ text }) {
  useUiLocale(); return <div className="mt-5 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center"><CalendarDays className="mx-auto text-gray-400" /><p className="mt-2 text-sm font-bold text-gray-500">{translateUi(text)}</p></div>; }
