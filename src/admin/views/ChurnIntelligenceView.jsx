import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Banknote,
  Check,
  Globe2,
  LoaderCircle,
  RefreshCw,
  Search,
  TrendingDown,
  TrendingUp,
  UserRoundCheck,
  UserRoundMinus,
  UserRoundPlus,
  Users,
} from "lucide-react";

import { PageHeading } from "./AdminViews";
import { BarList, Card, ErrorNote, Growth, Kpi, Loading, Money, Provisional, TableShell } from "./churnUi";
import ChurnSectorDetail from "./ChurnSectorDetail";
import ChurnRegionsPanel from "./ChurnRegionsPanel";
import ChurnCampaignsPanel from "./ChurnCampaignsPanel";
import { keyedLabel, productName, tx } from "../churnText.js";
import {
  getChurnAccess,
  getChurnAccessList,
  getChurnLeaders,
  getChurnOverview,
  getChurnWatchlist,
  setChurnProductScopes,
} from "../churnAdminService";
import {
  CHURN_PRODUCTS,
  LEADER_PERIODS,
  WATCH_STATUSES,
  countryLabel,
  formatCount,
  formatMoneyList,
  formatPercent,
  growthRate,
  hasProvisional,
  personLabel,
  pointChange,
  sameScopes,
  stickiness,
  toggleProductScope,
  visibleChurnTabs,
  weekdayName,
} from "../churnAdminRules.js";
import { getLocale } from "../../i18n/index";
import { useI18n as useUiLocale } from "../../i18n/index.js";
import { inlineErrorMessage } from "../../Backend/services/friendlyErrorService";

const INACTIVITY_RANGES = [[0, 6], [7, 13], [14, 29], [30, 59], [60, 89], [90, null]];

function Trend({ points }) {
  if (!points || points.length < 2) return <p className="text-sm font-semibold text-zinc-500">{tx("trendNeedsDays")}</p>;
  const width = 600;
  const height = 120;
  const max = Math.max(1, ...points.map((p) => Math.max(p.churned || 0, p.atRisk || 0)));
  const path = (key) => points.map((p, i) => `${i ? "L" : "M"}${(i / (points.length - 1)) * width},${height - ((p[key] || 0) / max) * (height - 8) - 4}`).join(" ");
  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-28 w-full" preserveAspectRatio="none" role="img" aria-label={tx("trendTitle")}>
        <path d={path("churned")} fill="none" stroke="#dc2626" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
        <path d={path("atRisk")} fill="none" stroke="#d97706" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-2 flex gap-4 text-[11px] font-bold text-zinc-600">
        <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-red-600" />{tx("kpiChurned")}</span>
        <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-amber-600" />{tx("kpiAtRisk")}</span>
      </div>
    </div>
  );
}

// Overview -------------------------------------------------------------------

