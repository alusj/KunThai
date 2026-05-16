import { FileCheck2, FileText, Scale, Shield } from "lucide-react";
import { useState } from "react";

import SellerMenuPageHeader from "../../SellerMenuPageHeader";
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

      {currentView === "privacy" ? (
        <div className="absolute inset-0 z-40 overflow-y-auto bg-white">
          <PrivacyPolicy onBack={() => setCurrentView("menu")} />
        </div>
      ) : null}

      {currentView === "data" ? (
        <div className="absolute inset-0 z-40 overflow-y-auto bg-white">
          <DataUsage onBack={() => setCurrentView("menu")} />
        </div>
      ) : null}

      {currentView === "guidelines" ? (
        <div className="absolute inset-0 z-40 overflow-y-auto bg-white">
          <CommunityGuidelines onBack={() => setCurrentView("menu")} />
        </div>
      ) : null}

      {currentView === "service" ? (
        <div className="absolute inset-0 z-40 overflow-y-auto bg-white">
          <TermsOfService onBack={() => setCurrentView("menu")} />
        </div>
      ) : null}
    </div>
  );
}
