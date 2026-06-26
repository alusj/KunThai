import { createElement, useMemo, useState } from "react";
import {
  Boxes,
  CalendarDays,
  DollarSign,
  Eye,
  Image as ImageIcon,
  MapPin,
  Package,
  Pencil,
  ShoppingBag,
  Tag,
  Truck,
} from "lucide-react";

import { formatCurrency } from "../../../../../Backend/utils/formatCurrency";
import AppBackTab from "../../../../shared/AppBackTab";
import ProductStatusBadge from "./ProductStatusBadge";

function uniqueImages(product = {}) {
  return Array.from(new Set([product.mainImageUrl, ...(product.imageUrls || [])].filter(Boolean)));
}

function getSpecRows(product = {}) {
  const details = product.details || {};
  return [
    ["Brand", product.brand],
    ["Model", product.model],
    ["Condition", product.condition],
    ["SKU", product.sku],
    ["Size", details.size],
    ["Color", details.color],
    ["Material", details.material],
    ["Weight", details.weight],
    ["Dimensions", details.dimensions],
    ["Warranty", details.warranty],
    ["Variants", details.variants],
    ["Specifications", details.specifications],
  ].filter(([, value]) => String(value || "").trim());
}

function formatProductDate(value) {
  if (!value) return "Not published";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not published";
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

export default function SellerProductDetail({ product, onBack, onEdit }) {
  const images = useMemo(() => uniqueImages(product), [product]);
  const specs = useMemo(() => getSpecRows(product), [product]);
  const [activeImage, setActiveImage] = useState(0);
  const displayImage = images[activeImage] || images[0] || "";
  const displayPrice = product?.discountPrice || product?.price || 0;
  const hasDiscount = product?.discountPrice && Number(product.discountPrice) < Number(product.price || 0);

  if (!product) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="sticky top-0 z-30 border-b border-gray-100 bg-white px-3 py-3 shadow-sm sm:px-4">
          <div className="flex items-center gap-3">
            <AppBackTab onBack={onBack} label="Back to seller dashboard" historyKey="seller-product-detail" useHistoryLayer={false} />
            <div>
              <p className="text-xs font-black uppercase text-emerald-700">Product</p>
              <h1 className="text-lg font-black text-gray-950">Product unavailable</h1>
            </div>
          </div>
        </header>
        <main className="px-4 py-5">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm font-bold text-gray-500">
            This product could not be loaded.
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-30 border-b border-gray-100 bg-white px-3 py-3 shadow-sm sm:px-4">
        <div className="flex w-full items-center gap-3">
          <AppBackTab
            onBack={onBack}
            label="Back to seller dashboard"
            historyKey="seller-product-detail"
            className="rounded-full border border-gray-200 bg-white hover:bg-gray-50"
            useHistoryLayer={false}
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase text-emerald-700">Product Detail</p>
            <h1 className="truncate text-lg font-black text-gray-950">{product.name}</h1>
            <p className="truncate text-xs font-semibold text-gray-500">{product.category || "Catalog item"}</p>
          </div>
          <button
            type="button"
            onClick={() => onEdit?.(product)}
            className="kt-pressable hidden h-11 items-center gap-2 rounded-xl bg-gray-950 px-4 text-sm font-black text-white shadow-lg shadow-gray-950/15 transition hover:bg-gray-800 sm:flex"
          >
            <Pencil size={17} />
            Edit
          </button>
        </div>
      </header>

      <main className="w-full px-4 py-5 pb-8 sm:px-6 lg:px-8">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
          <section className="space-y-3">
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              {displayImage ? (
                <img src={displayImage} alt={product.name} className="aspect-square w-full object-cover" />
              ) : (
                <div className="flex aspect-square w-full items-center justify-center bg-gray-100 text-gray-400">
                  <ImageIcon size={44} />
                </div>
              )}
            </div>

            {images.length > 1 ? (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {images.map((image, index) => (
                  <button
                    key={`${image}-${index}`}
                    type="button"
                    onClick={() => setActiveImage(index)}
                    className={`h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 bg-gray-100 transition ${
                      activeImage === index ? "border-emerald-600" : "border-transparent opacity-75"
                    }`}
                    aria-label={`Show product image ${index + 1}`}
                  >
                    <img src={image} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            ) : null}

            {product.videoUrl ? (
              <div className="overflow-hidden rounded-2xl border border-gray-200 bg-gray-950 shadow-sm">
                <video src={product.videoUrl} controls playsInline preload="metadata" className="aspect-video w-full bg-gray-950 object-contain" />
              </div>
            ) : null}
          </section>

          <section className="space-y-4">
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <ProductStatusBadge status={product.status} />
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-black capitalize text-gray-700">
                      {product.condition || "Condition not set"}
                    </span>
                  </div>
                  <h2 className="mt-3 text-2xl font-black leading-tight text-gray-950 sm:text-3xl">{product.name}</h2>
                  <p className="mt-2 text-sm font-semibold leading-6 text-gray-600">
                    {product.description || "No product description has been added yet."}
                  </p>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-end gap-2">
                <p className="text-3xl font-black text-gray-950">{formatCurrency(displayPrice)}</p>
                {hasDiscount ? (
                  <p className="pb-1 text-sm font-bold text-gray-400 line-through">{formatCurrency(product.price)}</p>
                ) : null}
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <DetailMetric icon={Boxes} label="Stock" value={product.stock ?? 0} />
                <DetailMetric icon={ShoppingBag} label="Sales" value={product.sales ?? 0} />
                <DetailMetric icon={Eye} label="Views" value={product.views ?? 0} />
                <DetailMetric icon={DollarSign} label="Revenue" value={formatCurrency(product.revenue || 0)} />
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <InfoPanel icon={Tag} label="Category" value={product.category || "Not set"} />
              <InfoPanel icon={Package} label="SKU" value={product.sku || "Not set"} />
              <InfoPanel icon={Truck} label="Delivery" value={product.deliveryAvailable ? product.deliveryTime || "Available" : "Pickup only"} />
              <InfoPanel icon={MapPin} label="Location" value={product.location || "Not set"} />
              <InfoPanel icon={CalendarDays} label="Published" value={formatProductDate(product.publishedAt)} />
              <InfoPanel icon={Boxes} label="Low stock alert" value={product.lowStockAlert ?? "Not set"} />
            </div>

            {specs.length ? (
              <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
                <h3 className="text-lg font-black text-gray-950">Product details</h3>
                <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                  {specs.map(([label, value]) => (
                    <div key={label} className="rounded-xl bg-gray-50 px-3 py-2">
                      <dt className="text-[11px] font-black uppercase tracking-wide text-gray-400">{label}</dt>
                      <dd className="mt-1 break-words text-sm font-black text-gray-950">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => onEdit?.(product)}
              className="kt-pressable flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 text-sm font-black text-white shadow-lg shadow-gray-950/15 transition hover:bg-gray-800 sm:hidden"
            >
              <Pencil size={17} />
              Edit listing
            </button>
          </section>
        </div>
      </main>
    </div>
  );
}

function DetailMetric({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl bg-gray-50 p-3">
      <p className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide text-gray-400">
        {createElement(Icon, { size: 14 })}
        {label}
      </p>
      <p className="mt-1 truncate text-base font-black text-gray-950">{value}</p>
    </div>
  );
}

function InfoPanel({ icon: Icon, label, value }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-gray-400">
        {createElement(Icon, { size: 15 })}
        {label}
      </p>
      <p className="mt-2 break-words text-sm font-black text-gray-950">{value}</p>
    </div>
  );
}
