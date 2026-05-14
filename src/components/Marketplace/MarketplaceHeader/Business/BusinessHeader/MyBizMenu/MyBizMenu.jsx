import {
  BadgeHelp,
  BriefcaseBusiness,
  CreditCard,
  FileText,
  LockKeyhole,
  UserRound,
} from "lucide-react";
import { useEffect, useState } from "react";

import AppBackTab from "../../../../../shared/AppBackTab";
import MenuHeader from "./MenuHeader";
import SellerDrawerNavItem from "./SellerDrawerNavItem";
import SellerDrawerProfile from "./SellerDrawerProfile";
import SellerDrawerSection from "./SellerDrawerSection";

import BusinessSettings from "./MyBizPages/BusinessSettings/BusinessSettings";
import HelpSupport from "./MyBizPages/HelpSupport/HelpSupport";
import Privacy from "./MyBizPages/HelpSupport/Legal/Privacy";
import Payments from "./MyBizPages/PaymentsPayouts/Payments";
import ProfileSettings from "./MyBizPages/ProfileSettings/ProfileSettings";
import Security from "./MyBizPages/Security/Security";

function getDrawerScreen(key, props = {}) {
  const screens = {
  profile: {
    title: "Profile",
    component: <ProfileSettings initialView={props.profileInitialView} />,
  },
  business: {
    title: "Store Settings",
    component: <BusinessSettings />,
  },
  payments: {
    title: "Payments & Payouts",
    component: <Payments />,
  },
  security: {
    title: "Security",
    component: <Security />,
  },
  support: {
    title: "Help & Support",
    component: <HelpSupport />,
  },
  legal: {
    title: "Privacy & Legal",
    component: <Privacy />,
  },
  };

  return screens[key] || null;
}

export default function MyBizMenu({
  isOpen,
  onClose,
  initialScreenKey = null,
  profileInitialView = "menu",
}) {
  const [activeScreenKey, setActiveScreenKey] = useState(initialScreenKey);
  const activeScreen = activeScreenKey
    ? getDrawerScreen(activeScreenKey, { profileInitialView })
    : null;

  useEffect(() => {
    if (isOpen) {
      setActiveScreenKey(initialScreenKey);
    }
  }, [initialScreenKey, isOpen]);

  if (!isOpen) return null;

  function closeDrawer() {
    setActiveScreenKey(null);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 bg-gray-950/45"
        onClick={closeDrawer}
        aria-label="Close seller menu"
      />

      <aside
        className={`absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-gray-50 shadow-2xl transition-transform duration-300 ${
          activeScreen ? "translate-x-full" : "translate-x-0"
        }`}
      >
        <MenuHeader
          title="Seller Menu"
          showBack={false}
          onBack={null}
          onClose={closeDrawer}
        />

        <div className="flex-1 overflow-y-auto pb-6">
              <SellerDrawerProfile
                onOpenProfile={() => setActiveScreenKey("profile")}
              />

              <div className="space-y-5 px-4 pt-5">
                <SellerDrawerSection title="Manage Store">
                  <SellerDrawerNavItem
                    icon={UserRound}
                    title="Profile"
                    description="Owner profile, public seller details, and business identity."
                    onClick={() => setActiveScreenKey("profile")}
                  />
                  <SellerDrawerNavItem
                    icon={BriefcaseBusiness}
                    title="Store Settings"
                    description="Store details, categories, pickup, delivery, and operating hours."
                    onClick={() => setActiveScreenKey("business")}
                  />
                </SellerDrawerSection>

                <SellerDrawerSection title="Money & Trust">
                  <SellerDrawerNavItem
                    icon={CreditCard}
                    title="Payments & Payouts"
                    description="Bank details, payout history, transactions, and withdrawals."
                    onClick={() => setActiveScreenKey("payments")}
                  />
                  <SellerDrawerNavItem
                    icon={LockKeyhole}
                    title="Security"
                    description="Password, login activity, and two-factor authentication."
                    onClick={() => setActiveScreenKey("security")}
                  />
                </SellerDrawerSection>

                <SellerDrawerSection title="Support">
                  <SellerDrawerNavItem
                    icon={BadgeHelp}
                    title="Help & Support"
                    description="Contact support, help guides, and seller questions."
                    onClick={() => setActiveScreenKey("support")}
                  />
                  <SellerDrawerNavItem
                    icon={FileText}
                    title="Privacy & Legal"
                    description="Privacy policy, terms, data usage, and community guidelines."
                    onClick={() => setActiveScreenKey("legal")}
                  />
                </SellerDrawerSection>
              </div>
            </div>
      </aside>

      {activeScreen ? (
        <section className="absolute inset-0 flex h-full w-full flex-col bg-gray-50 shadow-2xl">
          <header className="sticky top-0 z-30 border-b border-gray-100 bg-white/95 px-3 py-3 shadow-sm backdrop-blur sm:px-5">
            <div className="flex min-w-0 items-start gap-3">
              <AppBackTab
                onBack={() => setActiveScreenKey(null)}
                label="Back to seller menu"
                historyKey="marketplace-business-menu-screen"
                className="mt-0.5 flex-none"
                useHistoryLayer={false}
              />
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-700 sm:text-xs">UrMall</p>
                <h2 className="mt-1 text-xl font-semibold text-gray-950 sm:text-2xl">{activeScreen.title}</h2>
              </div>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto bg-white py-4">
            {activeScreen.component}
          </div>
        </section>
      ) : null}
    </div>
  );
}
