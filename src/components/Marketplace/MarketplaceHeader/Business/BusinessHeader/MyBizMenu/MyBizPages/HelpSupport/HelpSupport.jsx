import { CircleHelp, Headphones, LifeBuoy } from "lucide-react";
import { useState } from "react";

import SettingsSubMenuItem from "../SettingsSubMenuItem";
import ContactSupport from "./ContactSupport/ContactSupport";
import FAQ from "./FAQ/FAQ";
import HelpHome from "./HelpHome/HelpHome";

export default function HelpSupport() {
  const [currentView, setCurrentView] = useState("menu");

  if (currentView === "contact") {
    return <ContactSupport onBack={() => setCurrentView("menu")} />;
  }

  if (currentView === "help") {
    return <HelpHome onBack={() => setCurrentView("menu")} />;
  }

  if (currentView === "faq") {
    return <FAQ onBack={() => setCurrentView("menu")} />;
  }

  return (
    <div className="space-y-3 px-4">
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
  );
}
