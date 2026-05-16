import AppBackTab from "../../../../../../shared/AppBackTab.jsx";

export default function SellerMenuPageHeader({ title, eyebrow = "UrMall", onBack }) {
  return (
    <header className="sticky top-0 z-30 border-b border-gray-100 bg-white/95 px-4 py-3 shadow-sm backdrop-blur sm:px-6">
      <div className="flex min-w-0 items-start gap-3">
        <AppBackTab
          onBack={onBack}
          label="Back"
          historyKey="marketplace-business-menu-screen"
          className="mt-0.5 flex-none"
          useHistoryLayer={false}
        />
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-700 sm:text-xs">
            {eyebrow}
          </p>
          <h2 className="mt-1 text-xl font-black text-gray-950 sm:text-2xl">{title}</h2>
        </div>
      </div>
    </header>
  );
}
