import { Layers3, Plus, Save, X } from "lucide-react";
import { useEffect, useState } from "react";

import {
  BUSINESS_CATEGORIES,
  readRegisteredBusiness,
  updateRegisteredBusinessProfile,
} from "../../../../../../../../../Backend/services/marketplace/sellerRegistrationService";
import SellerMenuPageHeader from "../../SellerMenuPageHeader";

const inputClass =
  "w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-950 outline-none transition focus:border-gray-950 focus:ring-4 focus:ring-gray-950/10";

export default function Categories({ onBack }) {
  const [categories, setCategories] = useState([]);
  const [customCategory, setCustomCategory] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    readRegisteredBusiness()
      .then((business) => {
        if (mounted) setCategories(business?.identity?.categories || []);
      })
      .catch((nextError) => {
        if (mounted) setError(nextError.message || "Unable to load categories.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  function toggleCategory(category) {
    setStatus("");
    setError("");
    setCategories((current) => {
      const exists = current.includes(category);
      if (!exists && current.length >= 5) {
        setError("Choose up to 5 categories.");
        return current;
      }
      return exists ? current.filter((item) => item !== category) : [...current, category];
    });
  }

  function removeCategory(category) {
    setStatus("");
    setError("");
    setCategories((current) => current.filter((item) => item !== category));
  }

  function addCustomCategory() {
    const nextCategory = customCategory.trim();
    if (!nextCategory) return;
    if (categories.includes(nextCategory)) {
      setError("This category is already selected.");
      return;
    }
    if (categories.length >= 5) {
      setError("Remove one category before adding another.");
      return;
    }

    setCategories((current) => [...current, nextCategory]);
    setCustomCategory("");
    setError("");
    setStatus("");
  }

  async function saveCategories(event) {
    event.preventDefault();

    if (!categories.length) {
      setError("Choose at least one product category.");
      return;
    }

    setSaving(true);
    setError("");
    setStatus("");
    try {
      await updateRegisteredBusinessProfile({
        identity: { categories },
      });
      setStatus("Product categories updated successfully.");
    } catch (nextError) {
      setError(nextError.message || "Unable to update categories.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <SellerMenuPageHeader title="Product Categories" eyebrow="Store Settings" onBack={onBack} />
      <div className="w-full px-4 py-5 sm:px-6 lg:px-8">
        {loading ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 text-sm font-bold text-gray-500">
          Loading categories...
        </div>
      ) : (
        <form onSubmit={saveCategories} className="space-y-5">
          <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-950 text-white">
                  <Layers3 size={19} />
                </span>
                <div>
                  <h2 className="text-lg font-black text-gray-950">Selected categories</h2>
                  <p className="mt-1 text-sm font-semibold text-gray-500">
                    These categories help buyers discover your store and products.
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-black text-gray-700">
                {categories.length}/5 selected
              </span>
            </div>

            <div className="mt-5 flex min-h-16 flex-wrap gap-2 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-3">
              {categories.length ? (
                categories.map((category) => (
                  <span
                    key={category}
                    className="inline-flex items-center gap-2 rounded-full bg-gray-950 px-3 py-2 text-sm font-black text-white"
                  >
                    {category}
                    <button
                      type="button"
                      onClick={() => removeCategory(category)}
                      className="rounded-full bg-white/10 p-0.5 text-white/80 transition hover:bg-white/20 hover:text-white"
                      aria-label={`Remove ${category}`}
                    >
                      <X size={14} />
                    </button>
                  </span>
                ))
              ) : (
                <span className="self-center px-2 text-sm font-bold text-gray-500">
                  No categories selected yet.
                </span>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
            <h2 className="text-lg font-black text-gray-950">Choose from marketplace categories</h2>
            <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {BUSINESS_CATEGORIES.map((category) => {
                const selected = categories.includes(category);
                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => toggleCategory(category)}
                    className={`flex min-h-12 items-center justify-between rounded-xl border px-4 py-3 text-left text-sm font-black transition ${
                      selected
                        ? "border-gray-950 bg-gray-950 text-white"
                        : "border-gray-200 bg-white text-gray-700 hover:border-gray-950"
                    }`}
                  >
                    <span>{category}</span>
                    {selected ? <X size={15} /> : <Plus size={15} />}
                  </button>
                );
              })}
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
              <input
                className={inputClass}
                value={customCategory}
                placeholder="Add a custom category"
                onChange={(event) => {
                  setCustomCategory(event.target.value);
                  setStatus("");
                  setError("");
                }}
              />
              <button
                type="button"
                onClick={addCustomCategory}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-950 px-5 py-3 text-sm font-black text-gray-950 transition hover:bg-gray-950 hover:text-white"
              >
                <Plus size={17} />
                Add
              </button>
            </div>
          </section>

          {error ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              {error}
            </p>
          ) : null}
          {status ? (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
              {status}
            </p>
          ) : null}

          <div className="sticky bottom-3 z-10 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gray-950 px-5 py-3 text-sm font-black text-white shadow-lg shadow-gray-950/15 transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              <Save size={18} />
              {saving ? "Saving..." : "Save categories"}
            </button>
          </div>
        </form>
        )}
      </div>
    </>
  );
}
