// src/explore/connections/myCircle/MyCircle.jsx
import MyCircleList from "./MyCircleList";
import MyCircleEmpty from "./MyCircleEmpty";

export default function MyCircle() {
  const hasConnections = false; // backend later

  return (
    <div className="p-4">
      {hasConnections ? <MyCircleList /> : <MyCircleEmpty />}
    </div>
  );
}
