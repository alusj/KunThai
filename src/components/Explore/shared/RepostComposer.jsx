import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Repeat2, Send, X } from "lucide-react";

import { useBrowserBack } from "../../../Backend/hooks/useBrowserBack";
import { createExploreRepost } from "../../../Backend/services/explore/repostService";
import { guardGuestAction } from "../../../Backend/services/guestModeService";
import { showToast } from "../../../Backend/services/toastService";
import { useI18n } from "../../../i18n";
import Avatar from "../shared/Avatar";
import RepostPreview from "./RepostPreview";
import { t as i18nText } from "../../../i18n/index";

const EXIT_MS = 280;

export default function RepostComposer({ onClose, onSuccess, profile, sourcePost }) {
  const { t } = useI18n();
  const [commentary, setCommentary] = useState("");
  const [privacy, setPrivacy] = useState("public");
  const [submitting, setSubmitting] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState("");
  const closeTimerRef = useRef(null);

  function close() {
    if (submitting || closing) return;
    setClosing(true);
    closeTimerRef.current = window.setTimeout(() => onClose?.(), EXIT_MS);
  }

  useBrowserBack(true, close, `repost-composer-${sourcePost?.id || "post"}`);

  useEffect(() => () => window.clearTimeout(closeTimerRef.current), []);

  async function submit(event) {
    event.preventDefault();
    if (submitting) return;
    if (guardGuestAction("repost", "post")) {
      close();
      return;
    }
    setSubmitting(true);
    setError("");

    try {
      const created = await createExploreRepost(sourcePost, { commentary, privacy });
      showToast(i18nText("ui.literals.k55c8a595e72e"), "success", { title: i18nText("ui.literals.k0c3053e49f81") });
      onSuccess?.(created);
      setClosing(true);
      closeTimerRef.current = window.setTimeout(() => onClose?.(), EXIT_MS);
    } catch (submitError) {
      setError(submitError.message || t("explore.unableRepost"));
      setSubmitting(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[115] h-dvh w-full overflow-hidden overscroll-none bg-slate-100 [contain:strict]">
      <form onSubmit={submit} className={`${closing ? "kt-repost-composer-exit" : "kt-repost-composer-enter"} flex h-full min-h-0 transform-gpu flex-col bg-slate-100 [backface-visibility:hidden]`}>
        <header className="flex-none border-b border-slate-200 bg-white px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] shadow-sm">
          <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
            <button type="button" onClick={close} className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-100 text-slate-700" aria-label={t("post.closeRepost")}>
              <X size={20} strokeWidth={2.4} />
            </button>
            <div className="text-center">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-sky-700">{t("post.create")}</p>
              <h2 className="text-lg font-black text-slate-950">{t("post.repost")}</h2>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-11 items-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white disabled:opacity-50"
            >
              <Send size={16} />
              {submitting ? t("post.posting") : t("post.post")}
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5">
          <div className="mx-auto max-w-2xl space-y-4">
            <div className="flex items-center gap-3 rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
              <Avatar name={profile?.displayName || t("feed.profileFallback")} src={profile?.avatarUrl} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black text-slate-950">{profile?.displayName || t("post.yourProfile")}</p>
                <p className="truncate text-xs font-bold text-slate-500">@{profile?.username || i18nText("ui.literals.k12dea96fec20")}</p>
              </div>
              <Repeat2 className="text-sky-700" size={20} />
            </div>

            <textarea
              value={commentary}
              onChange={(event) => {
                setCommentary(event.target.value);
                setError("");
              }}
              autoFocus
              rows={4}
              placeholder={t("post.repostPlaceholder")}
              className="w-full resize-none rounded-[24px] border border-slate-200 bg-white p-4 text-lg font-bold leading-7 text-slate-950 shadow-sm outline-none placeholder:text-slate-400 focus:border-sky-300"
            />

            <RepostPreview sourcePost={sourcePost} compact />

            {error ? <p className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</p> : null}
          </div>
        </div>

        <footer className="flex-none border-t border-slate-200 bg-white px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3">
          <div className="mx-auto flex max-w-2xl gap-2">
            {[{ value: "public", label: t("explore.visPublic") }, { value: "circle", label: t("explore.visCircle") }].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setPrivacy(option.value)}
                className={`h-11 rounded-2xl px-5 text-sm font-black ${privacy === option.value ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600"}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </footer>
      </form>
    </div>,
    document.body,
  );
}
