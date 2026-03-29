// Body.jsx
// Professional Passenger Dashboard Layout
// Radar uses floating slot system (not inside grid)

import BookRide from "./BookRide/BookRide";
import SendDelivery from "./SendDelivery/SendDelivery";
import AreaView from "./AreaView";
import TopRated from "./TopRated";
import TourHistory from "./TourHistory";
import Favorite from "./Favorite";
//import Radar from "./Radar";

export default function Body() {
  return (
    <div className="relative px-3 pt-8 pb-24">

      {/* Grid Layout */}
      <div className="grid grid-cols-2 gap-5">

        {/* Row 1 */}
        <BookRide />
        <SendDelivery />

        {/* Row 2 */}
        <AreaView />
        <TopRated />

        {/* Row 3 */}
        <TourHistory />
        <Favorite />

      </div>

      {/* Radar Floating In Slot Between Row 2 
      <div className="absolute left-1/2 top-[46%] -translate-x-1/2 z-30">
        <Radar />
      </div>*/}

    </div>
  );
}