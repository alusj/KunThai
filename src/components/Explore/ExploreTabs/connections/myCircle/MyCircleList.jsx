// src/explore/connections/myCircle/MyCircleList.jsx
import ConnectionCard from "../components/ConnectionCard";

export default function MyCircleList() {
  const users = [
    { id: 1, name: "Alus Jay", username: "alusjay" },
  ];

  return (
    <div className="space-y-3">
      {users.map(user => (
        <ConnectionCard key={user.id} user={user} />
      ))}
    </div>
  );
}
