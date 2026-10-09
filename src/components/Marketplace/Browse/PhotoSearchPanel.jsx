import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, Package, Search, Sparkles, X } from "lucide-react";

import { isAiCancellation, runAiTask } from "../../../Backend/services/ai/aiService";
import { preparePhotoForSearch } from "../../../Backend/services/ai/photoSearchImage";
import { moneyLabel } from "../../../Backend/services/ai/urmallAiModels";
import {
  applyPhotoMatches,
  expandPhotoSearchTerms,
  mergeListings,
  PHOTO_MATCH_LIMIT,
  photoFallbackResults,
  photoMatchListing,
  photoRecallQueries,
  rankPhotoCandidates,
} from "../../../Backend/services/marketplace/photoSearch";
import { fetchBuyerMarketplaceProducts } from "../../../Backend/services/marketplace/buyerMarketplaceService";
import { verticalAsPhotoCandidate } from "../../../Backend/services/marketplace/verticalSearch";
import { isConnectionFailure } from "../../../Backend/services/friendlyErrorService";
import { announceConnectionTrouble } from "../../../Backend/services/networkService";
import { resizedImageUrl } from "../../../Backend/lib/imageProxy";
import { useI18n } from "../../../i18n";

function productPriceLabel(product) {
  const discount = Number(product?.discountPrice);
  const price = Number.isFinite(discount) && discount > 0 && discount < Number(product?.price || 0) ? discount : Number(product?.price || 0);
  return moneyLabel(price, product?.currency || product?.seller?.currency || "");
}

const RECALL_TIMEOUT_MS = 6_000;

// Server searches for KAI's words, so listings the preloaded catalogue does
// not hold (older listings past the first page, a slow or failed catalogue
// load) can still be found. Never blocks the photo search for long.
function recallPhotoListings(queries) {
  if (!queries.length) return Promise.resolve([]);
  const searches = Promise.all(
    queries.map((search) => fetchBuyerMarketplaceProducts({ search }).then((result) => result?.newProducts || []).catch(() => [])),
  ).then((lists) => lists.flat());
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve([]), RECALL_TIMEOUT_MS);
  });
  return Promise.race([searches, timeout]).finally(() => clearTimeout(timer));
}

/**
 * UrMall photo search. KAI identifies the photographed product, the same
 * ranking as typed search finds real listings for KAI's search words, and KAI
 * marks each real listing as an exact or similar match. If the matching step
 * fails, the ranked listings are still shown (without KAI's reasons).
 */
