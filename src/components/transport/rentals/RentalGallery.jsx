import { useEffect, useRef, useState } from "react";
import CenteredModal from "../../shared/CenteredModal";

export default function RentalGallery({ photos = [], title }) {
  const [index, setIndex] = useState(null);
  const [zoom, setZoom] = useState(false);
  const start = useRef(null);
  const close = useRef(null);
  const isOpen = index !== null;
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement;
    close.current?.focus();
    const escape = (event) => { if (event.key === "Escape") setIndex(null); };
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("keydown", escape); previous?.focus(); };
  }, [isOpen]);
  const move = (step) => { setIndex((current) => (current + step + photos.length) % photos.length); setZoom(false); };
  return <>
    <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2">{photos.map((url, i) => <button type="button" key={`${url}-${i}`} onClick={() => { setIndex(i); setZoom(false); }} aria-label={`View ${title} photo ${i + 1}`} className="shrink-0 snap-start"><img src={url} alt={`${title}, photo ${i + 1}`} className="h-52 w-80 rounded-2xl object-cover" /></button>)}</div>
    <CenteredModal open={index !== null} onClose={() => setIndex(null)} maxWidth="max-w-5xl" labelledBy="rental-gallery-title">
      <div className="space-y-3 rounded-2xl bg-slate-950 p-3 text-white" onKeyDown={(event) => { if (event.key === "ArrowLeft") move(-1); if (event.key === "ArrowRight") move(1); }}>
        <div className="flex items-center justify-between"><span id="rental-gallery-title">{title} · {(index ?? 0) + 1} / {photos.length}</span><button ref={close} type="button" onClick={() => setIndex(null)} className="rounded-xl p-3 font-bold">Close</button></div>
        <div className="max-h-[70vh] overflow-auto" onTouchStart={(event) => { start.current = event.touches[0].clientX; }} onTouchEnd={(event) => { if (!zoom && start.current != null) { const delta = event.changedTouches[0].clientX - start.current; if (Math.abs(delta) > 50) move(delta > 0 ? -1 : 1); } start.current = null; }}>
          {index !== null && <img src={photos[index]} alt={`${title}, photo ${index + 1}`} className={zoom ? "w-[200%] max-w-none" : "mx-auto max-h-[65vh] w-full object-contain"} />}
        </div>
        <div className="flex justify-between gap-2">{[["Previous", () => move(-1)], [zoom ? "Zoom out" : "Zoom in", () => setZoom(!zoom)], ["Next", () => move(1)]].map(([label, action]) => <button key={label} type="button" onClick={action} className="rounded-xl bg-white/15 px-4 py-3 font-bold">{label}</button>)}</div>
      </div>
    </CenteredModal>
  </>;
}
