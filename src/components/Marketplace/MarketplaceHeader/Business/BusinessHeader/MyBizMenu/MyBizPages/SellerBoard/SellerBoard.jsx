import {
  BadgeCheck,
  BarChart3,
  Boxes,
  FileWarning,
  Headphones,
  Megaphone,
  Scale,
  ShoppingBag,
  Truck,
} from "lucide-react";
import { useState } from "react";

import BusinessCatalog from "../../../../BusinessCatalog/BusinessCatalog";
import BusinessInsights from "../../../../BusinessInsights/BusinessInsights";
import BusinessPromotions from "../../../../BusinessPromotions/BusinessPromotions";
import BusinessStats from "../../../../BusinessStats/BusinessStats";
import CustomerCare from "../../../../CustomerCare/CustomerCare";
import { useI18n, t } from "../../../../../../../../i18n";
import SellerArticlePage from "../SellerArticlePage";
import SellerMenuPageHeader from "../SellerMenuPageHeader";
import SellerSubPagePanel from "../SellerSubPagePanel";
import SettingsSubMenuItem from "../SettingsSubMenuItem";
import DeliverySettings from "./pages/DeliverySettings";
import DisputesReports from "./pages/DisputesReports";
import VerificationCenter from "./pages/VerificationCenter";

const BOARD_ITEMS = [
  { key: "verification", icon: BadgeCheck, titleKey: "verificationT", descKey: "verificationD" },
  { key: "orders", icon: ShoppingBag, titleKey: "ordersT", descKey: "ordersD" },
  { key: "messages", icon: Headphones, titleKey: "messagesT", descKey: "messagesD" },
  { key: "products", icon: Boxes, titleKey: "productsT", descKey: "productsD" },
  { key: "delivery", icon: Truck, titleKey: "deliveryT", descKey: "deliveryD" },
  { key: "promotions", icon: Megaphone, titleKey: "promotionsT", descKey: "promotionsD" },
  { key: "performance", icon: BarChart3, titleKey: "performanceT", descKey: "performanceD" },
  { key: "reports", icon: FileWarning, titleKey: "reportsT", descKey: "reportsD" },
  { key: "policy", icon: Scale, titleKey: "policyT", descKey: "policyD" },
];

function BoardShell({ title, eyebrow = t("urmall.biz.board.eyebrow"), onBack, children }) {
  return (
    <>
      <SellerMenuPageHeader title={title} eyebrow={eyebrow} onBack={onBack} />
      <main className="w-full px-4 py-5 sm:px-6 lg:px-8">{children}</main>
    </>
  );
}

function SellerPolicyCenter({ onBack }) {
  const b = "urmall.biz.board.policy";
  return (
    <SellerArticlePage
      title={t("urmall.biz.board.items.policyT")}
      eyebrow={t("urmall.biz.board.eyebrow")}
      onBack={onBack}
      summary={t(`${b}.summary`)}
      highlights={[
        { title: t(`${b}.h1t`), text: t(`${b}.h1x`) },
        { title: t(`${b}.h2t`), text: t(`${b}.h2x`) },
        { title: t(`${b}.h3t`), text: t(`${b}.h3x`) },
      ]}
      sections={[
        { title: t(`${b}.s1t`), paragraphs: [t(`${b}.s1p1`), t(`${b}.s1p2`)] },
        { title: t(`${b}.s2t`), paragraphs: [t(`${b}.s2p1`), t(`${b}.s2p2`)] },
      ]}
    />
  );
}

export default function SellerBoard({ onBack }) {
  useI18n();
  const [currentView, setCurrentView] = useState("menu");

  return (
    <div className="relative min-h-full bg-white">
      <SellerMenuPageHeader title={t("urmall.biz.menu.boardTitle")} onBack={onBack} />
      <div className="space-y-5 px-4 py-4 sm:px-6 lg:px-8">
        <section className="rounded-2xl border border-gray-200 bg-gray-950 p-5 text-white shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300">
            {t("urmall.biz.board.heroEyebrow")}
          </p>
          <h2 className="mt-3 text-2xl font-black">{t("urmall.biz.board.heroTitle")}</h2>
          <p className="mt-3 max-w-5xl text-sm font-semibold leading-7 text-white/75">
            {t("urmall.biz.board.heroBody")}
          </p>
        </section>

        <section className="grid gap-3 lg:grid-cols-2">
          {BOARD_ITEMS.map((item) => (
            <SettingsSubMenuItem
              key={item.key}
              icon={item.icon}
              title={t(`urmall.biz.board.items.${item.titleKey}`)}
              description={t(`urmall.biz.board.items.${item.descKey}`)}
              onClick={() => setCurrentView(item.key)}
            />
          ))}
        </section>
      </div>

      <SellerSubPagePanel currentView={currentView}>
        {(view) => {
          if (view === "verification") return <VerificationCenter onBack={() => setCurrentView("menu")} />;
          if (view === "orders") {
            return (
              <BoardShell title={t("urmall.biz.board.items.ordersT")} onBack={() => setCurrentView("menu")}>
                <BusinessStats initialView="orders" />
              </BoardShell>
            );
          }
          if (view === "messages") {
            return (
              <BoardShell title={t("urmall.biz.board.items.messagesT")} onBack={() => setCurrentView("menu")}>
                <CustomerCare />
              </BoardShell>
            );
          }
          if (view === "products") {
            return (
              <BoardShell title={t("urmall.biz.board.items.productsT")} onBack={() => setCurrentView("menu")}>
                <BusinessCatalog mode="store" />
              </BoardShell>
            );
          }
          if (view === "delivery") return <DeliverySettings onBack={() => setCurrentView("menu")} />;
          if (view === "promotions") {
            return (
              <BoardShell title={t("urmall.biz.board.items.promotionsT")} onBack={() => setCurrentView("menu")}>
                <BusinessPromotions />
              </BoardShell>
            );
          }
          if (view === "performance") {
            return (
              <BoardShell title={t("urmall.biz.board.items.performanceT")} onBack={() => setCurrentView("menu")}>
                <BusinessInsights />
              </BoardShell>
            );
          }
          if (view === "reports") return <DisputesReports onBack={() => setCurrentView("menu")} />;
          if (view === "policy") return <SellerPolicyCenter onBack={() => setCurrentView("menu")} />;
          return null;
        }}
      </SellerSubPagePanel>
    </div>
  );
}
