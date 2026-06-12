import { AnimatePresence, motion } from "framer-motion";
import { BadgeCheck, PackageCheck, Store } from "lucide-react";

export default function BusinessSellerEntryAnimation({ show }) {
  const items = [
    { id: "store", Icon: Store },
    { id: "package", Icon: PackageCheck },
    { id: "trust", Icon: BadgeCheck },
  ];

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-[9999] flex h-dvh items-center justify-center bg-slate-50 px-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, x: 90 }}
          transition={{ duration: 0.45 }}
        >
          <motion.div
            className="flex w-full max-w-md flex-col items-center gap-6 text-center"
            initial={{ scale: 0.94, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.98, x: 120, opacity: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 24 }}
          >
            <div className="relative flex h-40 w-full items-center justify-center overflow-hidden rounded-[2rem] bg-blue-50/70">
              <div className="absolute left-10 right-10 top-1/2 h-1 -translate-y-1/2 rounded-full bg-blue-100" />

              <div className="relative flex w-full items-center justify-around px-6">
                {items.map((item, index) => {
                  const Icon = item.Icon;

                  return (
                    <motion.div
                      key={item.id}
                      className="flex h-20 w-20 items-center justify-center rounded-full bg-white text-blue-700 shadow-lg ring-1 ring-blue-100"
                      initial={{ x: -90, opacity: 0, scale: 0.82 }}
                      animate={{
                        x: [0, 12, 0],
                        opacity: 1,
                        scale: 1,
                      }}
                      exit={{
                        x: 180,
                        opacity: 0,
                        scale: 0.86,
                      }}
                      transition={{
                        delay: index * 0.18,
                        duration: 0.9,
                        ease: "easeInOut",
                      }}
                    >
                      <Icon size={36} strokeWidth={2.5} />
                    </motion.div>
                  );
                })}
              </div>
            </div>

            <div>
              <motion.p
                className="text-xs font-black uppercase tracking-[0.28em] text-blue-700"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 80 }}
              >
                KunThai UrMall
              </motion.p>

              <motion.h2
                className="mt-2 text-4xl font-black tracking-tight text-slate-950"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 80 }}
              >
                Entering MyBiz
              </motion.h2>

              <motion.p
                className="mt-3 text-base font-black text-slate-500"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 80 }}
              >
                Preparing store, products and trust tools...
              </motion.p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
