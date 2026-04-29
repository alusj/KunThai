import { HiOutlineSparkles } from "react-icons/hi2";

export default function EmptyState({ title = "Nothing here yet", message = "Check back later.", icon: Icon = HiOutlineSparkles }) {
  return (
    <div className="rounded-[24px] border border-dashed border-slate-300 bg-white p-6 text-center shadow-sm">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-2xl text-sky-700">
        <Icon />
      </div>
      <h3 className="mt-4 text-base font-black text-slate-950">{title}</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-600">{message}</p>
    </div>
  );
}
