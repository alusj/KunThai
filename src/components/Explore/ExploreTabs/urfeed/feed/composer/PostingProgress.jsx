import { HiOutlineCheckCircle, HiOutlineShieldCheck } from "react-icons/hi2";

import { postingStages } from "./postReviewPipeline";

export default function PostingProgress({ progress = 0, stage = "preparing" }) {
  const activeIndex = Math.max(0, postingStages.findIndex((item) => item.key === stage));

  return (
    <section className="rounded-[24px] border border-sky-100 bg-sky-50 p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-white text-xl text-sky-700">
          <HiOutlineShieldCheck />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-slate-950">{postingStages[activeIndex]?.label || "Reviewing post"}</p>
          <p className="text-xs font-bold text-sky-700">{progress}% complete</p>
        </div>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-white">
        <div className="h-full rounded-full bg-sky-600 transition-all duration-300" style={{ width: `${progress}%` }} />
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {postingStages.map((item, index) => {
          const done = index < activeIndex || stage === "complete";
          const active = item.key === stage;
          return (
            <div key={item.key} className={`flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-black ${active ? "bg-white text-sky-700" : "text-slate-500"}`}>
              {done ? <HiOutlineCheckCircle className="flex-none text-emerald-600" /> : <span className="h-2 w-2 flex-none rounded-full bg-slate-300" />}
              <span className="truncate">{item.label}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
