import { AnimatePresence, motion } from "framer-motion";
import { PackageCheck, ShoppingBag, ShoppingCart } from "lucide-react";

export default function MallEntryAnimation({ show }) {
  const items = [
    { id: "bag", Icon: ShoppingBag },
    { id: "package", Icon: PackageCheck },
    { id: "cart", Icon: ShoppingCart },
  ];

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-white px-5 pb-28"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, x: 90 }}
          transition={{ duration: 0.35 }}
        >
          <motion.div
            className="-translate-y-20 flex w-full max-w-md flex-col items-center gap-6 text-center"
            initial={{ scale: 0.94, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.98, x: 120, opacity: 0 }}
            transition={{ type: "spring", stiffness: 220, damping: 24 }}
          >
            <div className="relative flex h-40 w-full items-center justify-center overflow-hidden rounded-[2rem] bg-emerald-50/70">
              <div className="relative flex w-full items-center justify-around px-6">
                {items.map((item, index) => {
                  const Icon = item.Icon;

                  return (
                    <motion.div
                      key={item.id}
                      className="flex h-20 w-20 items-center justify-center rounded-full bg-white text-emerald-700 shadow-lg ring-1 ring-emerald-100"
                      initial={{ x: -90, opacity: 0, scale: 0.8 }}
                      animate={{ x: [0, 12, 0], opacity: 1, scale: 1 }}
                      exit={{ x: 180, opacity: 0, scale: 0.85 }}
                      transition={{
                        delay: index * 0.12,
                        duration: 0.7,
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
              <motion.h2
                className="text-4xl font-black tracking-tight text-slate-950"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 80 }}
              >
                Entering UrMall
              </motion.h2>

              <motion.p
                className="mt-3 text-base font-black text-slate-500"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 80 }}
              >
                Preparing products, sellers and orders...
              </motion.p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}