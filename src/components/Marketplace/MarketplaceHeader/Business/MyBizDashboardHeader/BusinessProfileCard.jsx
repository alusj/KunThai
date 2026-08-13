import {
  BarChart3,
  Bike,
  BrainCircuit,
  ChevronRight,
  Clock,
  LayoutDashboard,
  MapPin,
  Megaphone,
  MoreHorizontal,
  Store,
  Tags,
} from "lucide-react";
import { createPortal } from "react-dom";
import { useState } from "react";

import BusinessLogo from "./BusinessLogo";
import VerificationBadge from "./VerificationBadge";
import { MarketplaceVerificationInline, MarketplaceVerificationModal } from "../../../shared/MarketplaceVerification";
import { useI18n, t } from "../../../../../i18n";

function StatusPill({ icon: Icon, label, active }) {
  return (
    <span
      className={[
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-black",
        active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500",
      ].join(" ")}
    >
      <Icon size={14} strokeWidth={2.3} />
      {label}
    </span>
  );
}

export default function BusinessProfileCard({ business, status, onEditProfile, onOpenSection }) {
  useI18n();
  const [verificationOpen, setVerificationOpen] = useState(false);
  const [verificationAnchor, setVerificationAnchor] = useState(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [actionsAnchor, setActionsAnchor] = useState(null);

  const actionItems = [
    {
      id: "todaySummary",
      icon: Clock,
      title: t("urmall.biz.dash.todaySummary"),
      description: t("urmall.biz.dash.liveSnapshot"),
      tone: "bg-sky-50 text-sky-700",
    },
    {
      id: "sellerIntelligence",
      icon: BrainCircuit,
      title: t("urmall.biz.intel.title"),
      description: t("urmall.biz.intel.subtitle"),
      tone: "bg-violet-50 text-violet-700",
    },
    {
      id: "overview",
      icon: LayoutDashboard,
      title: t("urmall.biz.dash.tabOverview"),
      description: t("urmall.biz.actv.subtitle"),
      tone: "bg-emerald-50 text-emerald-700",
    },
    {
      id: "sales",
      icon: BarChart3,
      title: t("urmall.biz.stats.salesOrders"),
      description: t("urmall.biz.stats.salesOrdersDesc"),
      tone: "bg-amber-50 text-amber-700",
    },
    {
      id: "promotions",
      icon: Megaphone,
      title: t("urmall.biz.board.items.promotionsT"),
      description: t("urmall.biz.board.items.promotionsD"),
      tone: "bg-rose-50 text-rose-700",
    },
  ];

  function openVerificationDetails(event) {
    const rect = event?.currentTarget?.getBoundingClientRect?.();
    setVerificationAnchor(rect ? {
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    } : null);
    setVerificationOpen(true);
  }

  function closeVerificationDetails() {
    setVerificationOpen(false);
    setVerificationAnchor(null);
  }

  function openActions(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const estimatedHeight = 388;
    setActionsAnchor({
      desktop: window.innerWidth >= 640,
      top: Math.max(12, Math.min(rect.bottom + 10, window.innerHeight - estimatedHeight - 12)),
      right: Math.max(12, window.innerWidth - rect.right),
    });
    setActionsOpen(true);
  }

  function chooseAction(id) {
    setActionsOpen(false);
    onOpenSection?.(id);
  }

  return (
    <section className="relative overflow-hidden rounded-[24px] border border-gray-200 bg-white p-5 shadow-sm">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-br from-emerald-50/80 via-white to-sky-50/60" aria-hidden="true" />
      {onOpenSection ? (
        <button
          type="button"
          onClick={openActions}
          aria-label={t("urmall.biz.vert.actionsFor", { label: business.name })}
          aria-haspopup="menu"
          aria-expanded={actionsOpen}
          className="absolute right-4 top-4 z-10 grid h-10 w-10 place-items-center rounded-xl border border-gray-200 bg-white/90 text-gray-700 shadow-sm backdrop-blur transition-all duration-300 hover:-translate-y-0.5 hover:border-emerald-200 hover:text-emerald-700 hover:shadow-md"
        >
          <MoreHorizontal size={21} strokeWidth={2.4} />
        </button>
      ) : null}

      <div className={`relative flex flex-col gap-4 sm:flex-row sm:items-start ${onOpenSection ? "sm:pr-12" : ""}`}>
        <BusinessLogo initials={business.logoInitials} logoUrl={business.logoUrl} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-gray-950">{business.name}</h2>
            <VerificationBadge
              status={business.verificationStatus}
              verified={business.verified}
              onClick={openVerificationDetails}
            />
            <MarketplaceVerificationInline
              audience="seller"
              status={business.verificationStatus}
              verified={business.verified}
              onReadMore={openVerificationDetails}
            />
          </div>

          <div className="mt-2 space-y-1 text-sm font-semibold text-gray-500">
            <p className="flex items-center gap-2">
              <Tags size={15} strokeWidth={2.3} />
              <span className="min-w-0 truncate">
                {business.category || t("urmall.biz.dash.noCategory")}
              </span>
            </p>
            <p className="flex items-center gap-2">
              <MapPin size={15} strokeWidth={2.3} />
              <span className="min-w-0 truncate">
                {business.location || t("urmall.biz.dash.noAddress")}
              </span>
            </p>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-bold text-gray-900">
              {business.rating.toFixed(1)}
            </span>
            <span className="text-yellow-500">{t("urmall.biz.dash.star")}</span>
            <span className="text-gray-500">
              {t("urmall.biz.dash.reviews", { count: business.reviewCount })}
            </span>
          </div>

          {status ? (
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <StatusPill
                icon={Clock}
                label={status.open ? t("urmall.biz.dash.openNow") : t("urmall.biz.dash.closed")}
                active={status.open}
              />
              <StatusPill
                icon={Bike}
                label={t("urmall.browse.deliveryChip")}
                active={status.deliveryEnabled}
              />
              <StatusPill
                icon={Store}
                label={t("urmall.browse.pickupChip")}
                active={status.pickupEnabled}
              />
            </div>
          ) : null}
        </div>

      </div>

      <button
        type="button"
        className="relative mt-5 h-11 w-full rounded-xl border border-gray-300 px-4 text-sm font-black text-gray-700 transition-all duration-300 hover:border-gray-400 hover:bg-gray-50 hover:shadow-sm"
        onClick={onEditProfile}
      >
        {t("urmall.biz.dash.editBusiness")}
      </button>

      {actionsOpen ? createPortal(
        <div className="fixed inset-0 z-[1300]" role="presentation">
          <button
            type="button"
            aria-label={t("urmall.biz.vert.closeActions")}
            onClick={() => setActionsOpen(false)}
            className="kt-detail-backdrop-enter absolute inset-0 bg-slate-950/25 backdrop-blur-[2px]"
          />
          <section
            role="menu"
            aria-label={business.name}
            className="kt-seller-action-menu-enter absolute inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-[24px] border border-white/80 bg-white p-2 shadow-2xl sm:inset-x-auto sm:bottom-auto sm:w-[360px]"
            style={actionsAnchor?.desktop ? { top: actionsAnchor.top, right: actionsAnchor.right } : undefined}
          >
            <div className="flex items-center justify-between gap-3 px-3 pb-2 pt-2">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">{t("urmall.biz.menu.boardTitle")}</p>
                <h3 className="mt-0.5 text-base font-black text-gray-950">{business.name}</h3>
              </div>
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-gray-500">
                {actionItems.length}
              </span>
            </div>
            <div className="space-y-1">
              {actionItems.map((item, index) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    onClick={() => chooseAction(item.id)}
                    className="kt-seller-action-item group flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-gray-50"
                    style={{ animationDelay: `${45 + index * 45}ms` }}
                  >
                    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-transform duration-300 group-hover:scale-105 ${item.tone}`}>
                      <Icon size={19} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-black text-gray-900">{item.title}</span>
                      <span className="mt-0.5 block truncate text-xs font-semibold text-gray-500">{item.description}</span>
                    </span>
                    <ChevronRight size={17} className="shrink-0 text-gray-300 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:text-gray-500" />
                  </button>
                );
              })}
            </div>
          </section>
        </div>,
        document.body,
      ) : null}
      {verificationOpen ? (
        <MarketplaceVerificationModal
          audience="seller"
          status={business.verificationStatus}
          verified={business.verified}
          anchorRect={verificationAnchor}
          onClose={closeVerificationDetails}
          onSecondaryAction={onEditProfile}
        />
      ) : null}
    </section>
  );
}
