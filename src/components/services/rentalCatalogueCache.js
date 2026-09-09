// Public catalogue only: never cache reservation or manager-only data here.
export function createRentalCatalogueCache(fetchRows, now = Date.now) {
  const entries = new Map();
  return {
    read(country) { return entries.get(country)?.rows || []; },
    clear() { entries.clear(); },
    load(country, force = false) {
      const previous = entries.get(country);
      if (previous?.pending) return previous.pending;
      if (!force && previous?.rows && now() - previous.time < 60000) return Promise.resolve(previous.rows);
      const pending = Promise.resolve().then(() => fetchRows(country)).then((rows) => {
        const visible = rows.filter((row) => row.status === "available" && !row.deleted_at);
        if (entries.get(country)?.pending === pending) entries.set(country, { rows: visible, time: now() });
        return visible;
      }).catch((error) => {
        if (entries.get(country)?.pending === pending) entries.delete(country);
        throw error;
      });
      entries.set(country, { ...previous, pending });
      return pending;
    },
  };
}
