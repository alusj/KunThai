import { useCallback, useEffect, useRef, useState } from "react";
import { fetchPromotedMarketplaceProducts } from "../../../Backend/services/marketplace/buyerMarketplaceService";

const SLIDE_INTERVAL_MS = 4500;

// Advert slider for businesses that published with "Publish & promote".
// Shows only the listing cover image; renders nothing when no seller has an
// active promoted listing.
export default function PromotedAdsCarousel({ onProductSelect }) {
  const [ads, setAds] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const touchStartXRef = useRef(null);
  const timerRef = useRef(null);

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
    setActiveIndex((current) => (ads.length ? Math.min(current, ads.length - 1) : 0));
  }, [ads.length]);

  useEffect(() => {
    if (ads.length < 2) return undefined;
    timerRef.current = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % ads.length);
    }, SLIDE_INTERVAL_MS);
    return () => window.clearInterval(timerRef.current);
  }, [ads.length]);

  if (!ads.length) return null;

  function move(direction) {
    setActiveIndex((current) => (current + direction + ads.length) % ads.length);
  }

  function handleTouchEnd(event) {
    if (touchStartXRef.current === null || ads.length < 2) return;
    const deltaX = event.changedTouches[0].clientX - touchStartXRef.current;
    touchStartXRef.current = null;
    if (Math.abs(deltaX) < 40) return;
    move(deltaX > 0 ? -1 : 1);
  }

  return (
    <section
      aria-label="Promoted UrMall businesses"
      className="relative overflow-hidden rounded-2xl border border-gray-200 bg-gray-100 shadow-sm"
      onTouchStart={(event) => {
        touchStartXRef.current = event.touches[0].clientX;
      }}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className="flex transition-transform duration-500 ease-out"
        style={{ transform: `translate3d(-${activeIndex * 100}%, 0, 0)` }}
      >
        {ads.map((product) => (
          <button
            key={product.id}
            type="button"
            onClick={() => onProductSelect?.(product)}
            className="relative aspect-[21/9] w-full shrink-0 overflow-hidden bg-gray-950 sm:aspect-[3/1]"
            aria-label={`Open promoted listing from ${product.seller?.name || "UrMall seller"}`}
          >
            <img
              src={product.imageUrl}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
          </button>
        ))}
      </div>

      <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/45 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white backdrop-blur-sm">
        Sponsored
      </span>

      {ads.length > 1 ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
          {ads.map((product, index) => (
            <span
              key={product.id}
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
