import { useRef, useState } from "react";
import { Camera } from "lucide-react";

import { resizedImageUrl } from "../../../Backend/lib/imageProxy";
import { t, useI18n } from "../../../i18n";
import { compressAddressPhoto } from "../savedAddresses/addressPhoto";

// Optional front picture (gate, entrance, house front) on the UrMall order
// form and the UrRide booking forms, the same field saved places have.
// Picking a saved place with a picture fills it; the person can change or
// remove it. `value` is a small JPEG data URL (see addressPhoto.js).
export default function FrontPictureField({ value = "", onChange, disabled = false, className = "" }) {
  useI18n();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      onChange?.(await compressAddressPhoto(file));
    } catch {
      setError(t("addressBook.pictureFailed"));
    } finally {
      setBusy(false);
    }
  }

  const pick = () => inputRef.current?.click();

  return (
    <div className={`space-y-2 ${className}`}>
      <span className="block text-xs font-black uppercase text-gray-500">
        {t("addressBook.picture")} <span className="normal-case text-gray-400">· {t("addressBook.optional")}</span>
      </span>
      <div className="grid grid-cols-[88px_1fr] gap-3">
        <button
          type="button"
          onClick={pick}
          disabled={disabled || busy}
          className="kt-touchable flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-dashed border-gray-300 bg-gray-50 disabled:opacity-60"
          aria-label={value ? t("addressBook.pictureChange") : t("addressBook.pictureAdd")}
        >
          {value ? (
            <img src={resizedImageUrl(value, { width: 240, quality: 70 })} alt="" className="h-full w-full object-cover" />
          ) : (
            <Camera className="text-gray-400" size={26} aria-hidden="true" />
          )}
        </button>
        <div className="flex min-w-0 flex-col justify-center gap-2">
          <p className="text-xs font-semibold leading-5 text-gray-500">
            {busy ? t("addressBook.pictureProcessing") : error || t("addressBook.pictureHint")}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={pick}
              disabled={disabled || busy}
              className="kt-touchable h-9 rounded-lg bg-gray-950 px-3 text-xs font-black text-white disabled:opacity-50"
            >
              {value ? t("addressBook.pictureChange") : t("addressBook.pictureAdd")}
            </button>
            {value ? (
              <button
                type="button"
                onClick={() => onChange?.("")}
                disabled={disabled || busy}
                className="kt-touchable h-9 rounded-lg border border-gray-200 px-3 text-xs font-black text-gray-600 disabled:opacity-50"
              >
                {t("addressBook.pictureRemove")}
              </button>
            ) : null}
          </div>
        </div>
      </div>
      <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
    </div>
  );
}
