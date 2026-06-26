import { createElement, useCallback, useEffect, useRef, useState } from "react";
import {
  Eye,
  Megaphone,
  MoreHorizontal,
  Package,
  PauseCircle,
  Pencil,
  PlayCircle,
  RotateCcw,
} from "lucide-react";

import { formatCurrency } from "../../../../../Backend/utils/formatCurrency";
import ProductStatusBadge from "./ProductStatusBadge";

const PRODUCT_MENU_ANIMATION_MS = 180;

export default function ProductManagementRow({ product, onAction, onViewProduct }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuClosing, setMenuClosing] = useState(false);
  const menuRef = useRef(null);
  const menuButtonRef = useRef(null);
  const menuTimerRef = useRef(null);
  const needsRestock = product.status === "out-of-stock" || product.status === "low-stock";
  const primaryImage = product.mainImageUrl || product.imageUrls?.[0] || "";
  const detailSummary = [
    product.category,
    product.sku ? `SKU ${product.sku}` : "",
    product.deliveryAvailable ? "Delivery" : "",
    product.pickupAvailable ? "Pickup" : "",
  ].filter(Boolean).join(" - ");

  const clearMenuTimer = useCallback(() => {
    if (menuTimerRef.current) {
      window.clearTimeout(menuTimerRef.current);
      menuTimerRef.current = null;
    }
  }, []);

  const closeMenu = useCallback((immediate = false) => {
    clearMenuTimer();
    if (immediate) {
      setMenuOpen(false);
      setMenuClosing(false);
      return;
    }

    setMenuOpen((wasOpen) => {
      if (wasOpen) {
        setMenuClosing(true);
        menuTimerRef.current = window.setTimeout(() => {
          setMenuOpen(false);
          setMenuClosing(false);
          menuTimerRef.current = null;
        }, PRODUCT_MENU_ANIMATION_MS);
      }
      return wasOpen;
    });
  }, [clearMenuTimer]);

  const toggleMenu = useCallback((event) => {
    event.stopPropagation();
    if (menuOpen && !menuClosing) closeMenu();
    else {
      clearMenuTimer();
      setMenuClosing(false);
      setMenuOpen(true);
    }
  }, [clearMenuTimer, closeMenu, menuClosing, menuOpen]);

  useEffect(() => {
    if (!menuOpen) return undefined;

    function handlePointerDown(event) {
      const target = event.target;
      if (menuRef.current?.contains(target) || menuButtonRef.current?.contains(target)) return;
      closeMenu();
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") closeMenu();
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeMenu, menuOpen]);

  useEffect(() => () => clearMenuTimer(), [clearMenuTimer]);

  function openProduct() {
    onViewProduct?.(product);
  }

  function handleKeyDown(event) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openProduct();
  }

  function runAction(action) {
    closeMenu(true);
    if (action === "view-product") {
      onViewProduct?.(product);
      return;
    }
    onAction?.(product, action);
  }

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={openProduct}
      onKeyDown={handleKeyDown}
      className="group relative grid cursor-pointer grid-cols-[4.75rem_minmax(0,1fr)_auto] gap-3 border-t border-gray-100 px-4 py-4 text-left transition hover:bg-gray-50 sm:grid-cols-[5.75rem_minmax(0,1fr)_auto] sm:gap-4"
    >
      <div className="h-[4.75rem] w-[4.75rem] overflow-hidden rounded-xl border border-gray-200 bg-gray-100 sm:h-[5.75rem] sm:w-[5.75rem]">
        {primaryImage ? (
          <img
            src={primaryImage}
            alt={product.name}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-gray-400">
            <Package size={24} />
          </div>
        )}
      </div>

      <div className="min-w-0 pr-1">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="min-w-0 truncate font-black text-gray-950">{product.name}</h4>
          <ProductStatusBadge status={product.status} />
        </div>
        <p className="mt-1 truncate text-sm font-semibold text-gray-500">{product.trend}</p>
        {detailSummary ? (
          <p className="mt-1 truncate text-xs font-bold text-gray-400">{detailSummary}</p>
        ) : null}

        <div className="mt-3 grid grid-cols-3 gap-2">
          <Metric label="Price" value={formatCurrency(product.price)} />
          <Metric label="Stock" value={product.stock} />
          <Metric label="Sales" value={product.sales} />
        </div>
      </div>

      <div className="relative flex justify-end">
        <button
          ref={menuButtonRef}
          type="button"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          aria-label={`Open actions for ${product.name}`}
          onClick={toggleMenu}
          className="kt-touchable flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
        >
          <MoreHorizontal size={20} strokeWidth={2.8} />
        </button>

        {menuOpen || menuClosing ? (
          <div
            ref={menuRef}
            role="menu"
            className={`absolute right-0 top-12 z-20 w-52 overflow-hidden rounded-2xl border border-gray-200 bg-white p-1.5 shadow-2xl shadow-slate-950/10 ${
              menuClosing ? "kt-live-actions-pop-out pointer-events-none" : "kt-live-actions-pop"
            }`}
            onClick={(event) => event.stopPropagation()}
          >
            <MenuAction icon={Eye} label="View product" onClick={() => runAction("view-product")} />
            {needsRestock ? (
              <MenuAction icon={RotateCcw} label="Restock" onClick={() => runAction("restock")} />
            ) : null}
            <MenuAction icon={Pencil} label="Edit listing" onClick={() => runAction("edit-listing")} />
            <MenuAction icon={Megaphone} label="Promote" onClick={() => runAction("promote")} />
            <MenuAction
              icon={product.status === "paused" ? PlayCircle : PauseCircle}
              label={product.status === "paused" ? "Resume" : "Pause"}
              onClick={() => runAction("pause")}
            />
          </div>
        ) : null}
      </div>
    </article>
  );
}

function Metric({ label, value }) {
  return (
    <div className="min-w-0 rounded-xl bg-gray-50 px-2.5 py-2">
      <p className="truncate text-[10px] font-black uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-0.5 truncate text-sm font-black text-gray-950">{value}</p>
    </div>
  );
}

function MenuAction({ icon: Icon, label, onClick }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-black text-gray-700 transition hover:bg-emerald-50 hover:text-emerald-700"
    >
      {createElement(Icon, { size: 17 })}
      <span className="truncate">{label}</span>
    </button>
  );
}
