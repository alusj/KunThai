import { Menu, Plus, ShoppingBag } from "lucide-react";

export default function BusinessSkeleton() {
  return (
    <div className="min-h-screen animate-pulse bg-gray-50">
      <div className="sticky top-0 z-30 border-b border-gray-200 bg-white">
        <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center text-gray-200">
              <ShoppingBag size={28} strokeWidth={2.6} />
            </div>
            <div className="hidden h-6 w-px bg-gray-200 sm:block" />
            <div className="h-5 w-32 rounded bg-gray-200" />
          </div>
          <div className="hidden h-10 max-w-md flex-1 rounded-lg bg-gray-100 md:block" />
          <div className="flex gap-2">
            <div className="hidden h-10 w-32 rounded-lg bg-gray-200 lg:block" />
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-200 text-white">
              <Plus size={18} />
            </div>
            <div className="h-10 w-10 rounded-lg bg-gray-200" />
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-200 text-white">
              <Menu size={18} />
            </div>
          </div>
        </div>
      </div>

      <div className="w-full px-4 py-5 sm:px-6 lg:px-8">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_432px]">
          <main className="space-y-6">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="h-16 w-16 rounded-xl bg-gray-200" />
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="h-5 w-48 rounded bg-gray-200" />
                    <div className="h-4 w-64 max-w-full rounded bg-gray-100" />
                    <div className="h-4 w-32 rounded bg-gray-100" />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="h-5 w-32 rounded bg-gray-200" />
                <div className="mt-5 h-16 w-16 rounded-full bg-gray-100" />
                <div className="mt-4 h-2 rounded-full bg-gray-100" />
              </div>
            </div>

            <div className="flex gap-3 overflow-x-auto rounded-xl border border-gray-200 bg-white p-3 shadow-sm [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {[0, 1, 2].map((item) => (
                <div
                  key={item}
                  className="h-16 min-w-[170px] flex-1 rounded-lg bg-gray-100"
                />
              ))}
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-2 shadow-sm">
              <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {[0, 1, 2, 3].map((item) => (
                  <div
                    key={item}
                    className="h-11 min-w-[132px] flex-1 rounded-lg bg-gray-100"
                  />
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="h-4 w-28 rounded bg-gray-200" />
              <div className="mt-3 h-7 w-72 max-w-full rounded bg-gray-200" />
              <div className="mt-3 h-4 w-full max-w-lg rounded bg-gray-100" />
            </div>
          </main>

          <aside className="space-y-6">
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
              >
                <div className="h-5 w-40 rounded bg-gray-200" />
                <div className="mt-4 space-y-3">
                  <div className="h-12 rounded-lg bg-gray-100" />
                  <div className="h-12 rounded-lg bg-gray-100" />
                  <div className="h-12 rounded-lg bg-gray-100" />
                </div>
              </div>
            ))}
          </aside>
        </div>
      </div>
    </div>
  );
}
