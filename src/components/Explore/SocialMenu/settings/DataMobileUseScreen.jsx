import { useState } from "react";
import {
  HiOutlineArrowPath,
  HiOutlineCircleStack,
  HiOutlineCloudArrowUp,
  HiOutlineFilm,
  HiOutlineSignal,
  HiOutlineSpeakerWave,
} from "react-icons/hi2";

import { useExplorePreferences } from "../../../../Backend/hooks/useExplorePreferences";
import { isPostOutboxEnabled, setPostOutboxEnabled } from "../../../../Backend/services/explore/postOutboxConfig";
import SocialScreenHeader from "../shared/SocialScreenHeader";
import { t as i18nText } from "../../../../i18n/index";

function Toggle({ active, onChange }) {
  return (
    <button type="button" role="switch" aria-checked={active} onClick={() => onChange(!active)} className={`h-11 min-w-20 rounded-2xl px-4 text-sm font-black ${active ? "bg-sky-700 text-white" : "bg-slate-100 text-slate-600"}`}>
      {active ? i18nText("ui.literals.ke0049a66519c") : i18nText("ui.literals.ke3de5ab0ca4c")}
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
  const [backgroundPosting, setBackgroundPosting] = useState(isPostOutboxEnabled());

  return (
    <div>
      {!hideHeader ? <SocialScreenHeader title={i18nText("ui.literals.k4851f7738edc")} subtitle={i18nText("ui.literals.k66bb44ac7ea3")} /> : null}

      <div className="w-full space-y-6 px-4 py-4 sm:px-6 lg:px-8">
        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm lg:p-6">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-700">{i18nText("ui.literals.kc36c996818eb")}</p>
          <h3 className="mt-2 text-2xl font-black text-slate-950">{i18nText("ui.literals.kb5254c8bd4f4")}</h3>
          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-600">{i18nText("ui.literals.k9caa5321a133")}</p>
          {feedback ? <p className="mt-3 text-sm font-black text-sky-700">{feedback}</p> : null}
        </section>

        <section className="grid gap-3 lg:grid-cols-2">
          <DataRow icon={HiOutlineSignal} title={i18nText("ui.literals.kb96aa8e9a92a")} description={i18nText("ui.literals.kafe9f3a8d62b")}>
            <Toggle active={video.reduceData} onChange={(value) => updateSection("video", { reduceData: value })} />
          </DataRow>
          <DataRow icon={HiOutlineFilm} title={i18nText("ui.literals.kf984bd77586e")} description={i18nText("ui.literals.k44d3fd0a86a0")}>
            <Toggle active={video.autoplay} onChange={(value) => updateSection("video", { autoplay: value })} />
          </DataRow>
          <DataRow icon={HiOutlineSpeakerWave} title={i18nText("ui.literals.k852ed2593e28")} description={i18nText("ui.literals.kd5fe1510e61f")}>
            <Toggle active={!video.defaultMuted} onChange={(value) => updateSection("video", { defaultMuted: !value })} />
          </DataRow>
          <DataRow icon={HiOutlineCloudArrowUp} title="Keep posts publishing in the background" description="If your connection drops while posting, KunThai keeps the post and finishes it automatically once you're back online.">
            <Toggle
              active={backgroundPosting}
              onChange={(value) => {
                setPostOutboxEnabled(value);
                setBackgroundPosting(value);
              }}
            />
          </DataRow>
          <DataRow icon={HiOutlineCircleStack} title={i18nText("ui.literals.kb0fea8410b50")} description={i18nText("ui.literals.kec86adf3452a")}>
            <button type="button" onClick={clearCache} className="inline-flex h-11 items-center gap-2 rounded-2xl bg-slate-100 px-4 text-sm font-black text-slate-700"><HiOutlineArrowPath /> {i18nText("ui.literals.k22bc1a4e0718")}</button>
          </DataRow>
        </section>

        <section className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
          <h3 className="text-base font-black text-slate-950">{i18nText("ui.literals.kdce9176e5708")}</h3>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">{i18nText("ui.literals.k03dcbd106ab0")}</p>
        </section>

        {/* Future backend: add measured bandwidth modes, download preferences, cache size reporting, and offline collection sync. */}
      </div>
    </div>
  );
}
