import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from "lucide-react";
import useBodyScrollLock from "../../shared/useBodyScrollLock";
import { clampPhotoPan, photoPanBounds, photoSwipeAction } from "./rentalPhotoGestures";

export default function RentalGallery({ photos = [], title }) {
  const [index, setIndex] = useState(null);
  return <>
    <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{photos.map((url, i) => <button type="button" key={`${url}-${i}`} onClick={() => setIndex(i)} aria-label={`View ${title} photo ${i + 1}`} className="shrink-0 snap-start"><img src={url} alt={`${title}, photo ${i + 1}`} className="h-52 w-80 max-w-[80vw] rounded-2xl object-cover" /></button>)}</div>
    {index !== null && photos[index] && createPortal(<RentalPhotoViewer photos={photos} title={title} initialIndex={index} onClose={() => setIndex(null)} />, document.body)}
  </>;
}

function RentalPhotoViewer({ photos, title, initialIndex, onClose }) {
  const [index, setIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const canvas = useRef(null);
  const picture = useRef(null);
  const dialog = useRef(null);
  const close = useRef(null);
  const gesture = useRef(null);
  const lastTap = useRef(null);
  useBodyScrollLock(true);
  const reset = () => { setScale(1); setPan({ x: 0, y: 0 }); setDrag({ x: 0, y: 0 }); gesture.current = null; lastTap.current = null; };
  const move = (step) => { setIndex((value) => (value + step + photos.length) % photos.length); reset(); };
  function bounds(zoom = scale) {
    const rect = canvas.current?.getBoundingClientRect();
    return photoPanBounds({ width: rect?.width || 0, height: rect?.height || 0 }, { width: picture.current?.naturalWidth || 0, height: picture.current?.naturalHeight || 0 }, zoom);
  }
  function zoomAt(x, y) {
    if (scale > 1) { reset(); return; }
    const rect = canvas.current.getBoundingClientRect();
    const next = 2.5;
    setScale(next);
    setPan(clampPhotoPan({ x: -(x - rect.left - rect.width / 2) * (next - 1), y: -(y - rect.top - rect.height / 2) * (next - 1) }, bounds(next)));
    setDrag({ x: 0, y: 0 });
  }
  useEffect(() => {
    const previous = document.activeElement;
    close.current?.focus();
    return () => previous?.focus();
  }, []);
  useEffect(() => {
    const resize = () => { setScale(1); setPan({ x: 0, y: 0 }); setDrag({ x: 0, y: 0 }); gesture.current = null; };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  function pointerDown(event) {
    if (!event.isPrimary || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, pan, time: Date.now() };
  }
  function pointerMove(event) {
    const current = gesture.current;
    if (!current || current.id !== event.pointerId) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    if (scale > 1) setPan(clampPhotoPan({ x: current.pan.x + dx, y: current.pan.y + dy }, bounds()));
    else setDrag(Math.abs(dx) > Math.abs(dy) ? { x: dx, y: 0 } : { x: 0, y: Math.max(0, dy) });
  }
  function pointerUp(event) {
    const current = gesture.current;
    if (!current || current.id !== event.pointerId) return;
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    setDrag({ x: 0, y: 0 });
    if (Math.hypot(dx, dy) < 12 && Date.now() - current.time < 350) {
      const previous = lastTap.current;
      if (previous && Date.now() - previous.time < 320 && Math.hypot(event.clientX - previous.x, event.clientY - previous.y) < 36) { lastTap.current = null; zoomAt(event.clientX, event.clientY); }
      else lastTap.current = { x: event.clientX, y: event.clientY, time: Date.now() };
      return;
    }
    lastTap.current = null;
    // Zoomed dragging pans the photo; zoom out before swiping photos or closing.
    if (scale > 1) return;
    const action = photoSwipeAction(dx, dy);
    if (action === "close") onClose();
    else if (action === "next") move(1);
    else if (action === "previous") move(-1);
  }
  function keyDown(event) {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
    if (event.key === "ArrowLeft") { event.preventDefault(); move(-1); }
    if (event.key === "ArrowRight") { event.preventDefault(); move(1); }
    if (event.key === "Tab") {
      const buttons = [...dialog.current.querySelectorAll("button:not(:disabled)")];
      const first = buttons[0]; const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }
  return <div ref={dialog} role="dialog" aria-modal="true" aria-label={`${title} photos`} onKeyDown={keyDown} className="fixed inset-0 z-[2147483100] flex h-[100dvh] w-full flex-col overflow-hidden bg-black text-white" style={{ overscrollBehavior: "none" }}>
    <header className="z-10 flex shrink-0 items-center gap-3 bg-black px-3 pb-3 pt-[max(12px,env(safe-area-inset-top))]">
      <button ref={close} type="button" aria-label="Close photo preview" onClick={onClose} className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white/15 text-white"><X size={25} /></button>
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{title}</p><p aria-live="polite" className="text-xs text-white/70">{index + 1} / {photos.length}</p></div>
      <button type="button" aria-label={scale > 1 ? "Zoom out" : "Zoom in"} onClick={() => { const rect = canvas.current.getBoundingClientRect(); zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2); }} className="grid h-12 w-12 place-items-center rounded-full bg-white/15 text-white">{scale > 1 ? <ZoomOut size={22} /> : <ZoomIn size={22} />}</button>
    </header>
    <div ref={canvas} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => { gesture.current = null; lastTap.current = null; setDrag({ x: 0, y: 0 }); }} className={`relative min-h-0 flex-1 touch-none select-none overflow-hidden ${scale > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"}`}>
      <img ref={picture} src={photos[index]} alt={`${title}, photo ${index + 1}`} draggable={false} className="pointer-events-none h-full w-full select-none object-contain" style={{ transform: `translate3d(${pan.x + drag.x}px, ${pan.y + drag.y}px, 0) scale(${scale})`, transformOrigin: "center", willChange: "transform" }} />
    </div>
    <footer className="flex shrink-0 items-center justify-between gap-3 bg-black px-3 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
      <button type="button" disabled={photos.length < 2} aria-label="Previous photo" onClick={() => move(-1)} className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white/15 text-white disabled:opacity-30"><ChevronLeft /></button>
      <p className="text-center text-xs leading-5 text-white/70">{scale > 1 ? "Drag to move · Double-tap to zoom out" : "Double-tap to zoom · Swipe left or right · Swipe down to close"}</p>
      <button type="button" disabled={photos.length < 2} aria-label="Next photo" onClick={() => move(1)} className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white/15 text-white disabled:opacity-30"><ChevronRight /></button>
    </footer>
  </div>;
}
