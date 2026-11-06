import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";

import { getChurnOverview, getChurnRegions } from "../churnAdminService";
import { countryLabel, formatCount, formatPercent } from "../churnAdminRules.js";
import { tx } from "../churnText.js";
import { regionTone } from "../churnRegionRules.js";
import { inlineErrorMessage } from "../../Backend/services/friendlyErrorService";
import { Card, ErrorNote, Loading } from "./churnUi";

function Tile({ name, detail, users, churnRate, atRisk, onOpen, locale }) {
  const tone = regionTone(churnRate, users);
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-black">{name}</p>
        {onOpen ? <ChevronRight size={16} className="shrink-0 opacity-60" /> : null}
      </div>
      {detail ? <p className="mt-0.5 truncate text-[11px] font-semibold opacity-70">{detail}</p> : null}
      <p className="mt-3 text-2xl font-black tabular-nums">{churnRate === null || churnRate === undefined ? "—" : formatPercent(churnRate, locale)}</p>
      <p className="text-[11px] font-bold opacity-80">
        {tx("tileUsers", { count: formatCount(users, locale) })}{atRisk ? ` · ${tx("tileAtRisk", { count: formatCount(atRisk, locale) })}` : ""}
      </p>
    </>
  );
  const className = `min-h-28 rounded-lg p-3 text-left ring-1 ${tone}`;
  return onOpen
    ? <button type="button" onClick={onOpen} className={`${className} transition hover:-translate-y-0.5 hover:shadow-md`}>{body}</button>
    : <div className={className}>{body}</div>;
}

function Legend() {
  return (
    <div className="mt-4 flex items-center gap-2 text-[11px] font-bold text-zinc-500">
      <span>{tx("legendLow")}</span>
      <span className="flex h-2.5 w-32 overflow-hidden rounded-full">
        <i className="flex-1 bg-emerald-200" /><i className="flex-1 bg-lime-200" /><i className="flex-1 bg-amber-200" /><i className="flex-1 bg-orange-300" /><i className="flex-1 bg-red-400" />
      </span>
      <span>{tx("legendHigh")}</span>
    </div>
  );
}

// Phase 4 map: country → region → district, as heat tiles. Regions carry no
// shapes in KunThai, so this shows each area as a tile coloured by churn rate.
export default function ChurnRegionsPanel({ country, product, locale, onPickCountry }) {
  const [trail, setTrail] = useState([]);
  const [state, setState] = useState({ loading: true, data: null, error: "" });
  const parent = trail.length ? trail[trail.length - 1].id : null;
  const countryChosen = country && country !== "all";

  useEffect(() => { setTrail([]); }, [country, product]);

  useEffect(() => {
    let active = true;
    setState((current) => ({ ...current, loading: true, error: "" }));
    const request = countryChosen
      ? getChurnRegions({ country, product, parent })
      : getChurnOverview({ country: "all", product }).then((overview) => ({ countries: overview?.countries || [] }));
    request
      .then((data) => { if (active) setState({ loading: false, data, error: "" }); })
      .catch((error) => { if (active) setState({ loading: false, data: null, error: inlineErrorMessage(error, tx("loadError")) }); });
    return () => { active = false; };
  }, [country, product, parent, countryChosen]);

  const data = state.data;
  const regions = useMemo(() => data?.regions || [], [data]);

  return (
    <Card
      title={countryChosen ? `${tx("regionsTitle")} · ${data?.countryName || country}` : tx("regionsTitle")}
      note={countryChosen ? tx("regionsNote") : tx("chooseCountry")}
    >
      {countryChosen ? (
        <nav className="mb-4 flex flex-wrap items-center gap-1 text-xs font-black text-zinc-600" aria-label={tx("regionsTitle")}>
          {trail.length ? (
            <button type="button" onClick={() => setTrail((current) => current.slice(0, -1))} className="mr-2 inline-flex h-8 items-center gap-1 rounded-lg border border-zinc-200 px-2 hover:bg-zinc-50">
              <ChevronLeft size={14} />{tx("backTo")}
            </button>
          ) : null}
          <button type="button" onClick={() => setTrail([])} className="inline-flex items-center gap-1 hover:text-emerald-700"><MapPin size={13} />{tx("allAreas")}</button>
          {trail.map((item, index) => (
            <span key={item.id} className="inline-flex items-center gap-1">
              <ChevronRight size={13} className="text-zinc-400" />
              <button type="button" onClick={() => setTrail((current) => current.slice(0, index + 1))} className="hover:text-emerald-700">{item.name}</button>
            </span>
          ))}
        </nav>
      ) : null}

      {state.loading && !data ? <Loading /> : null}
      {state.error ? <ErrorNote message={state.error} /> : null}

      {!countryChosen && data ? (
        (data.countries || []).length ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {data.countries.map((row) => (
              <Tile
                key={row.iso}
                name={countryLabel(row, tx("unknownCountry"))}
                users={row.users}
                atRisk={row.atRisk}
                churnRate={row.churnRate}
                locale={locale}
                onOpen={row.iso && row.iso !== "??" && onPickCountry ? () => onPickCountry(row.iso) : null}
              />
            ))}
          </div>
        ) : <p className="text-sm font-semibold text-zinc-500">{tx("noAreas")}</p>
      ) : null}

      {countryChosen && data ? (
        <>
          {regions.length ? (
            <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 ${state.loading ? "opacity-60" : ""}`}>
              {regions.map((row) => (
                <Tile
                  key={row.id}
                  name={row.name}
                  detail={row.typeLabel}
                  users={row.users}
                  atRisk={row.atRisk}
                  churnRate={row.churnRate}
                  locale={locale}
                  onOpen={row.hasChildren && row.users > 0 ? () => setTrail((current) => [...current, { id: row.id, name: row.name }]) : null}
                />
              ))}
            </div>
          ) : <p className="text-sm font-semibold text-zinc-500">{tx("noAreas")}</p>}
          {data.unplaced ? <p className="mt-3 text-xs font-semibold text-zinc-500">{tx("unplaced", { count: formatCount(data.unplaced, locale) })}</p> : null}
        </>
      ) : null}
      <Legend />
    </Card>
  );
}
