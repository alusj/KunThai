import { useEffect, useState } from "react";
import { resizedImageUrl } from "../../../../../Backend/lib/imageProxy";

export default function BusinessLogo({ initials, logoUrl }) {
  // While the logo image is loading (e.g. right after switching business) show a
  // skeleton in the icon slot instead of an empty box, and fall back to the
  // initials tile if it fails to load.
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
  }, [logoUrl]);

  if (logoUrl && !failed) {
    return (
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl">
        {!loaded ? <div className="absolute inset-0 animate-pulse rounded-xl bg-gray-200" /> : null}
        <img
          src={resizedImageUrl(logoUrl, { width: 128, quality: 70 })}
          alt=""
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={`h-16 w-16 rounded-xl object-cover transition-opacity duration-200 ${loaded ? "opacity-100" : "opacity-0"}`}
        />
      </div>
    );
  }

  return (
    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-gray-900 text-base font-bold text-white">
      {initials}
    </div>
  );
}
