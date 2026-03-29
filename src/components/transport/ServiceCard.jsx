// ServiceCard.jsx

export default function ServiceCard({ icon, title, color }) {
  return (
    <div
      className="
        bg-white 
        rounded-2xl 
        shadow-md
        hover:shadow-xl
        transition-all duration-300
        p-6
        flex flex-col items-center justify-center
        min-h-[130px]
        border border-gray-100
      "
    >
      <div className={`${color} mb-3`}>
        {icon}
      </div>

      <h3 className="text-gray-700 font-semibold text-center text-base">
        {title}
      </h3>
    </div>
  );
}