function OverviewTab({ data, locale }) {
  if (!data?.scoredOn) return <Card><p className="text-sm font-semibold text-zinc-600">{tx("noData")}</p></Card>;
  const k = data.kpis || {};
  const change = pointChange(k.churnRate, k.previous?.churnRate);
  const segments = data.segments || {};
  const segmentRows = [
    { key: "low", label: tx("healthLow"), value: segments.low, tone: "bg-emerald-500" },
    { key: "medium", label: tx("healthMedium"), value: segments.medium, tone: "bg-sky-500" },
    { key: "high", label: tx("healthHigh"), value: segments.high, tone: "bg-amber-500" },
    { key: "churned", label: tx("healthChurned"), value: segments.churned, tone: "bg-red-500" },
    { key: "new", label: tx("healthNew"), value: segments.new, tone: "bg-violet-500" },
  ];
  const segmentTotal = segmentRows.reduce((sum, row) => sum + (Number(row.value) || 0), 0);

  return (
    <div className="space-y-5">
      {hasProvisional(data.products) ? (
        <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold leading-5 text-amber-900">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /><p>{tx("provisionalNote")}</p>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label={tx("kpiUsers")} value={formatCount(k.users, locale)} icon={Users} detail={tx("kpiUsersDetail")} />
        <Kpi label={tx("kpiChurned")} value={formatCount(k.churned, locale)} tone="red" icon={UserRoundMinus}
          detail={`${tx("kpiChurnRate", { rate: formatPercent(k.churnRate, locale) })}${change === null ? "" : ` · ${tx(change > 0 ? "changeUp" : "changeDown", { value: Math.abs(change) })}`}`} />
        <Kpi label={tx("kpiAtRisk")} value={formatCount(k.atRisk, locale)} tone="amber" icon={AlertTriangle} detail={tx("kpiAtRiskDetail")} />
        <Kpi label={tx("kpiActive")} value={formatCount(k.active, locale)} tone="emerald" icon={UserRoundCheck} detail={tx("kpiNewDetail", { count: formatCount(k.new, locale) })} />
        <Kpi compact label={tx("kpiRevenueAtRisk")} value={<Money list={data.revenueAtRisk} locale={locale} />} tone="sky" icon={Banknote}
          detail={formatMoneyList(data.revenueLost, locale).length ? `${tx("kpiRevenueLost")}: ${formatMoneyList(data.revenueLost, locale).join(" · ")}` : tx("perMonth")} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={tx("healthTitle")} note={tx("healthNote", { count: formatCount(segmentTotal, locale) })}>
          <div className="mb-4 flex h-3 w-full overflow-hidden rounded-full bg-zinc-100">
            {segmentRows.map((row) => <div key={row.key} className={row.tone} style={{ width: `${segmentTotal ? ((Number(row.value) || 0) / segmentTotal) * 100 : 0}%` }} />)}
          </div>
          <BarList rows={segmentRows.map((row) => ({ ...row, display: `${formatCount(row.value, locale)} · ${formatPercent(segmentTotal ? (row.value || 0) / segmentTotal : 0, locale)}` }))} locale={locale} />
        </Card>
        <Card title={tx("inactivityTitle")} note={tx("inactivityNote")}>
          <BarList
            locale={locale}
            tone="bg-zinc-700"
            rows={(data.inactivity || []).map((row, index) => {
              const [from, to] = INACTIVITY_RANGES[index] || [0, null];
              return { key: String(index), label: to === null ? tx("daysPlus", { from }) : tx("daysRange", { from, to }), value: row.users };
            })}
          />
        </Card>
      </div>

      <Card title={tx("sectorsTitle")}>
        <TableShell head={[tx("colSector"), tx("colUsers"), tx("colChurned"), tx("colAtRisk"), tx("colChurnRate"), tx("colDau"), tx("colWau"), tx("colMau"), tx("colStickiness")]}>
          {(data.products || []).map((row) => (
            <tr key={row.product}>
              <td className="py-2.5 pr-3">
                <span className="font-black text-zinc-950">{productName(row.product, row.label)}</span>{row.provisional ? <Provisional /> : null}
                <span className="block text-[11px] text-zinc-500">{tx("churnAfter", { days: row.churnAfterDays })}</span>
              </td>
              <td className="py-2.5 pr-3 text-right tabular-nums">{formatCount(row.users, locale)}</td>
              <td className="py-2.5 pr-3 text-right tabular-nums text-red-700">{formatCount(row.churned, locale)}</td>
              <td className="py-2.5 pr-3 text-right tabular-nums text-amber-700">{formatCount(row.atRisk, locale)}</td>
              <td className="py-2.5 pr-3 text-right tabular-nums font-black">{formatPercent(row.churnRate, locale)}</td>
              <td className="py-2.5 pr-3 text-right tabular-nums">{formatCount(row.dau, locale)}</td>
              <td className="py-2.5 pr-3 text-right tabular-nums">{formatCount(row.wau, locale)}</td>
              <td className="py-2.5 pr-3 text-right tabular-nums">{formatCount(row.mau, locale)}</td>
              <td className="py-2.5 text-right tabular-nums">{formatPercent(stickiness(row.dau, row.mau), locale)}</td>
            </tr>
          ))}
        </TableShell>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={tx("countriesTitle")}>
          <BarList
            locale={locale}
            tone="bg-red-500"
            rows={(data.countries || []).map((row) => ({
              key: row.iso,
              label: `${countryLabel(row, tx("unknownCountry"))} · ${formatCount(row.users, locale)}`,
              value: Math.round((Number(row.churnRate) || 0) * 1000),
              display: tx("kpiChurnRate", { rate: formatPercent(row.churnRate, locale) }),
            }))}
          />
        </Card>
        <Card title={tx("signalsTitle")} note={tx("signalsNote")}>
          {(data.signals || []).length ? (
            <BarList locale={locale} tone="bg-amber-500" rows={data.signals.map((row) => ({ key: row.key, label: keyedLabel("signal", row.key), value: row.users }))} />
          ) : <p className="text-sm font-semibold text-zinc-500">{tx("signalsEmpty")}</p>}
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={tx("actionsTitle")} note={tx("actionsNote")}>
          {(data.actions || []).length ? (
            <ul className="divide-y divide-zinc-100">
              {data.actions.map((row) => (
                <li key={`${row.action}-${row.product}`} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-zinc-950">{keyedLabel("action", row.action)}</p>
                    <p className="text-[11px] font-semibold text-zinc-500">{productName(row.product)}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-black text-zinc-800">{tx("peopleCount", { count: formatCount(row.users, locale) })}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm font-semibold text-zinc-500">{tx("actionsEmpty")}</p>}
        </Card>
        <Card title={tx("trendTitle")}><Trend points={data.trend} /></Card>
      </div>
    </div>
  );
}

// Growth and leaders -------------------------------------------------------------

function PeopleList({ rows, locale, mode }) {
  if (!rows?.length) return <p className="text-sm font-semibold text-zinc-500">{tx("emptyList")}</p>;
  return (
    <ol className="divide-y divide-zinc-100">
      {rows.map((row, index) => (
        <li key={row.userId} className="flex items-center gap-3 py-2.5">
          <span className="w-5 shrink-0 text-right text-xs font-black text-zinc-400">{index + 1}</span>
          {row.avatarUrl ? <img src={row.avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" loading="lazy" /> : <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-zinc-100 text-xs font-black text-zinc-500">{personLabel(row, "?").replace("@", "").slice(0, 1).toUpperCase()}</span>}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black text-zinc-950">{personLabel(row, tx("unknownUser"))}</p>
            <p className="truncate text-[11px] font-semibold text-zinc-500">{[row.country, ...(row.products || []).map((p) => productName(p))].filter(Boolean).join(" · ")}</p>
          </div>
          <span className="shrink-0 text-right text-xs font-black text-zinc-800">
            {mode === "rising" ? <span className="text-emerald-700">{tx("gainValue", { days: row.gain })}</span> : tx("activeDaysValue", { days: row.activeDays })}
            <span className="block text-[11px] font-semibold text-zinc-500">{tx("actionsValue", { count: formatCount(row.actions, locale) })}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function LeadersTab({ country, product, locale }) {
  const [days, setDays] = useState(30);
  const [state, setState] = useState({ loading: true, data: null, error: "" });

  useEffect(() => {
    let active = true;
    setState((current) => ({ ...current, loading: true, error: "" }));
    getChurnLeaders({ country, product, days })
      .then((data) => { if (active) setState({ loading: false, data, error: "" }); })
      .catch((error) => { if (active) setState({ loading: false, data: null, error: inlineErrorMessage(error, tx("loadError")) }); });
    return () => { active = false; };
  }, [country, product, days]);

  const data = state.data;
  const weekdays = useMemo(() => (data?.weekdays || []).map((row) => ({ key: String(row.weekday), label: weekdayName(row.weekday, locale), value: row.userDays })), [data, locale]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-black uppercase text-zinc-500">{tx("filterPeriod")}</span>
        {LEADER_PERIODS.map((value) => (
          <button key={value} type="button" onClick={() => setDays(value)} aria-pressed={days === value}
            className={`h-9 rounded-lg px-3 text-xs font-black ${days === value ? "bg-zinc-950 text-white" : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"}`}>
            {tx("periodDays", { days: value })}
          </button>
        ))}
      </div>

      {state.loading && !data ? <Loading /> : null}
      {state.error ? <ErrorNote message={state.error} /> : null}

      {data?.to ? (
        <>
          <Card title={tx("leadingCountries")} note={tx("periodRange", { from: data.from, to: data.to })}>
            <TableShell head={[tx("colCountry"), tx("colActive"), tx("colGrowth"), tx("colNewUsers"), tx("colChurnRate"), tx("colSpend")]}>
              {(data.countries || []).map((row, index) => (
                <tr key={row.iso}>
                  <td className="py-2.5 pr-3 font-black text-zinc-950"><span className="mr-2 text-zinc-400">{index + 1}</span>{countryLabel(row, tx("unknownCountry"))}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{formatCount(row.activeUsers, locale)}</td>
                  <td className="py-2.5 pr-3 text-right"><Growth value={row.growth} locale={locale} /></td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{formatCount(row.newUsers, locale)}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{row.churnRate === null || row.churnRate === undefined ? "—" : formatPercent(row.churnRate, locale)}</td>
                  <td className="py-2.5 text-right tabular-nums"><Money list={row.spend} locale={locale} /></td>
                </tr>
              ))}
            </TableShell>
          </Card>

          <Card title={tx("leadingSectors")}>
            <TableShell head={[tx("colSector"), tx("colActive"), tx("colGrowth"), tx("colDau"), tx("colWau"), tx("colActions"), tx("colChurnRate")]}>
              {(data.sectors || []).map((row, index) => (
                <tr key={row.product}>
                  <td className="py-2.5 pr-3 font-black text-zinc-950"><span className="mr-2 text-zinc-400">{index + 1}</span>{productName(row.product, row.label)}{row.provisional ? <Provisional /> : null}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{formatCount(row.activeUsers, locale)}</td>
                  <td className="py-2.5 pr-3 text-right"><Growth value={growthRate(row.activeUsers, row.priorActiveUsers)} locale={locale} /></td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{formatCount(row.dau, locale)}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{formatCount(row.wau, locale)}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{formatCount(row.actions, locale)}</td>
                  <td className="py-2.5 text-right tabular-nums">{row.churnRate === null || row.churnRate === undefined ? "—" : formatPercent(row.churnRate, locale)}</td>
                </tr>
              ))}
            </TableShell>
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card title={tx("mostActiveTitle")} note={data.usersHidden ? tx("usersHidden") : null}>
              {data.usersHidden ? null : <PeopleList rows={data.mostActive} locale={locale} mode="active" />}
            </Card>
            <Card title={tx("risingTitle")} note={data.usersHidden ? tx("usersHidden") : tx("risingNote")}>
              {data.usersHidden ? null : <PeopleList rows={data.rising} locale={locale} mode="rising" />}
            </Card>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card title={tx("crossTitle")} note={tx("crossNote")}>
              <BarList locale={locale} rows={[
                { key: "one", label: tx("crossOne"), value: data.crossSector?.buckets?.one },
                { key: "two", label: tx("crossTwo"), value: data.crossSector?.buckets?.two },
                { key: "three", label: tx("crossThree"), value: data.crossSector?.buckets?.threePlus },
              ]} />
              <h3 className="mt-5 text-xs font-black uppercase text-zinc-500">{tx("crossPairs")}</h3>
              <div className="mt-2">
                <BarList locale={locale} tone="bg-sky-500" rows={(data.crossSector?.pairs || []).map((row) => ({ key: `${row.a}-${row.b}`, label: `${productName(row.a)} + ${productName(row.b)}`, value: row.users }))} />
              </div>
            </Card>
            <div className="space-y-5">
              <Card title={tx("cohortsTitle")} note={tx("cohortsNote")}>
                <BarList locale={locale} rows={(data.cohorts || []).map((row) => ({
                  key: row.month, label: `${row.month} · ${tx("peopleCount", { count: formatCount(row.users, locale) })}`,
                  value: Math.round((Number(row.retention) || 0) * 1000), display: formatPercent(row.retention, locale),
                }))} />
              </Card>
              <Card title={tx("weekdaysTitle")} note={tx("weekdaysNote")}>
                <BarList locale={locale} tone="bg-violet-500" rows={weekdays} />
              </Card>
            </div>
          </div>
        </>
      ) : null}
      {!state.loading && !state.error && !data?.to ? <Card><p className="text-sm font-semibold text-zinc-600">{tx("noData")}</p></Card> : null}
    </div>
  );
}

// Watchlist -----------------------------------------------------------------------

function WatchlistTab({ country, product, locale }) {
  const [status, setStatus] = useState("attention");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [state, setState] = useState({ loading: true, rows: [], total: 0, error: "" });

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const load = useCallback((offset = 0) => {
    setState((current) => ({ ...current, loading: true, error: "" }));
    return getChurnWatchlist({ country, product, status, search: query, offset })
      .then((data) => setState((current) => ({
        loading: false,
        rows: offset ? [...current.rows, ...(data?.rows || [])] : data?.rows || [],
        total: data?.total || 0,
        error: "",
      })))
      .catch((error) => setState((current) => ({ ...current, loading: false, error: inlineErrorMessage(error, tx("loadError")) })));
  }, [country, product, status, query]);

  useEffect(() => { load(0); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">{tx("searchPlaceholder")}</span>
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tx("searchPlaceholder")}
            className="h-10 w-full rounded-lg border border-zinc-200 bg-white pl-9 pr-3 text-sm font-semibold outline-none focus:border-emerald-600" />
        </label>
        <label className="sm:w-56">
          <span className="sr-only">{tx("watchStatus")}</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-black text-zinc-800 outline-none focus:border-emerald-600">
            {WATCH_STATUSES.map((value) => <option key={value} value={value}>{keyedLabel("status", value)}</option>)}
          </select>
        </label>
      </div>
      <p className="text-xs font-semibold text-zinc-500">{tx("watchTotal", { count: formatCount(state.total, locale) })} · {tx("watchAudit")}</p>
      {state.error ? <ErrorNote message={state.error} /> : null}

      <ul className="space-y-3">
        {state.rows.map((row) => (
          <li key={`${row.userId}-${row.product}`} className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex items-start gap-3">
              {row.avatarUrl ? <img src={row.avatarUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" loading="lazy" /> : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-zinc-100 text-sm font-black text-zinc-500">{personLabel(row, "?").replace("@", "").slice(0, 1).toUpperCase()}</span>}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="truncate text-sm font-black text-zinc-950">{personLabel(row, tx("unknownUser"))}</p>
                  {row.username && row.name ? <span className="text-xs font-semibold text-zinc-500">@{row.username}</span> : null}
                  {row.provisional ? <Provisional /> : null}
                </div>
                <p className="mt-0.5 text-xs font-semibold text-zinc-500">
                  {[productName(row.product), row.country, row.daysInactive === null || row.daysInactive === undefined ? null : tx("daysInactiveValue", { days: row.daysInactive })].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className={`text-2xl font-black ${row.score >= 60 ? "text-red-700" : row.score >= 40 ? "text-amber-700" : "text-zinc-700"}`}>{row.score}</p>
                <p className="text-[11px] font-black uppercase text-zinc-500">{keyedLabel("status", row.status)}</p>
              </div>
            </div>
            {(row.signals || []).length ? (
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {row.signals.map((signal) => (
                  <li key={signal.key} title={signal.detail || ""} className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-black text-amber-900 ring-1 ring-amber-200">
                    {keyedLabel("signal", signal.key)} · +{signal.points}
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="mt-3 flex flex-col gap-1 text-xs font-semibold text-zinc-600 sm:flex-row sm:items-center sm:justify-between">
              {row.action ? <p><span className="font-black text-zinc-950">{tx("colAction")}:</span> {keyedLabel("action", row.action)}</p> : <span />}
              {formatMoneyList(Object.entries(row.revenueAtRisk || {}).map(([currency, amount]) => ({ currency, amount })), locale).length ? (
                <p><span className="font-black text-zinc-950">{tx("kpiRevenueAtRisk")}:</span> {formatMoneyList(Object.entries(row.revenueAtRisk || {}).map(([currency, amount]) => ({ currency, amount })), locale).join(" · ")}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {state.loading ? <Loading /> : null}
      {!state.loading && !state.rows.length && !state.error ? <Card><p className="text-sm font-semibold text-zinc-600">{tx("watchEmpty")}</p></Card> : null}
      {!state.loading && state.rows.length < state.total ? (
        <button type="button" onClick={() => load(state.rows.length)} className="h-10 w-full rounded-lg border border-zinc-200 bg-white text-sm font-black text-zinc-800 hover:bg-zinc-50">{tx("loadMore")}</button>
      ) : null}
    </div>
  );
}

// Access ------------------------------------------------------------------------

function AccessRow({ row, products, onSaved }) {
  const [draft, setDraft] = useState(row.products || ["all"]);
  const [state, setState] = useState({ saving: false, message: "", error: "" });
  const changed = !sameScopes(draft, row.products);

  async function save() {
    setState({ saving: true, message: "", error: "" });
    try {
      const result = await setChurnProductScopes(row.assignmentId, draft);
      onSaved(row.assignmentId, result?.products || draft);
      setState({ saving: false, message: tx("accessSaved"), error: "" });
    } catch (error) {
      setState({ saving: false, message: "", error: inlineErrorMessage(error, tx("accessSaveError")) });
    }
  }

  return (
    <li className="py-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <p className="text-sm font-black text-zinc-950">{row.name || row.email}</p>
        <p className="text-xs font-semibold text-zinc-500">
          {[row.roleName, (row.regions || []).includes("all") ? tx("allCountries") : (row.regions || []).join(", "), row.canViewUsers ? tx("namesAllowed") : tx("namesHidden")].filter(Boolean).join(" · ")}
        </p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {["all", ...products.map((item) => item.product)].map((value) => {
          const on = draft.includes(value);
          return (
            <button key={value} type="button" aria-pressed={on} onClick={() => setDraft((current) => toggleProductScope(current, value))}
              className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-black ${on ? "bg-emerald-700 text-white" : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"}`}>
              {on ? <Check size={14} /> : null}{value === "all" ? tx("accessAll") : productName(value)}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button type="button" disabled={!changed || state.saving} onClick={save}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-zinc-950 px-4 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-40">
          {state.saving ? <LoaderCircle size={14} className="animate-spin" /> : null}{tx("accessSave")}
        </button>
        {state.message ? <span className="text-xs font-bold text-emerald-700">{state.message}</span> : null}
        {state.error ? <span className="text-xs font-bold text-red-700">{state.error}</span> : null}
      </div>
    </li>
  );
}

function AccessTab({ products }) {
  const [state, setState] = useState({ loading: true, rows: [], error: "" });

  useEffect(() => {
    let active = true;
    getChurnAccessList()
      .then((rows) => { if (active) setState({ loading: false, rows: rows || [], error: "" }); })
      .catch((error) => { if (active) setState({ loading: false, rows: [], error: inlineErrorMessage(error, tx("loadError")) }); });
    return () => { active = false; };
  }, []);

  const onSaved = useCallback((assignmentId, next) => {
    setState((current) => ({ ...current, rows: current.rows.map((row) => (row.assignmentId === assignmentId ? { ...row, products: next } : row)) }));
  }, []);

  const knownProducts = products.length ? products : CHURN_PRODUCTS.map((product) => ({ product }));
  return (
    <Card title={tx("accessTitle")} note={tx("accessDescription")}>
      {state.loading ? <Loading /> : null}
      {state.error ? <ErrorNote message={state.error} /> : null}
      <ul className="divide-y divide-zinc-100">
        {state.rows.map((row) => <AccessRow key={row.assignmentId} row={row} products={knownProducts} onSaved={onSaved} />)}
      </ul>
    </Card>
  );
}

// Page ---------------------------------------------------------------------------

export default function ChurnIntelligenceView() {
  useUiLocale();
  const locale = getLocale() || "en";
  const [access, setAccess] = useState(null);
  const [accessError, setAccessError] = useState("");
  const [tab, setTab] = useState("overview");
  const [country, setCountry] = useState("all");
  const [product, setProduct] = useState("all");
  const [overview, setOverview] = useState({ loading: true, data: null, error: "" });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    getChurnAccess()
      .then((value) => { if (active) setAccess(value); })
      .catch((error) => { if (active) setAccessError(inlineErrorMessage(error, tx("loadError"))); });
    return () => { active = false; };
  }, [reloadKey]);

  useEffect(() => {
    if (!access || tab !== "overview") return undefined;
    let active = true;
    setOverview((current) => ({ ...current, loading: true, error: "" }));
    getChurnOverview({ country, product })
      .then((data) => { if (active) setOverview({ loading: false, data, error: "" }); })
      .catch((error) => { if (active) setOverview({ loading: false, data: null, error: inlineErrorMessage(error, tx("loadError")) }); });
    return () => { active = false; };
  }, [access, country, product, tab, reloadKey]);

  const tabs = visibleChurnTabs(access);
  const activeTab = tabs.includes(tab) ? tab : "overview";
  const products = access?.products || [];

  return (
    <div>
      <PageHeading
        eyebrow={tx("eyebrow")}
        title={tx("title")}
        description={tx("description")}
        action={(
          <button type="button" onClick={() => setReloadKey((value) => value + 1)} className="inline-flex h-10 items-center gap-2 self-start rounded-lg border border-zinc-200 bg-white px-3 text-sm font-black text-zinc-800 hover:bg-zinc-50">
            <RefreshCw size={16} className={overview.loading && access ? "animate-spin" : ""} />{tx("refresh")}
          </button>
        )}
      />

      {accessError ? <ErrorNote message={accessError} /> : null}
      {!access && !accessError ? <Loading /> : null}

      {access ? (
        <>
          <section className="mb-5 flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-3 shadow-sm 2xl:flex-row 2xl:items-center 2xl:justify-between">
            <div className="flex min-w-0 gap-1 overflow-x-auto" role="tablist">
              {tabs.map((key) => (
                <button key={key} type="button" role="tab" aria-selected={activeTab === key} onClick={() => setTab(key)}
                  className={`h-9 shrink-0 rounded-lg px-3 text-sm font-black ${activeTab === key ? "bg-emerald-700 text-white" : "text-zinc-700 hover:bg-zinc-100"}`}>
                  {tx(`tab.${key}`)}
                </button>
              ))}
            </div>
            {activeTab !== "access" ? (
              <div className="grid grid-cols-2 gap-2 2xl:w-[28rem]">
                <label>
                  <span className="sr-only">{tx("filterCountry")}</span>
                  <span className="relative block">
                    <Globe2 size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                    <select value={country} onChange={(event) => setCountry(event.target.value)} className="h-10 w-full rounded-lg border border-zinc-200 bg-zinc-50 pl-8 pr-2 text-sm font-black text-zinc-800 outline-none focus:border-emerald-600 focus:bg-white">
                      {access.allCountries ? <option value="all">{tx("allCountries")}</option> : null}
                      {!access.allCountries && (access.countries || []).length > 1 ? <option value="all">{tx("myCountries")}</option> : null}
                      {(access.countries || []).map((item) => <option key={item.iso} value={item.iso}>{item.name}</option>)}
                    </select>
                  </span>
                </label>
                <label>
                  <span className="sr-only">{tx("filterSector")}</span>
                  <span className="relative block">
                    <Activity size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                    <select value={product} onChange={(event) => setProduct(event.target.value)} className="h-10 w-full rounded-lg border border-zinc-200 bg-zinc-50 pl-8 pr-2 text-sm font-black text-zinc-800 outline-none focus:border-emerald-600 focus:bg-white">
                      {products.length > 1 ? <option value="all">{tx("allSectors")}</option> : null}
                      {products.map((item) => <option key={item.product} value={item.product}>{productName(item.product, item.label)}</option>)}
                    </select>
                  </span>
                </label>
              </div>
            ) : null}
          </section>

          {access.scoredOn && activeTab !== "access" ? (
            <p className="-mt-2 mb-4 flex items-center gap-1.5 text-xs font-semibold text-zinc-500">
              <UserRoundPlus size={13} />{tx("scoredOn", { date: access.scoredOn })}
              {activeTab === "overview" && overview.data?.comparedTo ? ` · ${tx("comparedTo", { date: overview.data.comparedTo })}` : ""}
            </p>
          ) : null}

          {activeTab === "overview" && product !== "all" ? (
            <div className="mb-5"><ChurnSectorDetail key={`${reloadKey}-${product}-${country}`} product={product} country={country} locale={locale} /></div>
          ) : null}
          {activeTab === "overview" ? (
            overview.error ? <ErrorNote message={overview.error} /> : overview.loading && !overview.data ? <Loading /> : <OverviewTab data={overview.data} locale={locale} />
          ) : null}
          {activeTab === "leaders" ? <LeadersTab key={reloadKey} country={country} product={product} locale={locale} /> : null}
          {activeTab === "regions" ? (
            <ChurnRegionsPanel key={reloadKey} country={country} product={product} locale={locale}
              onPickCountry={(iso) => { if ((access.countries || []).some((item) => item.iso === iso)) setCountry(iso); }} />
          ) : null}
          {activeTab === "campaigns" ? <ChurnCampaignsPanel key={reloadKey} access={access} country={country} product={product} locale={locale} /> : null}
          {activeTab === "watchlist" ? <WatchlistTab key={reloadKey} country={country} product={product} locale={locale} /> : null}
          {activeTab === "access" ? <AccessTab key={reloadKey} products={products} /> : null}
        </>
      ) : null}
    </div>
  );
}
