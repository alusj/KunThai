import {
  BadgeCheck,
  BarChart3,
  Boxes,
  FileWarning,
  Headphones,
  Megaphone,
  Scale,
  ShieldCheck,
  ShoppingBag,
  Truck,
} from "lucide-react";
import { useState } from "react";

import BusinessCatalog from "../../../../BusinessCatalog/BusinessCatalog";
import BusinessInsights from "../../../../BusinessInsights/BusinessInsights";
import BusinessPromotions from "../../../../BusinessPromotions/BusinessPromotions";
import BusinessStats from "../../../../BusinessStats/BusinessStats";
import CustomerCare from "../../../../CustomerCare/CustomerCare";
import SellerArticlePage from "../SellerArticlePage";
import SellerMenuPageHeader from "../SellerMenuPageHeader";
import SettingsSubMenuItem from "../SettingsSubMenuItem";
import DeliverySettings from "./pages/DeliverySettings";
import DisputesReports from "./pages/DisputesReports";
import VerificationCenter from "./pages/VerificationCenter";

const BOARD_ITEMS = [
  {
    key: "verification",
    icon: BadgeCheck,
    title: "Verification Center",
    description: "Request verification, understand trust status, and prepare seller documents.",
  },
  {
    key: "orders",
    icon: ShoppingBag,
    title: "Orders",
    description: "Track pending, completed, cancelled, and refunded UrMall orders.",
  },
  {
    key: "messages",
    icon: Headphones,
    title: "Messages & Customer Care",
    description: "Reply to buyer questions, product inquiries, and customer conversations.",
  },
  {
    key: "products",
    icon: Boxes,
    title: "Product Management",
    description: "Manage active products, drafts, paused items, prices, stock, and promotions.",
  },
  {
    key: "delivery",
    icon: Truck,
    title: "Shipping & Delivery",
    description: "Control delivery, pickup, discovery, operating type, and fulfillment notes.",
  },
  {
    key: "promotions",
    icon: Megaphone,
    title: "Promotions",
    description: "Review campaigns, discounts, suggested products, and growth opportunities.",
  },
  {
    key: "performance",
    icon: BarChart3,
    title: "Store Performance",
    description: "See buyer behavior, product clicks, discovery signals, and traffic quality.",
  },
  {
    key: "reports",
    icon: FileWarning,
    title: "Disputes & Reports",
    description: "Report order issues, suspicious buyers, fraud attempts, or support cases.",
  },
  {
    key: "security",
    icon: ShieldCheck,
    title: "Account Recovery",
    description: "Understand password recovery, sensitive actions, login safety, and 2FA.",
  },
  {
    key: "policy",
    icon: Scale,
    title: "Seller Policy Center",
    description: "Selling rules, prohibited behavior, payment safety, and dispute expectations.",
  },
];

function BoardShell({ title, eyebrow = "Seller Board", onBack, children }) {
  return (
    <>
      <SellerMenuPageHeader title={title} eyebrow={eyebrow} onBack={onBack} />
      <main className="w-full px-4 py-5 sm:px-6 lg:px-8">{children}</main>
    </>
  );
}

function AccountRecovery({ onBack }) {
  return (
    <SellerArticlePage
      title="Account Recovery"
      eyebrow="Seller Board"
      onBack={onBack}
      summary="Seller account recovery must protect the business, the buyer, and the marketplace. UrMall should never reveal old passwords. It should help sellers reset access safely."
      highlights={[
        { title: "Reset, never reveal", text: "Forgotten passwords should be replaced through a secure reset link or OTP." },
        { title: "Protect sensitive actions", text: "After recovery, payout changes and verification edits should require extra care." },
        { title: "Watch activity", text: "Login activity and 2FA help sellers notice suspicious access early." },
      ]}
      sections={[
        {
          title: "Recommended recovery flow",
          paragraphs: [
            "A seller who forgets a password should tap Forgot Password, verify their registered email or phone, and create a new password. The old password should never be shown, sent, or recoverable because secure systems store password hashes, not readable passwords.",
            "After a password reset, UrMall should close older sessions where possible and notify the seller that account access changed. If the seller did not request the reset, support should be available immediately.",
          ],
        },
        {
          title: "Why seller recovery needs extra protection",
          paragraphs: [
            "A seller account controls products, buyer messages, delivery details, and eventually money. If a bad actor recovers or enters a seller account, they can damage the seller's reputation and scam buyers using the store name.",
            "For that reason, account recovery should be convenient but not careless. Sensitive actions such as payout changes, verification document updates, or major contact changes should receive additional confirmation.",
          ],
        },
      ]}
    />
  );
}

