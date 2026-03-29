import BackTab from "./BackTab";

export default function TransactionsHeader({ setActiveScreen }) {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b bg-white">

      {/* Back Button */}
      <BackTab onBack={() => setActiveScreen("dashboard")} />

      {/* Title */}
      <h1 className="text-lg font-bold">
        Transactions History
      </h1>

      {/* Empty spacing for balance */}
      <div className="w-6"></div>
    </div>
  );
}
