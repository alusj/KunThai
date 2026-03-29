// TransportHome.jsx
// Main wrapper for the Transport module
// Responsible for layout structure only (Header + Body)

import Header from "./header/Header";
import Body from "./body/Body"; // You’ll connect later

export default function Transport() {
  return (
    <div className="min-h-screen bg-gray-50 relative">
      {/* Transport Header */}
      <Header />

      {/* Transport Body */}
       <Body />
    </div>
  );
}