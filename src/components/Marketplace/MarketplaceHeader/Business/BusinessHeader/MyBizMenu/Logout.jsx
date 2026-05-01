import { LogOut } from "lucide-react";

export default function Logout() {
  return (
    <button
      type="button"
      className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-black text-red-600 transition hover:bg-red-100"
    >
      <LogOut size={18} strokeWidth={2.3} />
      Sign out
    </button>
  );
}
