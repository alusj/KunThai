import { useRef, useState } from "react";
import { HiOutlinePaperAirplane } from "react-icons/hi2";

import { MentionHashtagSuggestions } from "../../../../shared/MentionHashtagAutocomplete";
import { useMentionHashtagAutocomplete } from "../../../../../../Backend/hooks/useMentionHashtagAutocomplete";

export default function CommentComposer({ onSubmit }) {
  const [value, setValue] = useState("");
  const inputRef = useRef(null);
  const autocomplete = useMentionHashtagAutocomplete({ value, onValueChange: setValue, inputRef });

  async function handleSubmit(event) {
    event.preventDefault();
    const body = value.trim();

    if (!body) {
      return;
    }

    await onSubmit?.(body);
    setValue("");
  }

  return (
    <form onSubmit={handleSubmit} className="relative flex items-center gap-2 border-t border-slate-100 px-4 py-3">
      <MentionHashtagSuggestions
        trigger={autocomplete.trigger}
        results={autocomplete.results}
        loading={autocomplete.loading}
        onSelect={autocomplete.selectSuggestion}
      />
      <input
        ref={inputRef}
        value={value}
        onChange={autocomplete.handleInputChange}
        onBlur={() => window.setTimeout(autocomplete.closeSuggestions, 150)}
        placeholder="Write a comment..."
        className="h-10 min-w-0 flex-1 rounded-2xl bg-slate-50 px-4 text-sm font-medium text-slate-900 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-sky-500/20"
      />
      <button
        type="submit"
        disabled={!value.trim()}
        className="flex h-10 w-10 flex-none items-center justify-center rounded-2xl bg-slate-950 text-white disabled:bg-slate-200 disabled:text-slate-400"
        aria-label="Send comment"
      >
        <HiOutlinePaperAirplane />
      </button>
    </form>
  );
}
