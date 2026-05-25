import { CircleHelp, Headphones, LifeBuoy } from "lucide-react";
import { useState } from "react";

import SellerMenuPageHeader from "../SellerMenuPageHeader";
import SellerSubPagePanel from "../SellerSubPagePanel";
import SettingsSubMenuItem from "../SettingsSubMenuItem";
import ContactSupport from "./ContactSupport/ContactSupport";
import FAQ from "./FAQ/FAQ";
import HelpHome from "./HelpHome/HelpHome";

export default function HelpSupport({ onBack }) {
  const [currentView, setCurrentView] = useState("menu");

  return (
    <div className="relative min-h-full bg-white">
      <SellerMenuPageHeader title="Help & Support" onBack={onBack} />
      <div className="space-y-3 px-4 py-4 sm:px-6 lg:px-8">
        <SettingsSubMenuItem
          icon={Headphones}
          title="Contact Support"
          description="Send a support request for seller account or order issues."
          onClick={() => setCurrentView("contact")}
        />
        <SettingsSubMenuItem
          icon={LifeBuoy}
          title="Help Home"
          description="Find seller guides, dashboard help, and setup answers."
          onClick={() => setCurrentView("help")}
        />
        <SettingsSubMenuItem
          icon={CircleHelp}
          title="FAQs"
          description="Quick answers to common seller questions."
          onClick={() => setCurrentView("faq")}
        />
      </div>

      <SellerSubPagePanel currentView={currentView}>
        {(view) => {
          if (view === "contact") return <ContactSupport onBack={() => setCurrentView("menu")} />;
          if (view === "help") return <HelpHome onBack={() => setCurrentView("menu")} />;
          if (view === "faq") return <FAQ onBack={() => setCurrentView("menu")} />;
          return null;
        }}
      </SellerSubPagePanel>
    </div>
  );
}
