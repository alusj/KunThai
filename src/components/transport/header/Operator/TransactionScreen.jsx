import { useState } from "react";
import TransactionsHeader from "./TransactionsHeader";
import CashIn from "./CashIn";
import CashOut from "./CashOut";

const transactionTabs = ["cashout", "cashin"];

export default function TransactionsScreen({ setActiveScreen }) {
  const [activeTab, setActiveTab] = useState("cashout");

  function selectTab(tab) {
    if (tab === activeTab) return;
    setActiveTab(tab);
  }

  const activeSlide = transactionTabs.indexOf(activeTab);

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
      <div className="min-h-0 flex-1 overflow-hidden">
        <div
          className="flex h-full w-full transition-transform duration-300 ease-[var(--kt-ease-emphasized)] motion-reduce:transition-none"
          style={{ transform: `translateX(-${activeSlide * 100}%)` }}
        >
          <section
            aria-hidden={activeTab !== "cashout"}
            className="h-full min-w-full overflow-y-auto p-6"
          >
            <CashOut />
          </section>
          <section
            aria-hidden={activeTab !== "cashin"}
            className="h-full min-w-full overflow-y-auto p-6"
          >
            <CashIn />
          </section>
        </div>
      </div>

    </div>
  );
}
