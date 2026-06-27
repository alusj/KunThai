import {
  HiOutlineArrowPath,
  HiOutlineCircleStack,
  HiOutlineFilm,
  HiOutlineSignal,
  HiOutlineSpeakerWave,
} from "react-icons/hi2";

import { useExplorePreferences } from "../../../../Backend/hooks/useExplorePreferences";
import SocialScreenHeader from "../shared/SocialScreenHeader";

function Toggle({ active, onChange }) {
  return (
    <button type="button" role="switch" aria-checked={active} onClick={() => onChange(!active)} className={`h-11 min-w-20 rounded-2xl px-4 text-sm font-black ${active ? "bg-sky-700 text-white" : "bg-slate-100 text-slate-600"}`}>
      {active ? "On" : "Off"}
    </button>
  );
}

function DataRow({ children, description, icon: Icon, title }) {
  return (
    <div className="flex flex-col gap-4 rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-sky-50 text-sky-700"><Icon className="text-2xl" /></span>
        <div><h4 className="text-base font-black text-slate-950">{title}</h4><p className="mt-1 text-sm font-semibold leading-6 text-slate-500">{description}</p></div>
      </div>
      <div className="flex-none">{children}</div>
    </div>
  );
}

export default function DataMobileUseScreen({ hideHeader = false }) {
  const { clearCache, feedback, settings, updateSection } = useExplorePreferences();
  const { video } = settings;

  return (
    <div>
      {!hideHeader ? <SocialScreenHeader title="Data & Mobile Use" subtitle="Choose how Explore handles media, bandwidth, and temporary device data." /> : null}

      <div className="w-full space-y-6 px-4 py-4 sm:px-6 lg:px-8">
        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm lg:p-6">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-700">Mobile controls</p>
          <h3 className="mt-2 text-2xl font-black text-slate-950">Balance media and connectivity</h3>
          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-600">These controls use the same saved Explore preferences as Settings, so changes stay consistent across both screens.</p>
          {feedback ? <p className="mt-3 text-sm font-black text-sky-700">{feedback}</p> : null}
        </section>

        <section className="grid gap-3 lg:grid-cols-2">
          <DataRow icon={HiOutlineSignal} title="Use less mobile data" description="Prefer lighter media behavior when your connection is limited.">
            <Toggle active={video.reduceData} onChange={(value) => updateSection("video", { reduceData: value })} />
          </DataRow>
          <DataRow icon={HiOutlineFilm} title="Autoplay Swip" description="Start the active video automatically while browsing Swip.">
            <Toggle active={video.autoplay} onChange={(value) => updateSection("video", { autoplay: value })} />
          </DataRow>
          <DataRow icon={HiOutlineSpeakerWave} title="Start with sound" description="Choose the preferred sound state when Swip begins playback.">
            <Toggle active={!video.defaultMuted} onChange={(value) => updateSection("video", { defaultMuted: !value })} />
          </DataRow>
          <DataRow icon={HiOutlineCircleStack} title="Temporary Explore data" description="Clear drafts, recent searches, posting notices, and temporary screen state.">
            <button type="button" onClick={clearCache} className="inline-flex h-11 items-center gap-2 rounded-2xl bg-slate-100 px-4 text-sm font-black text-slate-700"><HiOutlineArrowPath /> Clear cache</button>
          </DataRow>
        </section>

        <section className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
          <h3 className="text-base font-black text-slate-950">Downloads and offline use</h3>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">Saved media and offline collections are not enabled in this first version. KunThai will show storage impact before adding them.</p>
        </section>

        {/* Future backend: add measured bandwidth modes, download preferences, cache size reporting, and offline collection sync. */}
      </div>
    </div>
  );
}
