import { FileCheck2, FileText, Scale, Shield } from "lucide-react";
import { useState } from "react";

import { useI18n, t } from "../../../../../../../../../i18n";
import SellerMenuPageHeader from "../../SellerMenuPageHeader";
import SellerSubPagePanel from "../../SellerSubPagePanel";
import SettingsSubMenuItem from "../../SettingsSubMenuItem";
import CommunityGuidelines from "./CommunityGuidelines/CommunityGuidelines";
import DataUsage from "./DataUsage/DataUsage";
import PrivacyPolicy from "./PrivacyPolicy/PrivacyPolicy";
import TermsOfService from "./TermsOfServices/TermsOfService";

export default function Privacy({ onBack }) {
  useI18n();
  const [currentView, setCurrentView] = useState("menu");

  return (
    <div className="relative min-h-full bg-white">
      <SellerMenuPageHeader title={t("urmall.biz.menu.legalTitle")} onBack={onBack} />
      <div className="space-y-3 px-4 py-4 sm:px-6 lg:px-8">
        <SettingsSubMenuItem
          icon={Shield}
          title={t("urmall.biz.legal.privacyTitle")}
          description={t("urmall.biz.legal.privacyDesc")}
          onClick={() => setCurrentView("privacy")}
        />
        <SettingsSubMenuItem
          icon={FileText}
          title={t("urmall.biz.legal.dataTitle")}
          description={t("urmall.biz.legal.dataDesc")}
          onClick={() => setCurrentView("data")}
        />
        <SettingsSubMenuItem
          icon={FileCheck2}
          title={t("urmall.biz.legal.guidelinesTitle")}
          description={t("urmall.biz.legal.guidelinesDesc")}
          onClick={() => setCurrentView("guidelines")}
        />
        <SettingsSubMenuItem
          icon={Scale}
          title={t("urmall.biz.legal.termsTitle")}
          description={t("urmall.biz.legal.termsDesc")}
          onClick={() => setCurrentView("service")}
        />
      </div>

      <SellerSubPagePanel currentView={currentView}>
        {(view) => {
          if (view === "privacy") return <PrivacyPolicy onBack={() => setCurrentView("menu")} />;
          if (view === "data") return <DataUsage onBack={() => setCurrentView("menu")} />;
          if (view === "guidelines") return <CommunityGuidelines onBack={() => setCurrentView("menu")} />;
          if (view === "service") return <TermsOfService onBack={() => setCurrentView("menu")} />;
          return null;
        }}
      </SellerSubPagePanel>
    </div>
  );
}
