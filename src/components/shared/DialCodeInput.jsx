import { forwardRef, useLayoutEffect, useRef } from "react";

import {
  constrainCountryPhoneInput,
  getActiveCountryProfile,
  getCountryFromInternationalPhone,
  getCountryPhonePlaceholder,
  getCountryProfile,
} from "../../data/globalCountryProfiles";

// A phone number box whose country code is real text, not a placeholder.
//
// "+232" is always shown at the start of the box and cannot be typed over or
// deleted; only the number after it is typed, and the grey example
// ("00 000 000") stands for that number alone. Takes the same props as an
// <input>, so it replaces one without changing how the field looks: it reads
// the box's own font and spacing and places the code inside it.
//
// `value` and `onChange` use the full international number ("+232 76 123 456"),
// exactly as the fields stored it before.
//
// `inputComponent`: a styled input to draw instead of a plain <input> (it must
// pass its ref on). `wrapperClassName`: classes for the outer box, for a field
// that is sized by its parent (a grid cell).
//
// `dialCountry`: the country the number must belong to (a registration in
// that country). Left empty, the code is the country of the number already in
// the box (a saved "+44 …" keeps +44; a full number pasted with "+" switches
// to its country), otherwise the country the app is in.

const GAP_PX = 6;

function nationalPart(text, country) {
  const dial = country?.dialCode || "";
  return dial && text.startsWith(dial) ? text.slice(dial.length).trimStart() : text;
}

const DialCodeInput = forwardRef(function DialCodeInput(
  { dialCountry = "", value = "", onChange, wrapperClassName = "", inputComponent: InputTag = "input", placeholder: _placeholder, ...rest },
  forwardedRef,
) {
  const inputRef = useRef(null);
  const prefixRef = useRef(null);

  const text = String(value || "");
  const fixed = dialCountry ? getCountryProfile(dialCountry) : null;
  const active = getActiveCountryProfile();
  const country = fixed || getCountryFromInternationalPhone(text, active) || active;
  const dialCode = country.dialCode;

  function setRefs(node) {
    inputRef.current = node;
    if (typeof forwardedRef === "function") forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  }

  // The code is laid over the start of the box, in the box's own font, and the
  // typing area is moved to begin right after it.
  useLayoutEffect(() => {
    const input = inputRef.current;
    const prefix = prefixRef.current;
    if (!input || !prefix) return undefined;

    function place() {
      input.style.paddingLeft = "";
      const styles = window.getComputedStyle(input);
      const basePadding = parseFloat(styles.paddingLeft) || 0;
      const borderLeft = parseFloat(styles.borderLeftWidth) || 0;
      const borderTop = parseFloat(styles.borderTopWidth) || 0;
      prefix.style.fontFamily = styles.fontFamily;
      prefix.style.fontSize = styles.fontSize;
      prefix.style.fontWeight = styles.fontWeight;
      prefix.style.letterSpacing = styles.letterSpacing;
      prefix.style.color = styles.color;
      prefix.style.left = `${input.offsetLeft + borderLeft + basePadding}px`;
      prefix.style.top = `${input.offsetTop + borderTop}px`;
      prefix.style.height = `${input.clientHeight}px`;
      input.style.paddingLeft = `${basePadding + prefix.offsetWidth + GAP_PX}px`;
    }

    place();
    if (typeof ResizeObserver !== "function") return undefined;
    const observer = new ResizeObserver(place);
    observer.observe(input);
    return () => observer.disconnect();
  }, [dialCode]);

  function handleChange(event) {
    const typed = String(event.target.value || "");
    // A full number pasted with its own "+" code keeps that country, unless
    // this field belongs to one country.
    const pastedCountry = !fixed && typed.trim().startsWith("+") ? getCountryFromInternationalPhone(typed) : null;
    const next = constrainCountryPhoneInput(typed, pastedCountry || country, { international: true });
    onChange?.({ target: { value: next }, currentTarget: { value: next } });
  }

  return (
    <span dir="ltr" className={`relative block ${wrapperClassName}`}>
      <span
        ref={prefixRef}
        aria-hidden="true"
        className="pointer-events-none absolute z-[1] flex select-none items-center whitespace-nowrap"
      >
        {dialCode}
      </span>
      <InputTag
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        {...rest}
        ref={setRefs}
        value={nationalPart(text, country)}
        onChange={handleChange}
        placeholder={getCountryPhonePlaceholder(country, { includeDialCode: false })}
        aria-description={dialCode}
      />
    </span>
  );
});

export default DialCodeInput;
