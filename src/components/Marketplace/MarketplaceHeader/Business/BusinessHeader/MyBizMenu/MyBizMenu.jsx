import {
  BadgeHelp,
  BriefcaseBusiness,
  CreditCard,
  FileText,
  LayoutDashboard,
  LockKeyhole,
  UserRound,
} from "lucide-react";
import { useEffect, useState } from "react";

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
import SellerBoard from "./MyBizPages/SellerBoard/SellerBoard";

function getDrawerScreen(key, props = {}) {
  const screens = {
  profile: {
    component: <ProfileSettings initialView={props.profileInitialView} onBack={props.onBack} />,
  },
  business: {
    component: <BusinessSettings onBack={props.onBack} />,
  },
  payments: {
    component: <Payments onBack={props.onBack} />,
  },
  security: {
    component: <Security onBack={props.onBack} />,
  },
  support: {
    component: <HelpSupport onBack={props.onBack} />,
  },
  legal: {
    component: <Privacy onBack={props.onBack} />,
  },
  board: {
    component: <SellerBoard onBack={props.onBack} />,
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
    ? getDrawerScreen(activeScreenKey, {
        profileInitialView,
        onBack: () => setActiveScreenKey(null),
      })
    : null;

  useEffect(() => {
    if (isOpen) {
      setActiveScreenKey(initialScreenKey);
    }
  }, [initialScreenKey, isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  function closeDrawer() {
    setActiveScreenKey(null);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
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
                    icon={LayoutDashboard}
                    title="Seller Board"
                    description="Orders, messages, products, delivery, verification, reports, security, and policies."
                    onClick={() => setActiveScreenKey("board")}
                  />
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
        <section className="absolute inset-0 flex h-full w-full flex-col bg-white shadow-2xl">
          <div className="min-h-0 flex-1 overflow-y-auto">
            {activeScreen.component}
          </div>
        </section>
      ) : null}
    </div>
  );
}