export default function PhotoSearchPanel({ file, products = [], verticalEntries = [], catalogLoading = false, onOpenProduct, onSearchTerm, onRetake, onClear }) {
  const { t, locale } = useI18n();
  const [preview, setPreview] = useState("");
  const [state, setState] = useState({ step: "reading", identified: null, results: [], error: "" });
  const controllerRef = useRef(null);

  // Step 1: read + identify. Re-runs only for a new photo.
  useEffect(() => {
    if (!file) return undefined;
    const url = URL.createObjectURL(file);
    const controller = new AbortController();
    controllerRef.current = controller;
    setPreview(url);
    setState({ step: "reading", identified: null, results: [], error: "" });

    (async () => {
      const prepared = await preparePhotoForSearch(file);
      if (controller.signal.aborted) return;
      const image = prepared.image;
      if (!image) {
        const error = prepared.error === "unreadable" ? t("kaiListingFix.photoUnreadable") : t("ai.urmall.photoFailed");
        setState({ step: "error", identified: null, results: [], error });
        return;
      }
      setState((current) => ({ ...current, step: "identifying" }));
      try {
        const response = await runAiTask({
          task: "urmall.image_identify",
          surface: "urmall",
          input: { image, language: locale },
          context: { screen: "urmall photo search" },
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        const identified = response?.result || null;
        // Even when KAI doubts there is a product, its best guess is still
        // searched; only a photo with no words at all stops here.
        if (!identified || !expandPhotoSearchTerms(identified).length) {
          setState({ step: "notProduct", identified, results: [], error: "" });
          return;
        }
        setState({ step: "matching", identified, results: [], error: "" });
      } catch (error) {
        if (controller.signal.aborted || isAiCancellation(error)) return;
        if (isConnectionFailure(error) && announceConnectionTrouble()) {
          setState({ step: "error", identified: null, results: [], error: "" });
          return;
        }
        setState({ step: "error", identified: null, results: [], error: t("ai.urmall.photoFailed") });
      }
    })();

    return () => {
      controller.abort();
      URL.revokeObjectURL(url);
    };
    // A new photo starts over; the locale is read once per photo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  // Step 2: rank real listings once the catalogue is loaded.
  const identified = state.identified;
  const readyToMatch = state.step === "matching" && !catalogLoading;
  useEffect(() => {
    if (!readyToMatch || !identified) return undefined;
    const controller = controllerRef.current;
    let cancelled = false;
    const terms = expandPhotoSearchTerms(identified);

    (async () => {
      const recalled = await recallPhotoListings(photoRecallQueries(identified, terms));
      if (cancelled) return;
      // Everything a buyer can find: shop and vendor products (loaded and
      // recalled) plus meals, hotels and property (a photographed burger must
      // be able to match a menu item).
      const ranked = rankPhotoCandidates(
        mergeListings(products, recalled, verticalEntries.map(verticalAsPhotoCandidate)),
        terms,
      );
      if (!ranked.length) {
        setState((current) => ({ ...current, step: "done", results: [] }));
        return;
      }
      const candidates = ranked.slice(0, PHOTO_MATCH_LIMIT).map((entry) => entry.product);
      try {
        const response = await runAiTask({
          task: "urmall.image_match",
          surface: "urmall",
          input: {
            product: { name: identified.name, objectType: identified.objectType, category: identified.category, brand: identified.brand, explanation: identified.text },
            listings: candidates.map(photoMatchListing),
            language: locale,
          },
          context: { screen: "urmall photo search" },
          signal: controller?.signal,
        });
        if (cancelled) return;
        const matched = applyPhotoMatches(candidates, response?.result?.matches);
        // KAI picked nothing: still show listings whose title, brand,
        // keywords or category carry the photographed item's words.
        const results = matched.length ? matched : photoFallbackResults(ranked);
        setState((current) => ({ ...current, step: "done", results }));
      } catch (error) {
        if (cancelled || isAiCancellation(error)) return;
        // Matching failed: still show the listings the search words found.
        const fallback = photoFallbackResults(ranked, 8);
        const results = fallback.length ? fallback : candidates.slice(0, 4).map((product) => ({ product, level: "similar", reason: "" }));
        setState((current) => ({ ...current, step: "done", results }));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyToMatch, identified]);

  const busy = ["reading", "identifying", "matching"].includes(state.step);
  const busyLabel = state.step === "reading"
    ? t("ai.urmall.photoReading")
    : state.step === "identifying"
      ? t("ai.urmall.photoIdentifying")
      : t("ai.urmall.photoMatching");

  return (
    <div className="space-y-4">
      <div className="flex gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/70 p-3">
        <span className="h-20 w-20 flex-none overflow-hidden rounded-xl bg-gray-200">
          {preview ? <img src={preview} alt="" className="h-full w-full object-cover" /> : null}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.14em] text-indigo-700">
              <Sparkles size={13} /> {t("ai.urmall.photoWhat")}
            </p>
            <button
              type="button"
              onClick={onClear}
              aria-label={t("ai.urmall.photoClear")}
              className="-mr-1 -mt-1 grid h-8 w-8 flex-none place-items-center rounded-xl text-indigo-400 hover:bg-white hover:text-indigo-700"
            >
              <X size={16} />
            </button>
          </div>
          {busy && !identified ? (
            <p className="mt-2 flex items-center gap-2 text-sm font-bold text-indigo-700">
              <Loader2 size={15} className="animate-spin" /> {busyLabel}
            </p>
          ) : identified ? (
            <>
              {identified.name ? <p className="mt-1 text-sm font-black text-gray-950">{identified.name}</p> : null}
              {identified.text ? <p className="mt-1 text-sm font-medium leading-5 text-gray-700">{identified.text}</p> : null}
            </>
          ) : null}
          {state.step === "error" && state.error ? <p className="mt-2 text-sm font-bold text-red-600">{state.error}</p> : null}
          {state.step === "notProduct" || (state.step === "done" && identified?.found === false && !state.results.length) ? (
            <p className="mt-2 text-sm font-bold text-amber-700">{t("ai.urmall.photoNotProduct")}</p>
          ) : null}
        </div>
      </div>

      {state.step === "matching" ? (
        <p className="flex items-center gap-2 rounded-2xl bg-gray-50 px-4 py-3 text-sm font-bold text-gray-500">
          <Loader2 size={15} className="animate-spin" /> {busyLabel}
        </p>
      ) : null}

      {state.step === "done" && state.results.length ? (
        <section className="space-y-2">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-gray-400">{t("ai.urmall.photoResults")}</p>
          {identified?.found === false ? <p className="text-xs font-bold text-amber-700">{t("kaiListingFix.photoBestGuess")}</p> : null}
          {state.results.map(({ product, level, reason }) => (
            <button
              key={product.id}
              type="button"
              onClick={() => onOpenProduct?.(product)}
              className="kt-pressable flex w-full items-start gap-3 rounded-2xl bg-gray-50 px-3 py-2.5 text-left hover:bg-gray-100"
            >
              <span className="grid h-14 w-14 flex-none place-items-center overflow-hidden rounded-xl bg-gray-200 text-gray-500">
                {product.imageUrl ? (
                  <img src={resizedImageUrl(product.imageUrl, { width: 128, quality: 70 })} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                ) : (
                  <Package size={18} />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="min-w-0 truncate text-sm font-black text-gray-950">{product.name}</span>
                  <span
                    className={`flex-none rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${
                      level === "exact" ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-600"
                    }`}
                  >
                    {level === "exact" ? t("ai.urmall.photoExact") : t("ai.urmall.photoSimilar")}
                  </span>
                </span>
                <span className="mt-0.5 block text-xs font-black text-gray-700">{productPriceLabel(product)}</span>
                {reason ? <span className="mt-0.5 block text-xs font-medium leading-4 text-gray-500">{reason}</span> : null}
              </span>
            </button>
          ))}
          <p className="px-1 text-[11px] font-semibold text-gray-400">{t("ai.urmall.photoCaution")}</p>
        </section>
      ) : null}

      {(state.step === "done" && !state.results.length) || state.step === "notProduct" ? (
        <div className="rounded-2xl bg-gray-50 px-4 py-4">
          {state.step === "done" ? <p className="text-sm font-black text-gray-950">{t("ai.urmall.photoNoMatches")}</p> : null}
          {identified?.searchTerms?.length ? (
            <>
              <p className="mt-1 text-xs font-bold text-gray-500">{t("ai.urmall.photoTryTerms")}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {identified.searchTerms.slice(0, 6).map((term) => (
                  <button
                    key={term}
                    type="button"
                    onClick={() => onSearchTerm?.(term)}
                    className="inline-flex items-center gap-1.5 rounded-2xl bg-white px-3 py-1.5 text-sm font-bold text-gray-700 shadow-sm"
                  >
                    <Search size={13} /> {term}
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {!busy ? (
        <button
          type="button"
          onClick={onRetake}
          className="inline-flex h-10 items-center gap-2 rounded-2xl bg-gray-950 px-4 text-sm font-black text-white"
        >
          <Camera size={15} /> {t("ai.urmall.photoAnother")}
        </button>
      ) : null}
    </div>
  );
}
