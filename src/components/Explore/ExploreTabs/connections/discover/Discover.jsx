// src/explore/connections/discover/Discover.jsx
import DiscoverList from "./DiscoverList";
import DiscoverEmpty from "./DiscoverEmpty";

export default function Discover() {
  const hasUsers = true;

  return (
    <div className="p-4">
      {hasUsers ? <DiscoverList /> : <DiscoverEmpty />}
    </div>
  );
}
