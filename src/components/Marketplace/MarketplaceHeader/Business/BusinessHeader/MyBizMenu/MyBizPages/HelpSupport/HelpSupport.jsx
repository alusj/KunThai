import { CircleHelp, Headphones, LifeBuoy } from "lucide-react";
import { useState } from "react";

import { useI18n, t } from "../../../../../../../../i18n";
import SellerMenuPageHeader from "../SellerMenuPageHeader";
import SellerSubPagePanel from "../SellerSubPagePanel";
import SettingsSubMenuItem from "../SettingsSubMenuItem";
import ContactSupport from "./ContactSupport/ContactSupport";
import FAQ from "./FAQ/FAQ";
import HelpHome from "./HelpHome/HelpHome";

export default function HelpSupport({ onBack }) {
  useI18n();
  const [currentView, setCurrentView] = useState("menu");

  return (
    <div className="relative min-h-full bg-white">
      <SellerMenuPageHeader title={t("urmall.biz.menu.supportTitle")} onBack={onBack} />
      <div className="space-y-3 px-4 py-4 sm:px-6 lg:px-8">
        <SettingsSubMenuItem
          icon={Headphones}
          title={t("urmall.biz.help.contactTitle")}
          description={t("urmall.biz.help.contactDesc")}
          onClick={() => setCurrentView("contact")}
        />
        <SettingsSubMenuItem
          icon={LifeBuoy}
          title={t("urmall.biz.help.homeTitle")}
          description={t("urmall.biz.help.homeDesc")}
          onClick={() => setCurrentView("help")}
        />
        <SettingsSubMenuItem
          icon={CircleHelp}
          title={t("urmall.biz.help.faqTitle")}
          description={t("urmall.biz.help.faqDesc")}
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
