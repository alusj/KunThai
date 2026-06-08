import { motion, AnimatePresence } from "framer-motion";
import { Truck } from "lucide-react";

export default function TransportEntryAnimation({ show }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-white"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="flex flex-col items-center gap-5"
            initial={{ scale: 0.92, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: -20 }}
            transition={{ type: "spring", stiffness: 220, damping: 22 }}
          >
            <motion.div
              className="h-24 w-24 rounded-full bg-emerald-100 flex items-center justify-center shadow-lg"
              animate={{
                scale: [1, 1.08, 1],
                boxShadow: [
                  "0 0 0px rgba(16,185,129,0.3)",
                  "0 0 35px rgba(16,185,129,0.55)",
                  "0 0 0px rgba(16,185,129,0.3)",
                ],
              }}
              transition={{ duration: 1.2, repeat: Infinity }}
            >
              <motion.div
                animate={{ x: [0, 10, 0] }}
                transition={{ duration: 0.9, repeat: Infinity }}
              >
                <Truck size={44} className="text-emerald-600" />
              </motion.div>
            </motion.div>

            <div className="text-center">
              <h2 className="text-2xl font-black text-slate-950">
                Entering Transport
              </h2>
              <p className="mt-2 text-sm font-bold text-slate-500">
                Preparing rides, deliveries and fleets...
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}