import { useRef, useState } from "react";
import { HiOutlinePaperAirplane, HiOutlineXMark } from "react-icons/hi2";

import { MentionHashtagSuggestions } from "../../../shared/MentionHashtagAutocomplete";
import { useMentionHashtagAutocomplete } from "../../../../../Backend/hooks/useMentionHashtagAutocomplete";
import { useI18n } from "../../../../../i18n";

export default function VideoCommentInput({ onClose, onSubmit }) {
  const { t } = useI18n();
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
    onClose?.();
  }

  return (
    <form onSubmit={handleSubmit} className="absolute inset-x-3 bottom-4 z-20 rounded-[22px] bg-white p-2 shadow-2xl sm:inset-x-5">
      <div className="relative flex items-center gap-2">
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
          autoFocus
          placeholder={t("swip.commentPlaceholder")}
          className="h-11 min-w-0 flex-1 rounded-2xl bg-slate-100 px-4 text-sm font-semibold text-slate-900 outline-none"
        />
        <button
          type="submit"
          disabled={!value.trim()}
          className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white disabled:bg-slate-200 disabled:text-slate-400"
          aria-label={t("swip.sendComment")}
        >
          <HiOutlinePaperAirplane />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-600"
          aria-label={t("swip.closeComment")}
        >
          <HiOutlineXMark />
        </button>
      </div>
    </form>
  );
}
