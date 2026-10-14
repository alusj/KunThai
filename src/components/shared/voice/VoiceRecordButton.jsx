import { Mic, Square } from "lucide-react";

import { useI18n } from "../../../i18n";

/** The mic / stop button beside a chat's reply box (UrMall and Explore). */
export default function VoiceRecordButton({ recording = false, disabled = false, onClick, className = "" }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={recording ? t("voiceNotes.stop") : t("voiceNotes.record")}
      aria-pressed={recording}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition disabled:opacity-50 ${
        recording ? "kt-rec-button" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
      } ${className}`}
    >
      {recording ? <Square size={16} fill="currentColor" aria-hidden="true" /> : <Mic size={18} aria-hidden="true" />}
    </button>
  );
}