function SellerPolicyCenter({ onBack }) {
  return (
    <SellerArticlePage
      title="Seller Policy Center"
      eyebrow="Seller Board"
      onBack={onBack}
      summary="The seller policy center keeps UrMall professional by making the rules clear before there is a problem."
      highlights={[
        { title: "Real products", text: "Listings must be truthful, available, and clearly described." },
        { title: "Safe payments", text: "Sellers must not confuse buyers with changing or misleading payment instructions." },
        { title: "Fair disputes", text: "Order issues should be handled with proof, respect, and clear communication." },
      ]}
      sections={[
        {
          title: "Core seller rules",
          paragraphs: [
            "Sellers should list only products they can honestly supply, use clear images, keep prices current, and explain condition, delivery, and pickup details before the buyer pays. A product listing is a promise to the buyer, not just a marketing post.",
            "A seller should not impersonate another business, make false verification claims, hide major defects, or accept payment for items they know are unavailable. These actions weaken trust across the marketplace.",
          ],
        },
        {
          title: "Dispute expectations",
          paragraphs: [
            "If a dispute happens, sellers should provide order details, product evidence, message history, delivery proof, and a clear explanation. Good records help support understand the situation quickly.",
            "UrMall should protect honest sellers and buyers, but it cannot do that well when transactions are unclear. Keep conversations organized and connected to the product or order whenever possible.",
          ],
        },
      ]}
    />
  );
}

export default function SellerBoard({ onBack }) {
  const [currentView, setCurrentView] = useState("menu");

  return (
    <div className="relative min-h-full bg-white">
      <SellerMenuPageHeader title="Seller Board" onBack={onBack} />
      <div className="space-y-5 px-4 py-4 sm:px-6 lg:px-8">
        <section className="rounded-2xl border border-gray-200 bg-gray-950 p-5 text-white shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300">
            Complete seller control
          </p>
          <h2 className="mt-3 text-2xl font-black">Everything serious sellers need in one board</h2>
          <p className="mt-3 max-w-5xl text-sm font-semibold leading-7 text-white/75">
            Manage trust, products, orders, messages, delivery, growth, performance, reports, security, and policy from one clean UrMall workspace.
          </p>
        </section>

        <section className="grid gap-3 lg:grid-cols-2">
          {BOARD_ITEMS.map((item) => (
            <SettingsSubMenuItem
              key={item.key}
              icon={item.icon}
              title={item.title}
              description={item.description}
              onClick={() => setCurrentView(item.key)}
            />
          ))}
        </section>
      </div>

      {currentView === "verification" ? (
        <div className="absolute inset-0 z-40 overflow-y-auto bg-white">
          <VerificationCenter onBack={() => setCurrentView("menu")} />
        </div>
      ) : null}

      {currentView === "orders" ? (
        <div className="absolute inset-0 z-40 overflow-y-auto bg-white">
          <BoardShell title="Orders" onBack={() => setCurrentView("menu")}>
            <BusinessStats initialView="orders" />
          </BoardShell>
        </div>
      ) : null}

      {currentView === "messages" ? (
        <div className="absolute inset-0 z-40 overflow-y-auto bg-white">
          <BoardShell title="Messages & Customer Care" onBack={() => setCurrentView("menu")}>
            <CustomerCare />
          </BoardShell>
        </div>
      ) : null}

      {currentView === "products" ? (
        <div className="absolute inset-0 z-40 overflow-y-auto bg-white">
          <BoardShell title="Product Management" onBack={() => setCurrentView("menu")}>
            <BusinessCatalog mode="store" />
          </BoardShell>
        </div>
      ) : null}

      {currentView === "delivery" ? (
        <div className="absolute inset-0 z-40 overflow-y-auto bg-white">
          <DeliverySettings onBack={() => setCurrentView("menu")} />
        </div>
      ) : null}

      {currentView === "promotions" ? (
        <div className="absolute inset-0 z-40 overflow-y-auto bg-white">
          <BoardShell title="Promotions" onBack={() => setCurrentView("menu")}>
            <BusinessPromotions />
          </BoardShell>
        </div>
      ) : null}

      {currentView === "performance" ? (
        <div className="absolute inset-0 z-40 overflow-y-auto bg-white">
          <BoardShell title="Store Performance" onBack={() => setCurrentView("menu")}>
            <BusinessInsights />
          </BoardShell>
        </div>
      ) : null}

      {currentView === "reports" ? (
        <div className="absolute inset-0 z-40 overflow-y-auto bg-white">
          <DisputesReports onBack={() => setCurrentView("menu")} />
        </div>
      ) : null}

      {currentView === "security" ? (
        <div className="absolute inset-0 z-40 overflow-y-auto bg-white">
          <AccountRecovery onBack={() => setCurrentView("menu")} />
        </div>
      ) : null}

      {currentView === "policy" ? (
        <div className="absolute inset-0 z-40 overflow-y-auto bg-white">
          <SellerPolicyCenter onBack={() => setCurrentView("menu")} />
        </div>
      ) : null}
    </div>
  );
}
