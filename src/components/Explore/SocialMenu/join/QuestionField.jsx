import { HiOutlineInformationCircle } from "react-icons/hi2";

import { GLOBAL_COUNTRY_CODES } from "../../../../data/globalCountryCodes";

// Renders one question from the database-driven Join KunThai catalogue. Every
// input type the catalogue can declare is handled here; an unknown type falls
// back to a single-line text field rather than disappearing from the form.

const INPUT_CLASS =
  "h-12 w-full rounded-2xl bg-slate-100 px-4 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-sky-200";
const TEXTAREA_CLASS =
  "w-full resize-none rounded-2xl bg-slate-100 px-4 py-3 text-sm font-bold leading-6 text-slate-900 outline-none focus:ring-2 focus:ring-sky-200";
const SELECT_CLASS =
  "h-12 w-full rounded-2xl bg-slate-100 px-4 text-sm font-black text-slate-800 outline-none focus:ring-2 focus:ring-sky-200";

function toggleValue(current, value) {
  const list = Array.isArray(current) ? current : [];
  return list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];
}

export default function QuestionField({ question, value, error = "", disabled = false, onChange }) {
  const { inputType, label, helper, placeholder, maxLength, required } = question;

  if (inputType === "statement") {
    return (
      <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4">
        <div className="flex items-start gap-3">
          <HiOutlineInformationCircle className="mt-0.5 flex-none text-xl text-sky-700" />
          <div className="min-w-0">
            <p className="text-sm font-black text-sky-900">{label}</p>
            {helper ? <p className="mt-1 text-sm font-semibold leading-6 text-sky-900/80">{helper}</p> : null}
          </div>
        </div>
      </div>
    );
  }

  const describedBy = error ? `${question.questionKey}-error` : undefined;

  function control() {
    switch (inputType) {
      case "long_text":
        return (
          <textarea
            id={question.questionKey}
            rows={5}
            maxLength={maxLength || undefined}
            disabled={disabled}
            value={value ?? ""}
            placeholder={placeholder}
            aria-describedby={describedBy}
            onChange={(event) => onChange(event.target.value)}
            className={TEXTAREA_CLASS}
          />
        );

      case "select":
        return (
          <select
            id={question.questionKey}
            disabled={disabled}
            value={value ?? ""}
            aria-describedby={describedBy}
            onChange={(event) => onChange(event.target.value || null)}
            className={SELECT_CLASS}
          >
            <option value="">Choose one</option>
            {question.options.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        );

      case "country":
        return (
          <select
            id={question.questionKey}
            disabled={disabled}
            value={value ?? ""}
            aria-describedby={describedBy}
            onChange={(event) => onChange(event.target.value || null)}
            className={SELECT_CLASS}
          >
            <option value="">Choose a country</option>
            {GLOBAL_COUNTRY_CODES.map((country) => (
              <option key={country.iso2} value={country.name}>{country.name}</option>
            ))}
          </select>
        );

      case "multi_select":
        return (
          <div className="flex flex-wrap gap-2">
            {question.options.map((option) => {
              const selected = Array.isArray(value) && value.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={disabled}
                  aria-pressed={selected}
                  onClick={() => onChange(toggleValue(value, option.value))}
                  className={`rounded-full px-4 py-2 text-xs font-black transition ${
                    selected ? "bg-sky-700 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  } disabled:opacity-50`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        );

      case "boolean":
        return (
          <div className="flex gap-2">
            {[
              ["Yes", true],
              ["No", false],
            ].map(([optionLabel, optionValue]) => (
              <button
                key={optionLabel}
                type="button"
                disabled={disabled}
                aria-pressed={value === optionValue}
                onClick={() => onChange(value === optionValue ? null : optionValue)}
                className={`h-12 flex-1 rounded-2xl text-sm font-black transition ${
                  value === optionValue ? "bg-sky-700 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                } disabled:opacity-50`}
              >
                {optionLabel}
              </button>
            ))}
          </div>
        );

      case "number":
      case "currency":
        return (
          <input
            id={question.questionKey}
            type="number"
            inputMode="decimal"
            min={question.minValue ?? undefined}
            max={question.maxValue ?? undefined}
            disabled={disabled}
            value={value ?? ""}
            placeholder={placeholder}
            aria-describedby={describedBy}
            onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}
            className={INPUT_CLASS}
          />
        );

      case "date":
        return (
          <input
            id={question.questionKey}
            type="date"
            disabled={disabled}
            value={value ?? ""}
            aria-describedby={describedBy}
            onChange={(event) => onChange(event.target.value || null)}
            className={INPUT_CLASS}
          />
        );

      case "email":
      case "phone":
      case "url":
      case "short_text":
      default:
        return (
          <input
            id={question.questionKey}
            type={inputType === "email" ? "email" : inputType === "phone" ? "tel" : "text"}
            maxLength={maxLength || undefined}
            disabled={disabled}
            value={value ?? ""}
            placeholder={placeholder || (inputType === "url" ? "https://" : "")}
            aria-describedby={describedBy}
            onChange={(event) => onChange(event.target.value)}
            className={INPUT_CLASS}
          />
        );
    }
  }

  const useLabelElement = !["multi_select", "boolean"].includes(inputType);
  const Wrapper = useLabelElement ? "label" : "div";

  return (
    <Wrapper className="block" htmlFor={useLabelElement ? question.questionKey : undefined}>
      <span className="mb-2 flex items-baseline gap-1.5 text-xs font-black uppercase tracking-[0.14em] text-slate-500">
        {label}
        {required ? <span className="text-rose-500">*</span> : <span className="text-[10px] font-bold normal-case tracking-normal text-slate-400">optional</span>}
      </span>
      {helper ? <span className="mb-2 block text-xs font-semibold leading-5 text-slate-500">{helper}</span> : null}
      {control()}
      {error ? (
        <span id={`${question.questionKey}-error`} role="alert" className="mt-1.5 block text-xs font-bold text-rose-600">
          {error}
        </span>
      ) : null}
    </Wrapper>
  );
}
