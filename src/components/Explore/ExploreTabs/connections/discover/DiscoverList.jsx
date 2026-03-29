// src/explore/connections/discover/DiscoverList.jsx
import ConnectionCard from "../components/ConnectionCard";

export default function DiscoverList() {
  const users = [
    { id: 2, name: "UrSalone Team", username: "ursalone" },
  ];

  return (
    <div className="space-y-3">
      {users.map(user => (
        <ConnectionCard key={user.id} user={user} />
      ))}
    </div>
  );
}
