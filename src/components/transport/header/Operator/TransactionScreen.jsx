import { useState } from "react";
import TransactionsHeader from "./TransactionsHeader";
import CashIn from "./CashIn";
import CashOut from "./CashOut";

const transactionTabs = ["cashout", "cashin"];

export default function TransactionsScreen({ setActiveScreen }) {
  const [activeTab, setActiveTab] = useState("cashout");
  const [tabDirection, setTabDirection] = useState("forward");

  function selectTab(tab) {
    if (tab === activeTab) return;
    setTabDirection(transactionTabs.indexOf(tab) > transactionTabs.indexOf(activeTab) ? "forward" : "backward");
    setActiveTab(tab);
  }

  return (
    <div className="min-h-screen w-full bg-gray-50 flex flex-col">

      {/* Header */}
      <TransactionsHeader setActiveScreen={setActiveScreen} />

      {/* Tabs */}
      <div className="flex border-b bg-white">

        <button
          type="button"
          onClick={() => selectTab("cashout")}
          className={`flex-1 text-center py-4 font-semibold transition ${
            activeTab === "cashout"
              ? "text-blue-600 border-b-2 border-blue-600"
              : "text-gray-500"
          }`}
        >
          Cash Out History
        </button>

        <button
          type="button"
          onClick={() => selectTab("cashin")}
          className={`flex-1 text-center py-4 font-semibold transition ${
            activeTab === "cashin"
              ? "text-blue-600 border-b-2 border-blue-600"
              : "text-gray-500"
          }`}
        >
          Cash In History
        </button>

      </div>

      {/* Content */}
      <div
        key={activeTab}
        className={`flex-1 p-6 ${tabDirection === "backward" ? "kt-parent-tab-slide-backward" : "kt-parent-tab-slide-forward"}`}
      >
        {activeTab === "cashout" && <CashOut />}
        {activeTab === "cashin" && <CashIn />}
      </div>

    </div>
  );
}
