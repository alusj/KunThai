import { ChevronDown, Lightbulb } from "lucide-react";

export default function SuggestedTextSelect({ label = "Suggested text", suggestions = [], onSelect, disabled = false }) {
  function choose(event) {
    const selected = suggestions.find((item) => item.id === event.target.value);
    if (selected) onSelect?.(selected.text, selected);
    event.target.value = "";
  }

  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 text-xs font-black text-zinc-600"><Lightbulb size={14} className="text-amber-600" /> {label}</span>
      <span className="relative block">
        <select defaultValue="" disabled={disabled || !suggestions.length} onChange={choose} className="h-10 w-full appearance-none rounded-lg border border-zinc-300 bg-zinc-50 pl-3 pr-10 text-sm font-bold text-zinc-700 outline-none hover:bg-white focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-50">
          <option value="">Choose a suggestion…</option>
          {suggestions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
        <ChevronDown aria-hidden="true" size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400" />
      </span>
    </label>
  );
}
