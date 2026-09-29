import { Check, ClipboardList, X } from "lucide-react";

import {
  cancelFormGuide,
  chooseFormGuideOption,
  guideText,
  setFormGuideI18n,
  toggleFormGuideOption,
  useFormGuideFlow,
} from "../../../Backend/services/ai/formGuideFlow";
import { getLocale, uiText, useI18n as useUiLocale } from "../../../i18n/index.js";

setFormGuideI18n({ locale: getLocale, translate: uiText });

// KAI — guided form filling, shown inside the chat. Questions and answers read
// like the conversation; choices are buttons, free answers are typed in the
// normal chat box, and each section is filled only from the "Fill" button.

function SummaryCard({ rows }) {
  useUiLocale();
  return (
    <div className="mt-2 rounded-2xl border border-sky-200 bg-sky-50/70 p-3">
      <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.12em] text-sky-700">
        <ClipboardList size={13} /> {guideText("rowsTitle")}
      </p>
      <dl className="mt-2 space-y-1.5">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[7rem_1fr] gap-2 text-xs">
            <dt className="font-bold text-slate-500">{label}</dt>
            <dd className="min-w-0 break-words font-black text-slate-900">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default function AiFormGuideFlow() {
  useUiLocale();
  const flow = useFormGuideFlow();
  if (!flow.transcript.length) return null;
  const question = flow.active ? flow.question : null;

  return (
    <div className="space-y-3" data-kai-form-guide>
      {flow.transcript.map((entry) =>
        entry.from === "user" ? (
          <div key={entry.id} className="flex justify-end">
            <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-slate-900 px-3.5 py-2 text-sm leading-relaxed text-white">{entry.text}</p>
          </div>
        ) : (
          <div key={entry.id} className="max-w-[94%]">
            <div className="rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3.5 py-3">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{entry.text}</p>
              {entry.card?.type === "summary" ? <SummaryCard rows={entry.card.rows} /> : null}
            </div>
          </div>
        ),
      )}

      {question ? (
        <div className="space-y-2 pl-1">
          {question.kind === "multi" ? (
            <>
              <div className="flex flex-wrap gap-1.5">
                {question.options.map((option) => {
                  const selected = question.selected.includes(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleFormGuideOption(option.value)}
                      className={`inline-flex max-w-full items-center gap-1 rounded-2xl border px-3 py-2 text-left text-xs font-black transition ${
                        selected ? "border-sky-600 bg-sky-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-sky-300 hover:bg-sky-50"
                      }`}
                    >
                      {selected ? <Check size={12} /> : null}
                      {option.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => chooseFormGuideOption("__done")}
                  className="rounded-2xl border border-emerald-600 bg-emerald-600 px-3 py-2 text-xs font-black text-white hover:bg-emerald-700"
                >
                  {guideText("done")}
                </button>
                <button
                  type="button"
                  onClick={() => chooseFormGuideOption("__skip")}
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700"
                >
                  {guideText("skip")}
                </button>
              </div>
            </>
          ) : question.options.length ? (
            <div className="flex flex-wrap gap-1.5">
              {question.options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => chooseFormGuideOption(option.value)}
                  className={`max-w-full rounded-2xl border px-3 py-2 text-left text-xs font-black transition ${
                    option.value === "fill"
                      ? "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700"
                      : "border-slate-200 bg-white text-slate-700 hover:border-sky-300 hover:bg-sky-50"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => cancelFormGuide()}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-black text-slate-500"
          >
            <X size={11} /> {guideText("cancel")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
