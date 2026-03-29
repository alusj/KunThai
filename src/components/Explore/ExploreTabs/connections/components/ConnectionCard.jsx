// src/explore/connections/components/ConnectionCard.jsx
import FollowButton from "./FollowButton";
import BlockButton from "./BlockButton";

export default function ConnectionCard({ user }) {
  return (
    <div className="bg-white p-4 rounded-lg shadow flex justify-between items-center">
      <div>
        <p className="font-semibold">{user.name}</p>
        <p className="text-sm text-gray-500">@{user.username}</p>
      </div>

      <div className="flex gap-2">
        <FollowButton />
        <BlockButton />
      </div>
    </div>
  );
}
