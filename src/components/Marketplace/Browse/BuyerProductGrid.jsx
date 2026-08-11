import { Fragment, useEffect } from "react";
import { BadgeCheck, Heart, MapPin, PackageSearch, Share2, ShoppingCart, Star, Truck } from "lucide-react";
import { formatCurrency } from "../../../Backend/utils/formatCurrency";
import { shareUrMallLink } from "../../../Backend/services/shareCtaService";
import { getProductCardLocation, buildCardSellerLocation } from "../../../Backend/utils/productCardLocation";
import { ensureBuyerLocation, useBuyerLocation } from "../../../Backend/utils/buyerLocationContext";
import { useI18n, t } from "../../../i18n";

function ProductImage({ product }) {
  if (product.imageUrl) {
    return (
      <img
        src={product.imageUrl}
        alt={product.name}
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
      />
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-gray-100 via-white to-emerald-50 text-gray-400">
      <PackageSearch size={34} strokeWidth={1.8} />
    </div>
  );
}

export function BuyerProductCard({ product, onProductSelect, onAddToCart, onToggleSaved, saved, buyerLocation }) {
  const hasDiscount = product.discountPrice && product.discountPrice < product.price;
  // Context-aware, privacy-safe short area for the card (no house numbers). Uses
  // the seller's saved city/country/coords + derived local area vs the buyer's
  // city — never the full raw address.
  const cardLocation =
    getProductCardLocation({
      buyerLocation,
      sellerLocation: buildCardSellerLocation({
        address: product.seller?.address || product.location,
        city: product.seller?.city,
        country: product.seller?.country || product.country,
        latitude: product.seller?.latitude,
        longitude: product.seller?.longitude,
      }),
    }) || product.location;
  const displayPrice = hasDiscount ? product.discountPrice : product.price;
  const discountPercent = hasDiscount ? Math.round(((product.price - product.discountPrice) / product.price) * 100) : 0;
  const verifiedSeller = ["verified", "approved", "recommended", "verified_recommended"].includes(
    String(product.seller?.verificationStatus || "").toLowerCase(),
  );

  function openProduct() {
    onProductSelect?.(product);
  }

  return (
    <article
      role="button"
      tabIndex={0}
      className="group overflow-hidden rounded-lg border border-gray-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md"
      onClick={openProduct}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openProduct();
        }
      }}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-gray-100">
        <ProductImage product={product} />
        <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
          <span className="rounded-md bg-slate-950/95 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-white">{t("urmall.browse.retail")}</span>
          {hasDiscount ? <span className="rounded-md bg-red-600 px-2 py-1 text-[11px] font-black uppercase text-white">-{discountPercent}%</span> : null}
        </div>
        {verifiedSeller ? (
          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-md bg-emerald-600/95 px-2 py-1 text-[11px] font-black text-white">
            <BadgeCheck size={13} />
            {t("urmall.browse.verified")}
          </span>
        ) : null}
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleSaved?.(product);
          }}
          className={`absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/70 shadow-sm backdrop-blur ${
            saved ? "bg-red-600 text-white" : "bg-white/90 text-gray-700 hover:text-red-600"
          }`}
          aria-label={saved ? t("urmall.browse.unsave", { name: product.name }) : t("urmall.browse.save", { name: product.name })}
        >
          <Heart size={16} fill={saved ? "currentColor" : "none"} />
        </button>
      </div>

      <div className="space-y-1 p-2">
        <div>
          <h3 className="line-clamp-2 text-[13px] font-black leading-[1.05rem] text-gray-950">
            {product.name}
          </h3>
          <p className="mt-0.5 truncate text-[11px] font-semibold text-gray-500">
            {t("urmall.browse.retailMeta", { category: product.category, seller: product.seller?.name || t("urmall.browse.sellerFallback") })}
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-1.5">
          <p className="text-base font-black text-gray-950">{formatCurrency(displayPrice, product.currency || product.countryCode || product.country)}</p>
          {hasDiscount && (
            <p className="pb-0.5 text-[11px] font-bold text-gray-400 line-through">{formatCurrency(product.price, product.currency || product.countryCode || product.country)}</p>
          )}
        </div>

        <div className="grid gap-0.5 text-[11px] font-bold text-gray-500">
          <span className="flex min-w-0 items-center gap-1.5 leading-5">
            <MapPin size={13} className="shrink-0 text-emerald-600" />
            <span className="truncate">{cardLocation}</span>
          </span>
          <span className="flex min-w-0 items-center gap-1.5 leading-5">
            <Truck size={13} className="shrink-0 text-emerald-600" />
            <span className="truncate">
              {product.deliveryAvailable ? product.deliveryTime || t("urmall.browse.deliveryAvailable") : product.pickupAvailable ? t("urmall.browse.pickupAvailable") : t("urmall.browse.askSeller")}
            </span>
          </span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1 text-[11px] font-black text-amber-600">
              <Star size={12} fill="currentColor" />
              {product.reviewCount ? `${product.rating.toFixed(1)} (${product.reviewCount})` : product.sales > 0 ? t("urmall.browse.soldN", { count: product.sales }) : t("urmall.browse.ratingNew")}
            </span>
            <p className="truncate text-[10px] font-bold text-gray-400">{t("urmall.browse.inStock", { count: product.stock })}</p>
          </div>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onAddToCart?.(product);
            }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gray-950 text-white transition hover:bg-emerald-700"
            aria-label={t("urmall.browse.addToCartAria", { name: product.name })}
          >
            <ShoppingCart size={15} />
          </button>
        </div>
      </div>
    </article>
  );
}

