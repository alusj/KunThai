import { FileCheck2, FileText, Scale, Shield } from "lucide-react";
import { useState } from "react";

import SettingsSubMenuItem from "../../SettingsSubMenuItem";
import CommunityGuidelines from "./CommunityGuidelines/CommunityGuidelines";
import DataUsage from "./DataUsage/DataUsage";
import PrivacyPolicy from "./PrivacyPolicy/PrivacyPolicy";
import TermsOfService from "./TermsOfServices/TermsOfService";

export default function Privacy() {
  const [currentView, setCurrentView] = useState("menu");

  if (currentView === "privacy") {
    return <PrivacyPolicy onBack={() => setCurrentView("menu")} />;
  }

  if (currentView === "data") {
    return <DataUsage onBack={() => setCurrentView("menu")} />;
  }

  if (currentView === "guidelines") {
    return <CommunityGuidelines onBack={() => setCurrentView("menu")} />;
  }

  if (currentView === "service") {
    return <TermsOfService onBack={() => setCurrentView("menu")} />;
  }

  return (
    <div className="space-y-3 px-4">
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
  );
}
