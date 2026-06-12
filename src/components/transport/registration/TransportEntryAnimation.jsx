import { AnimatePresence, motion } from "framer-motion";
import { Bike, Truck } from "lucide-react";

export default function TransportEntryAnimation({ show }) {
  const vehicles = [
    { id: "bike", Icon: Bike, label: "Bike" },
    { id: "keke", emoji: "🛺", label: "Tricycle" },
    { id: "truck", Icon: Truck, label: "Delivery" },
  ];

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-[9999] flex h-dvh items-center justify-center bg-slate-50 px-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, x: 80 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        >
          <motion.div
            className="flex w-full max-w-md flex-col items-center gap-6 text-center"
            initial={{ scale: 0.94, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.98, x: 120, opacity: 0 }}
            transition={{ type: "spring", stiffness: 220, damping: 24 }}
          >
            <div className="relative flex h-40 w-full items-center justify-center overflow-hidden rounded-[2rem] bg-emerald-50/70">
              <motion.div
                className="absolute left-0 top-1/2 h-1 w-full -translate-y-1/2 bg-emerald-100"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                exit={{ scaleX: 0 }}
                transition={{ duration: 0.8 }}
              />

              <div className="relative flex w-full items-center justify-around px-6">
                {vehicles.map((vehicle, index) => {
                  const Icon = vehicle.Icon;

                  return (
                    <motion.div
                      key={vehicle.id}
                      className="flex h-20 w-20 items-center justify-center rounded-full bg-white text-emerald-700 shadow-lg ring-1 ring-emerald-100"
                      initial={{ x: -90, opacity: 0, scale: 0.8 }}
                      animate={{
                        x: [0, 12, 0],
                        opacity: 1,
                        scale: 1,
                      }}
                      exit={{
                        x: 180,
                        opacity: 0,
                        scale: 0.85,
                      }}
                      transition={{
                        delay: index * 0.12,
                        duration: 0.7,
                        ease: "easeInOut",
                      }}
                    >
                      {Icon ? (
                        <Icon size={36} strokeWidth={2.5} />
                      ) : (
                        <span className="text-4xl">{vehicle.emoji}</span>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </div>

            <div>
              <motion.h2
                className="text-4xl font-black tracking-tight text-slate-950"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 80 }}
                transition={{ delay: 0.15 }}
              >
                Entering Transport
              </motion.h2>

              <motion.p
                className="mt-3 text-base font-black text-slate-500"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 80 }}
                transition={{ delay: 0.25 }}
              >
                from KunThai...
              </motion.p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
