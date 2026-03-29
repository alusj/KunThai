import { useState } from "react";
import FeedTabs from "./FeedTabs";
import FeedComposer from "./feed/components/FeedComposer";
import FeedList from "./feed/FeedList";

/*
  UrFeed
  ------
  Container for Feed + Connections child tabs
*/

export default function UrFeed() {
  const [activeTab, setActiveTab] = useState("feed");

  return (
    <div>

      {/* CHILD TABS */}
      <FeedTabs
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      {/* COMPOSER (only for Feed) */}
      {activeTab === "feed" && <FeedComposer />}

      {/* CONTENT */}
      {activeTab === "feed" && <FeedList />}
      {activeTab === "connections" && (
        <div className="p-4 text-gray-500">
          Connections content here
        </div>
      )}

    </div>
  );
}
