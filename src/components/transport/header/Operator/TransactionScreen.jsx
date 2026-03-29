import { useState } from "react";
import TransactionsHeader from "./TransactionsHeader";
import CashIn from "./CashIn";
import CashOut from "./CashOut";

export default function TransactionsScreen({ setActiveScreen }) {
  const [activeTab, setActiveTab] = useState("cashout");

  return (
    <div className="min-h-screen w-full bg-gray-50 flex flex-col">

      {/* Header */}
      <TransactionsHeader setActiveScreen={setActiveScreen} />

      {/* Tabs */}
      <div className="flex border-b bg-white">

        <button
          onClick={() => setActiveTab("cashout")}
          className={`flex-1 text-center py-4 font-semibold transition ${
            activeTab === "cashout"
              ? "text-blue-600 border-b-2 border-blue-600"
              : "text-gray-500"
          }`}
        >
          Cash Out History
        </button>

        <button
          onClick={() => setActiveTab("cashin")}
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
      <div className="flex-1 p-6">
        {activeTab === "cashout" && <CashOut />}
        {activeTab === "cashin" && <CashIn />}
      </div>

    </div>
  );
}
