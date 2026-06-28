import {
  HiOutlineAtSymbol,
  HiOutlineGlobeAlt,
  HiOutlineHashtag,
  HiOutlineLockClosed,
  HiOutlineMapPin,
  HiOutlineMicrophone,
  HiOutlineMegaphone,
  HiOutlinePhoto,
  HiOutlinePlayCircle,
  HiOutlineUserGroup,
  HiOutlineVideoCamera,
} from "react-icons/hi2";

const tools = [
  { type: "image", label: "Image", icon: HiOutlinePhoto },
  { type: "video", label: "Video", icon: HiOutlineVideoCamera },
  { type: "voice", label: "Voice", icon: HiOutlineMicrophone },
  { type: "mention", label: "Mention", icon: HiOutlineAtSymbol },
  { type: "tag", label: "Tags", icon: HiOutlineHashtag },
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
  if (advertMode) {
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-10 w-10 flex-none place-items-center rounded-2xl bg-amber-50 text-amber-700">
            <HiOutlineMegaphone className="text-lg" />
          </span>
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

  const visibleTools = advertMode
    ? tools.filter((tool) => ["image", "video"].includes(tool.type))
    : hasVideoAttachment
      ? tools.filter((tool) => tool.type !== "voice")
      : tools;

  return (
    <>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {visibleTools.map((tool) => {
          const Icon = tool.icon;
          const active = tool.type === "voice" && isRecording;
          return (
            <button
              key={tool.type}
              type="button"
              onClick={() => onTool?.(tool.type)}
              className={`flex h-12 flex-none items-center gap-2 rounded-2xl border px-4 text-sm font-semibold transition ${
                active
                  ? "border-rose-200 bg-rose-50 text-rose-600"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <Icon className="text-lg" />
              {tool.label}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
        <div className="flex min-w-0 gap-2 overflow-x-auto">
          {privacyOptions.map((option) => {
            const Icon = option.icon;
            const active = privacy === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setPrivacy(option.value)}
                className={`inline-flex h-10 flex-none items-center gap-2 rounded-2xl px-3 text-sm font-semibold transition ${
                  active ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                <Icon className="text-base" />
                {option.label}
              </button>
            );
          })}
        </div>

        <div className="hidden items-center gap-2 text-xs font-semibold text-slate-400 sm:flex">
          <HiOutlinePlayCircle />
          {advertMode ? "Adverts stay in UrFeed" : "Videos go to Swip"}
        </div>
      </div>
    </>
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
