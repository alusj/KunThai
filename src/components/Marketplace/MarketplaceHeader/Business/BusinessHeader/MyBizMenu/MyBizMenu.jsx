import { useState } from "react";
import MenuHeader from "./MenuHeader";

/* =========================
   MAIN MENU SECTIONS
========================= */
import ProfileSettings from "./MyBizPages/ProfileSettings/ProfileSettings";
import BusinessSettings from "./MyBizPages/BusinessSettings/BusinessSettings";
import Payments from "./MyBizPages/PaymentsPayouts/Payments";
import Security from "./MyBizPages/Security/Security";
import HelpSupport from "./MyBizPages/HelpSupport/HelpSupport";
import Privacy from "./MyBizPages/HelpSupport/Legal/Privacy";
import Logout from "./Logout";

export default function MyBizMenu({ isOpen, onClose }) {
  const [activeScreen, setActiveScreen] = useState(null);

  if (!isOpen) return null;

  return (
    <>
      {/* =========================
          Backdrop
      ========================= */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
      />

      {/* =========================
          Drawer
      ========================= */}
      <aside className="fixed top-0 right-0 h-full w-80 bg-white z-40 shadow-xl flex flex-col">

        {/* =========================
            Header
        ========================= */}
        <MenuHeader
          title={activeScreen ? activeScreen.title : "My Business Menu"}
          showBack={!!activeScreen}
          onBack={() => setActiveScreen(null)}
          onClose={onClose}
        />

        {/* =========================
            Body
        ========================= */}
        <div className="flex-1 overflow-y-auto">

          {/* =========================
              FULL SCREEN VIEW
          ========================= */}
          {activeScreen && (
            <div className="h-full">
              {activeScreen.component}
            </div>
          )}

          {/* =========================
              MENU LIST
          ========================= */}
          {!activeScreen && (
            <>
              <Section title="Profile Settings">
                <ProfileSettings onNavigate={setActiveScreen} />
              </Section>

              <Section title="Business Settings">
                <BusinessSettings onNavigate={setActiveScreen} />
              </Section>

              <Section title="Payments & Payouts">
                <Payments onNavigate={setActiveScreen} />
              </Section>

              <Section title="Security">
                <Security onNavigate={setActiveScreen} />
              </Section>

              <Section title="Help & Support">
                <HelpSupport onNavigate={setActiveScreen} />
              </Section>

              {/* ✅ PRIVACY & TERMS */}
              <Section title="Privacy & Legal">
                <Privacy onNavigate={setActiveScreen} />
              </Section>
            </>
          )}
        </div>

        {/* =========================
            Logout (only on menu)
        ========================= */}
        {!activeScreen && (
          <div className="border-t p-4">
            <Logout />
          </div>
        )}
      </aside>
    </>
  );
}

/* =========================
   Section Title Wrapper
========================= */
function Section({ title, children }) {
  return (
    <>
      <div className="px-4 pt-6 pb-2 text-sm font-bold text-gray-600 uppercase">
        {title}
      </div>
      {children}
    </>
  );
}
