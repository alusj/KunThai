import All from "./tabs/All";

export default function Swip({ currentUserId = "", onViewProfile }) {
  return (
    <div className="flex min-h-[calc(100dvh-57px)] flex-col bg-slate-950">
      <div className="flex-1">
        <All currentUserId={currentUserId} onViewProfile={onViewProfile} />
      </div>
    </div>
  );
}
