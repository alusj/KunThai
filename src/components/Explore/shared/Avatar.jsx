import { useState } from "react";

export default function Avatar({ name = "KunThai", src = "", size = "md" }) {
  const [failed, setFailed] = useState(false);
  const sizes = {
    sm: "h-9 w-9 text-sm",
    md: "h-11 w-11 text-base",
    lg: "h-14 w-14 text-lg",
  };

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={name}
        onError={() => setFailed(true)}
        className={`rounded-full object-cover ${sizes[size] ?? sizes.md}`}
      />
    );
  }

  return (
    <div
      className={`flex items-center justify-center rounded-full bg-sky-100 font-semibold text-sky-700 ${sizes[size] ?? sizes.md}`}
    >
      {(name || "K").slice(0, 1).toUpperCase()}
    </div>
  );
}
