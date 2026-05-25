import { FileCheck2, FileText, Scale, Shield } from "lucide-react";
import { useState } from "react";

import SellerMenuPageHeader from "../../SellerMenuPageHeader";
import SellerSubPagePanel from "../../SellerSubPagePanel";
import SettingsSubMenuItem from "../../SettingsSubMenuItem";
import CommunityGuidelines from "./CommunityGuidelines/CommunityGuidelines";
import DataUsage from "./DataUsage/DataUsage";
import PrivacyPolicy from "./PrivacyPolicy/PrivacyPolicy";
import TermsOfService from "./TermsOfServices/TermsOfService";

export default function Privacy({ onBack }) {
  const [currentView, setCurrentView] = useState("menu");

  return (
    <div className="relative min-h-full bg-white">
      <SellerMenuPageHeader title="Privacy & Legal" onBack={onBack} />
      <div className="space-y-3 px-4 py-4 sm:px-6 lg:px-8">
        <SettingsSubMenuItem
          icon={Shield}
          title="Privacy Policy"
          description="How seller and buyer information is protected."
          onClick={() => setCurrentView("privacy")}
        />
        <SettingsSubMenuItem
          icon={FileText}
          title="Data Usage"
          description="Understand how business data is used across KunThai."
          onClick={() => setCurrentView("data")}
        />
        <SettingsSubMenuItem
          icon={FileCheck2}
          title="Community Guidelines"
          description="UrMall standards for safe and trusted selling."
          onClick={() => setCurrentView("guidelines")}
        />
        <SettingsSubMenuItem
          icon={Scale}
          title="Terms Of Service"
          description="Rules and responsibilities for sellers using UrMall."
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
