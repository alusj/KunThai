import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchPromotedMarketplaceProducts } from "../../../Backend/services/marketplace/buyerMarketplaceService";
import { useI18n } from "../../../i18n";

const SLIDE_INTERVAL_MS = 4500;
// Distance (px) a finger must travel before a gesture counts as a swipe rather
// than a tap on a product.
const SWIPE_THRESHOLD_PX = 40;
// A slide feels intentional, not instant. Long easing curve on release.
const SLIDE_TRANSITION = "transform 620ms cubic-bezier(0.22, 1, 0.36, 1)";

// Advert slider for businesses that published with "Publish & promote".
// Shows only the listing cover image; renders nothing when no seller has an
// active promoted listing.
//
// Layout rules requested by sellers:
//   - More than 3 promoted products -> show 2 at a time.
//   - Exactly 3 promoted products   -> show 1 at a time.
//   - 1-2 promoted products         -> show 1 at a time.
// The card floats (sticky) so it stays visible while the header and the rest of
// the catalog scroll behind it, and manual swipes are contained here so they
// never bubble up to the app-level page swipe (Explore / UrRide).
export default function PromotedAdsCarousel({ onProductSelect }) {
  const { t } = useI18n();
  const [ads, setAds] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dragPx, setDragPx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [paused, setPaused] = useState(false);
  const dragRef = useRef({ startX: 0, dx: 0, active: false, moved: false });
  const viewportRef = useRef(null);

  const perView = ads.length > 3 ? 2 : 1;
  const maxIndex = Math.max(0, ads.length - perView);
  const canSlide = maxIndex > 0;
  const itemBasis = useMemo(() => `${100 / perView}%`, [perView]);

  const loadAds = useCallback(async () => {
    try {
      const products = await fetchPromotedMarketplaceProducts();
      setAds(products.filter((product) => product.imageUrl));
    } catch {
      setAds([]);
    }
  }, []);

  useEffect(() => {
    loadAds();
    window.addEventListener("marketplace-products-updated", loadAds);
    return () => window.removeEventListener("marketplace-products-updated", loadAds);
  }, [loadAds]);

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, maxIndex));
  }, [maxIndex]);

  useEffect(() => {
    if (!canSlide || paused) return undefined;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current >= maxIndex ? 0 : current + 1));
    }, SLIDE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [canSlide, maxIndex, paused]);

  if (!ads.length) return null;

  function goTo(index) {
    setActiveIndex(Math.min(Math.max(index, 0), maxIndex));
  }

  // Keep the whole gesture on the carousel: stopping propagation prevents the
  // app shell from reading it as a page swipe to Explore / UrRide.
  function handleTouchStart(event) {
    event.stopPropagation();
    if (!canSlide) return;
    dragRef.current = { startX: event.touches[0].clientX, dx: 0, active: true, moved: false };
    setDragging(true);
    setPaused(true);
  }

  function handleTouchMove(event) {
    if (!dragRef.current.active) return;
    event.stopPropagation();
    const dx = event.touches[0].clientX - dragRef.current.startX;
    dragRef.current.dx = dx;
    if (Math.abs(dx) > 6) dragRef.current.moved = true;
    setDragPx(dx);
  }

  function handleTouchEnd(event) {
    if (!dragRef.current.active) return;
    event.stopPropagation();
    const { dx } = dragRef.current;
    dragRef.current.active = false;
    setDragging(false);
    setDragPx(0);
    setPaused(false);
    if (dx <= -SWIPE_THRESHOLD_PX) goTo(activeIndex + 1);
    else if (dx >= SWIPE_THRESHOLD_PX) goTo(activeIndex - 1);
  }

  function handleProductClick(product) {
    // Ignore the click that ends a swipe so a drag never opens a product.
    if (dragRef.current.moved) return;
    onProductSelect?.(product);
  }

  const baseShiftPercent = activeIndex * (100 / perView);

  return (
    <section
      aria-label={t("urmall.browse.promotedAria")}
      className="sticky top-2 z-20 overflow-hidden rounded-2xl border border-gray-200 bg-gray-100 shadow-lg shadow-slate-900/10 ring-1 ring-slate-300/70"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      <div ref={viewportRef} className="relative aspect-[21/9] w-full sm:aspect-[3/1]">
        <div
          className="flex h-full"
          style={{
            transform: `translate3d(calc(-${baseShiftPercent}% + ${dragPx}px), 0, 0)`,
            transition: dragging ? "none" : SLIDE_TRANSITION,
            touchAction: "pan-y",
          }}
        >
          {ads.map((product) => (
            <div key={product.id} className="h-full shrink-0 px-0.5" style={{ flexBasis: itemBasis, maxWidth: itemBasis }}>
              <button
                type="button"
                onClick={() => handleProductClick(product)}
                className="relative block h-full w-full overflow-hidden rounded-xl bg-gray-950"
                aria-label={t("urmall.browse.openPromotedAria", { name: product.seller?.name || t("urmall.browse.sellerFallback") })}
              >
                <img
                  src={product.imageUrl}
                  alt=""
                  loading="lazy"
                  draggable={false}
                  className="h-full w-full select-none object-cover"
                />
              </button>
            </div>
          ))}
        </div>
      </div>

      <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/45 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white backdrop-blur-sm">
        {t("urmall.browse.sponsored")}
      </span>

      {canSlide ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
          {Array.from({ length: maxIndex + 1 }).map((_, index) => (
            <span
              key={index}
              className={`h-1.5 rounded-full transition-all ${
                index === activeIndex ? "w-5 bg-white" : "w-1.5 bg-white/50"
              }`}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
