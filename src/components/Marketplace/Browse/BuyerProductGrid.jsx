import { Fragment } from "react";
import { BadgeCheck, Heart, MapPin, PackageSearch, ShoppingCart, Star, Truck } from "lucide-react";
import { formatCurrency } from "../../../Backend/utils/formatCurrency";

function ProductImage({ product }) {
  if (product.imageUrl) {
    return (
      <img
        src={product.imageUrl}
        alt={product.name}
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

function BuyerProductCard({ product, onProductSelect, onAddToCart, onToggleSaved, saved }) {
  const hasDiscount = product.discountPrice && product.discountPrice < product.price;
  const displayPrice = hasDiscount ? product.discountPrice : product.price;
  const discountPercent = hasDiscount ? Math.round(((product.price - product.discountPrice) / product.price) * 100) : 0;
  const verifiedSeller = product.seller?.verificationStatus === "verified";

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
      <div className="relative aspect-square overflow-hidden bg-gray-100">
        <ProductImage product={product} />
        <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
          <span className="rounded-md bg-slate-950/95 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-white">Retail</span>
          {hasDiscount ? <span className="rounded-md bg-red-600 px-2 py-1 text-[11px] font-black uppercase text-white">-{discountPercent}%</span> : null}
        </div>
        {verifiedSeller ? (
          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-md bg-emerald-600/95 px-2 py-1 text-[11px] font-black text-white">
            <BadgeCheck size={13} />
            Verified
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
          aria-label={saved ? `Unsave ${product.name}` : `Save ${product.name}`}
        >
          <Heart size={16} fill={saved ? "currentColor" : "none"} />
        </button>
      </div>

      <div className="space-y-1.5 p-2.5">
        <div>
          <h3 className="line-clamp-2 min-h-[2.25rem] text-[13px] font-black leading-[1.125rem] text-gray-950">
            {product.name}
          </h3>
          <p className="mt-0.5 truncate text-[11px] font-semibold text-gray-500">
            Retail · {product.category} | {product.seller?.name || "UrMall seller"}
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
            <span className="truncate">{product.location}</span>
          </span>
          <span className="flex min-w-0 items-center gap-1.5 leading-5">
            <Truck size={13} className="shrink-0 text-emerald-600" />
            <span className="truncate">
              {product.deliveryAvailable ? product.deliveryTime || "Delivery available" : product.pickupAvailable ? "Pickup available" : "Ask seller"}
            </span>
          </span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1 text-[11px] font-black text-amber-600">
              <Star size={12} fill="currentColor" />
              {product.reviewCount ? `${product.rating.toFixed(1)} (${product.reviewCount})` : product.sales > 0 ? `${product.sales} sold` : "New"}
            </span>
            <p className="truncate text-[10px] font-bold text-gray-400">{product.stock} in stock</p>
          </div>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onAddToCart?.(product);
            }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gray-950 text-white transition hover:bg-emerald-700"
            aria-label={`Add ${product.name} to cart`}
          >
            <ShoppingCart size={15} />
          </button>
        </div>
      </div>
    </article>
  );
}

function ProductSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="aspect-square animate-pulse bg-gray-100" />
      <div className="space-y-2 p-2.5">
        <div className="h-4 w-5/6 animate-pulse rounded bg-gray-100" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-gray-100" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-gray-100" />
        <div className="h-3 w-3/4 animate-pulse rounded bg-gray-100" />
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
}) {
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
        <p className="font-black text-red-700">Products could not load</p>
        <p className="mt-1 text-sm font-medium text-red-600">{error}</p>
      </div>
    );
  }

  if (!products.length && !supplementalContent) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-5 text-center shadow-sm">
        <p className="font-black text-gray-950">{emptyTitle}</p>
        <p className="mt-1 text-sm font-medium text-gray-500">{emptyBody}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {loading ? (
        <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">
          Refreshing products...
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {products.map((product, index) => (
          <Fragment key={product.id}>
            {index === Math.min(3, products.length) ? supplementalContent : null}
            <BuyerProductCard product={product} onProductSelect={onProductSelect} onAddToCart={onAddToCart} onToggleSaved={onToggleSaved} saved={savedIds.has(product.id)} />
          </Fragment>
        ))}
        {products.length <= 3 ? supplementalContent : null}
      </div>
    </div>
  );
}
