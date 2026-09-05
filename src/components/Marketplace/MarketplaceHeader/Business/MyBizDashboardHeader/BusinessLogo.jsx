import { useEffect, useState } from "react";
import { resizedImageUrl } from "../../../../../Backend/lib/imageProxy";

export default function BusinessLogo({ initials, logoUrl }) {
  // Keep the real initials tile visible while the optional logo decodes. The
  // business identity is stable chrome and should never look like inventory
  // that is still loading.
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
  }, [logoUrl]);

  if (logoUrl && !failed) {
    return (
      <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gray-900 text-base font-bold text-white">
        <span aria-hidden="true">{initials}</span>
        <img
          src={resizedImageUrl(logoUrl, { width: 128, quality: 70 })}
          alt=""
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={`absolute inset-0 h-16 w-16 rounded-xl object-cover transition-opacity duration-200 ${loaded ? "opacity-100" : "opacity-0"}`}
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
