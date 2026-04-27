import {
  HiOutlineHashtag,
  HiOutlineLockClosed,
  HiOutlineMapPin,
  HiOutlineMicrophone,
  HiOutlinePhoto,
  HiOutlinePlayCircle,
  HiOutlineUserGroup,
  HiOutlineVideoCamera,
} from "react-icons/hi2";

const tools = [
  { type: "image", label: "Image", icon: HiOutlinePhoto },
  { type: "video", label: "Video", icon: HiOutlineVideoCamera },
  { type: "voice", label: "Voice", icon: HiOutlineMicrophone },
  { type: "tag", label: "Tags", icon: HiOutlineHashtag },
  { type: "location", label: "Location", icon: HiOutlineMapPin },
];

const privacyOptions = [
  { value: "public", label: "Public", icon: HiOutlineUserGroup },
  { value: "circle", label: "Circle", icon: HiOutlineLockClosed },
];

export default function ComposerActions({ privacy, setPrivacy, isRecording, onTool }) {
  return (
    <>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {tools.map((tool) => {
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
          Videos go to Swip
        </div>
      </div>
    </>
  );
}
