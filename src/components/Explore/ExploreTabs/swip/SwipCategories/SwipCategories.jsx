/*
  SwipCategories
  --------------
  Horizontally scrollable child tabs.
*/

const CATEGORIES = [
  "All",
  "Entertainment",
  "Connections",
  "Religious",
  "Health",
  "Education",
  ];

export default function SwipCategories({ active, setActive }) {
  return (
    <div className="bg-white border-b">
      <div className="flex gap-4 px-4 py-3 overflow-x-auto no-scrollbar">
        {CATEGORIES.map(item => {
          const isActive = active === item.toLowerCase();

          return (
            <button
              key={item}
              onClick={() => setActive(item.toLowerCase())}
              className={`
                whitespace-nowrap text-sm font-medium transition
                ${
                  isActive
                    ? "text-blue-600 border-b-2 border-blue-600 pb-1"
                    : "text-slate-600 hover:text-slate-800"
                }
              `}
            >
              {item}
            </button>
          );
        })}
      </div>
    </div>
  );
}
