import { useState } from "react";

export default function Avatar({ name = "KunThai", src = "", size = "md" }) {
  const [failed, setFailed] = useState(false);
  const sizes = {
    xs: "h-6 w-6 text-[11px]",
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
        className={`flex-none rounded-full object-cover ring-2 ring-white ${sizes[size] ?? sizes.md}`}
      />
    );
  }

  return (
    <div
      className={`flex flex-none items-center justify-center rounded-full bg-sky-100 font-black text-sky-700 ring-2 ring-white ${sizes[size] ?? sizes.md}`}
    >
      {(name || "K").slice(0, 1).toUpperCase()}
    </div>
  );
}
