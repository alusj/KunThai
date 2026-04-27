import { HiOutlineSparkles, HiOutlineUserGroup, HiOutlineUsers } from "react-icons/hi2";

export default function ConnectionsSummary({ counts }) {
  const items = [
    { label: "Following", value: counts.following, icon: HiOutlineUserGroup },
    { label: "Followers", value: counts.followers, icon: HiOutlineUsers },
    { label: "Suggested", value: counts.discover, icon: HiOutlineSparkles },
  ];

  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div key={item.label} className="rounded-[20px] border border-slate-200 bg-white p-3 shadow-sm">
            <Icon className="text-lg text-sky-700" />
            <p className="mt-2 text-lg font-black text-slate-950">{item.value}</p>
            <p className="text-xs font-bold text-slate-500">{item.label}</p>
          </div>
        );
      })}
    </div>
  );
}