// The only UrMall loader: mirrors the real buyer card layout — image, text
// lines, and the add-to-cart button slot — so the loaded grid appears in place
// without the card shape shifting.
function ProductSkeleton() {
  return (
    <div className="rounded-[22px] border border-slate-200 bg-white p-3 shadow-sm">
      <div className="relative aspect-[4/3] animate-pulse rounded-[18px] bg-slate-100">
        <div className="absolute right-2 top-2 h-8 w-8 rounded-lg bg-white/80" />
      </div>
      <div className="mt-3 h-4 w-4/5 animate-pulse rounded-full bg-slate-200" />
      <div className="mt-2 h-3 w-1/2 animate-pulse rounded-full bg-emerald-100" />
      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="h-3 w-2/5 animate-pulse rounded-full bg-slate-100" />
        <div className="h-8 w-8 animate-pulse rounded-lg bg-slate-200" />
      </div>
    </div>
  );
}

export default function BuyerProductGrid({
  products,
  loading,
  error,
  emptyTitle,
  emptyBody,
  onProductSelect,
  onAddToCart,
  onToggleSaved,
  savedIds = new Set(),
  supplementalContent = null,
  priorityCategory = null,
}) {
  useI18n();
  const buyerLocation = useBuyerLocation();
  useEffect(() => {
    ensureBuyerLocation();
  }, []);
  // Where the vertical (meals/hotels/property) block sits in the grid. When a
  // vertical category leads, it goes first (before retail); when Retail leads it
  // goes last; otherwise it keeps its default spot after the third product.
  const supplementalIndex = ["restaurant", "hotel", "property"].includes(priorityCategory)
    ? 0
    : priorityCategory === "retail"
      ? products.length
      : Math.min(3, products.length);
  if (loading && !products.length) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 8 }).map((_, index) => (
          <ProductSkeleton key={index} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-100 bg-red-50 p-4 text-center">
        <p className="font-black text-red-700">{t("urmall.browse.productsLoadFailed")}</p>
        <p className="mt-1 text-sm font-medium text-red-600">{error}</p>
      </div>
    );
  }

  if (!products.length && !supplementalContent) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-5 text-center shadow-sm">
        <p className="font-black text-gray-950">{emptyTitle}</p>
        <p className="mt-1 text-sm font-medium text-gray-500">{emptyBody}</p>
        <p className="mt-3 text-sm font-semibold leading-6 text-gray-500">{t("urmall.browse.shareInvite")}</p>
        <button
          type="button"
          onClick={shareUrMallLink}
          className="mx-auto mt-3 inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-gray-950 px-4 text-sm font-black text-white"
        >
          <Share2 size={16} />
          {t("urmall.browse.shareUrMall")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {supplementalIndex <= 0 ? supplementalContent : null}
        {products.map((product, index) => (
          <Fragment key={product.id}>
            {supplementalIndex > 0 && supplementalIndex < products.length && index === supplementalIndex ? supplementalContent : null}
            <BuyerProductCard product={product} onProductSelect={onProductSelect} onAddToCart={onAddToCart} onToggleSaved={onToggleSaved} saved={savedIds.has(product.id)} buyerLocation={buyerLocation} />
          </Fragment>
        ))}
        {supplementalIndex > 0 && supplementalIndex >= products.length ? supplementalContent : null}
      </div>
    </div>
  );
}
