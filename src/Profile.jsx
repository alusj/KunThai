// src/Profile.jsx
export default function Profile() {
  return (
    <div className="max-w-2xl mx-auto">

      {/* Profile header */}
      <div className="flex flex-col items-center py-6">
        <div className="w-24 h-24 rounded-full bg-slate-300 mb-3" />
        <h2 className="text-lg font-bold">Your Name</h2>
        <p className="text-sm text-gray-500">user@email.com</p>
      </div>

      {/* Stats */}
      <div className="flex justify-around border-y py-4 text-center">
        <div>
          <p className="font-bold">0</p>
          <p className="text-sm text-gray-500">Posts</p>
        </div>
        <div>
          <p className="font-bold">0</p>
          <p className="text-sm text-gray-500">Connections</p>
        </div>
        <div>
          <p className="font-bold">0</p>
          <p className="text-sm text-gray-500">Videos</p>
        </div>
      </div>

      {/* Actions */}
      <div className="p-4 space-y-3">
        <button className="w-full py-2 rounded bg-blue-600 text-white">
          Edit Profile
        </button>

        <button className="w-full py-2 rounded bg-slate-200">
          Settings
        </button>
      </div>

    </div>
  );
}
