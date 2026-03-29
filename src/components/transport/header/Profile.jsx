// profile.jsx

export default function Profile() {
  return (
    <button className="p-1 rounded-full hover:bg-gray-100">
      <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center">
        <svg
          className="w-4 h-4 text-gray-700"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="12" cy="8" r="4" />
          <path d="M6 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
        </svg>
      </div>
    </button>
  );
}
