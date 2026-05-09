import All from "./tabs/All";

export default function Swip({ currentUserId = "", onViewProfile }) {
  return (
    <div className="flex min-h-[calc(100vh-112px)] flex-col bg-transparent">
      <div className="flex-1">
        <All currentUserId={currentUserId} onViewProfile={onViewProfile} />
      </div>
    </div>
  );
}
