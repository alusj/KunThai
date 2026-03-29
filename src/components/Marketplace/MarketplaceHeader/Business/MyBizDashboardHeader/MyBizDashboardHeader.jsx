// src/components/Marketplace/Business/MyBizDashboardHeader/MyBizDashboardHeader.jsx

import Logo from "./Logo";
import BusinessName from "./BusinessName";
import Rating from "./Rating";
import EditBusinessButton from "./EditBusinessButton";

export default function MyBizDashboardHeader() {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm">
      <div className="flex items-center gap-4">

        {/* Business Logo */}
        <Logo />

        {/* Business Info */}
        <div className="flex-1">
          <BusinessName />
          <Rating />
          <EditBusinessButton />
          
        </div>

      </div>
    </div>
  );
}
