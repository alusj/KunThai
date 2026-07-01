import { useEffect, useRef, useState } from "react";
import {
  HiOutlineChevronDown,
  HiOutlineGlobeAlt,
  HiOutlineLockClosed,
  HiOutlineMapPin,
  HiOutlineMicrophone,
  HiOutlineMegaphone,
  HiOutlinePhoto,
  HiOutlinePlus,
  HiOutlineUserGroup,
  HiOutlineVideoCamera,
} from "react-icons/hi2";

const tools = [
  { type: "image", label: "Image", icon: HiOutlinePhoto },
  { type: "video", label: "Video", icon: HiOutlineVideoCamera },
  { type: "voice", label: "Voice", icon: HiOutlineMicrophone },
  { type: "location", label: "Location", icon: HiOutlineMapPin },
];

const privacyOptions = [
  { value: "public", label: "Public", icon: HiOutlineUserGroup },
  { value: "circle", label: "Circle", icon: HiOutlineLockClosed },
];

export default function ComposerActions({
  privacy,
  setPrivacy,
  isRecording,
  hasVideoAttachment = false,
  advertMode = false,
  advertConfigured = false,
  advertPlacement = "urfeed",
  advertAudience = "recommended",
  onTool,
}) {
  const [toolMenuOpen, setToolMenuOpen] = useState(false);
  const [privacyMenuOpen, setPrivacyMenuOpen] = useState(false);
  const controlsRef = useRef(null);

  useEffect(() => {
    if (!toolMenuOpen && !privacyMenuOpen) return undefined;
    function closeMenus(event) {
      if (!controlsRef.current?.contains(event.target)) {
        setToolMenuOpen(false);
        setPrivacyMenuOpen(false);
      }
    }
    function closeOnEscape(event) {
      if (event.key === "Escape") {
        setToolMenuOpen(false);
        setPrivacyMenuOpen(false);
      }
    }
    document.addEventListener("pointerdown", closeMenus);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeMenus);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [privacyMenuOpen, toolMenuOpen]);

  if (advertMode) {
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-10 w-10 flex-none place-items-center rounded-2xl bg-amber-50 text-amber-700"><HiOutlineMegaphone className="text-lg" /></span>
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 text-sm font-black text-slate-900"><HiOutlineGlobeAlt className="text-base text-sky-700" /> Sponsored · Public</span>
            <span className="block truncate text-xs font-bold text-slate-500">
              {advertConfigured ? `${formatPlacement(advertPlacement)} · ${formatAudience(advertAudience)}` : "Complete campaign setup to continue"}
            </span>
          </span>
        </div>
        <span className="rounded-full bg-sky-50 px-3 py-2 text-[11px] font-black text-sky-700">Explore only</span>
      </div>
    );
  }

  const visibleTools = hasVideoAttachment ? tools.filter((tool) => tool.type !== "voice") : tools;
  const selectedPrivacy = privacyOptions.find((option) => option.value === privacy) || privacyOptions[0];
  const PrivacyIcon = selectedPrivacy.icon;

  return (
    <div ref={controlsRef} className="relative flex items-center justify-between gap-3">
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setToolMenuOpen((current) => !current);
            setPrivacyMenuOpen(false);
          }}
          aria-expanded={toolMenuOpen}
          aria-haspopup="menu"
          className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <HiOutlinePlus className="text-lg" /> Add to post <HiOutlineChevronDown className={`transition ${toolMenuOpen ? "rotate-180" : ""}`} />
        </button>
        {toolMenuOpen ? (
          <div role="menu" className="absolute bottom-[calc(100%+0.6rem)] left-0 z-30 grid w-64 grid-cols-2 gap-2 rounded-[22px] border border-slate-200 bg-white p-2 shadow-2xl shadow-slate-950/15">
            {visibleTools.map((tool) => {
              const Icon = tool.icon;
              const active = tool.type === "voice" && isRecording;
              return (
                <button
                  key={tool.type}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setToolMenuOpen(false);
                    onTool?.(tool.type);
                  }}
                  className={`flex items-center gap-2 rounded-2xl px-3 py-3 text-left text-sm font-bold ${active ? "bg-rose-50 text-rose-700" : "text-slate-700 hover:bg-slate-50"}`}
                >
                  <Icon className="text-lg" /> {tool.label}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setPrivacyMenuOpen((current) => !current);
            setToolMenuOpen(false);
          }}
          aria-expanded={privacyMenuOpen}
          aria-haspopup="menu"
          className="inline-flex h-11 items-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white"
        >
          <PrivacyIcon className="text-base" /> {selectedPrivacy.label} <HiOutlineChevronDown className={`transition ${privacyMenuOpen ? "rotate-180" : ""}`} />
        </button>
        {privacyMenuOpen ? (
          <div role="menu" className="absolute bottom-[calc(100%+0.6rem)] right-0 z-30 w-48 rounded-[20px] border border-slate-200 bg-white p-2 shadow-2xl shadow-slate-950/15">
            {privacyOptions.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={privacy === option.value}
                  onClick={() => {
                    setPrivacy(option.value);
                    setPrivacyMenuOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 rounded-2xl px-3 py-3 text-sm font-black ${privacy === option.value ? "bg-slate-950 text-white" : "text-slate-700 hover:bg-slate-50"}`}
                >
                  <Icon className="text-base" /> {option.label}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function formatPlacement(value) {
  if (value === "swip") return "Swip";
  if (value === "both") return "UrFeed & Swip";
  return "UrFeed";
}

function formatAudience(value) {
  const labels = {
    recommended: "Recommended Reach",
    everyone: "Everyone",
    followers: "Followers Only",
    followers_similar: "Followers + Similar",
    nearby: "Nearby Reach",
  };
  return labels[value] || "Recommended Reach";
}
