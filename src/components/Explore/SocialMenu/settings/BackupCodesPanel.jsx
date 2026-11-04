import { useState } from "react";
import { HiOutlineClipboard, HiOutlineKey } from "react-icons/hi2";

import { showToast } from "../../../../Backend/services/toastService";
import { t as i18nText } from "../../../../i18n/index";

// The 10 backup codes, shown once right after they are created. "Done" only
// unlocks once the person confirms they saved them: these codes are the way
// back in for an account with no email.
export default function BackupCodesPanel({ codes = [], onDone }) {
  const [saved, setSaved] = useState(false);
  const [shownForCopy, setShownForCopy] = useState(false);

  async function copyAll() {
    const text = codes.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      showToast(i18nText("accountRecovery.copied"), "success");
    } catch {
      // No clipboard: leave the codes selectable so they can be copied by hand.
      setShownForCopy(true);
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
      <p className="flex items-center gap-2 text-sm font-black text-slate-950">
        <HiOutlineKey className="text-lg text-emerald-700" aria-hidden="true" />
        {i18nText("accountRecovery.backupTitle")}
      </p>
      <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">{i18nText("accountRecovery.backupIntro")}</p>
      <ol className={`mt-3 grid grid-cols-2 gap-2 ${shownForCopy ? "select-all" : "select-text"}`}>
        {codes.map((code) => (
          <li key={code} className="rounded-xl border border-emerald-200 bg-white px-2 py-2 text-center font-mono text-sm font-black tracking-wider text-slate-900">
            {code}
          </li>
        ))}
      </ol>
      <button
        type="button"
        onClick={copyAll}
        className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-white px-3 text-sm font-black text-emerald-800"
      >
        <HiOutlineClipboard className="text-base" aria-hidden="true" />
        {i18nText("accountRecovery.copyAll")}
      </button>
      <label className="mt-3 flex min-h-11 items-center gap-3 rounded-2xl bg-white px-3 text-sm font-bold text-slate-800">
        <input type="checkbox" checked={saved} onChange={(event) => setSaved(event.target.checked)} className="h-5 w-5 accent-emerald-600" />
        {i18nText("accountRecovery.savedCheck")}
      </label>
      <button
        type="button"
        onClick={() => onDone?.()}
        disabled={!saved}
        className="mt-3 min-h-12 w-full rounded-2xl bg-emerald-600 px-4 text-sm font-black text-white disabled:opacity-50"
      >
        {i18nText("accountRecovery.done")}
      </button>
    </div>
  );
}
