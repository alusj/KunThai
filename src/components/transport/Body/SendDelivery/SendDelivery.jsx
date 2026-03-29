// SendDelivery.jsx

import Bike from "./Bike";
import Keke from "./Keke";
import Van from "./Van";
//import PublicTransport from "./PublicTransport";

export default function SendDelivery() {
  return (
    <div className="bg-white rounded-2xl shadow-md p-1">
      <h3 className="text-lg font-semibold text-gray-800 mb-2">
        Send Delivery
      </h3>

      <div className="grid grid-cols-3 gap-3">
        <Bike />
        <Keke />
        <Van />
       {/* <PublicTransport />*/}
      </div>
    </div>
  );
}