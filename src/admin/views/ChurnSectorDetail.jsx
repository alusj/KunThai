import { useEffect, useState } from "react";

import { getChurnProductDetail } from "../churnAdminService";
import { formatCount, formatPercent } from "../churnAdminRules.js";
import { keyedLabel, productName, tx } from "../churnText.js";
import { inlineErrorMessage } from "../../Backend/services/friendlyErrorService";
import { BarList, Card, ErrorNote, Loading, Money, Provisional, TableShell } from "./churnUi";

// One sector in detail (Phase 4): its churn rule, what counts as activity, the
// engagement funnel, risk score bands, and which signals lead to churn.
export default function ChurnSectorDetail({ product, country, locale }) {
  const [state, setState] = useState({ loading: true, data: null, error: "" });

  useEffect(() => {
    let active = true;
    setState((current) => ({ ...current, loading: true, error: "" }));
    getChurnProductDetail({ product, country })
      .then((data) => { if (active) setState({ loading: false, data, error: "" }); })
      .catch((error) => { if (active) setState({ loading: false, data: null, error: inlineErrorMessage(error, tx("loadError")) }); });
    return () => { active = false; };
  }, [product, country]);

  if (state.loading && !state.data) return <Loading />;
  if (state.error) return <ErrorNote message={state.error} />;
  const data = state.data;
  if (!data?.scoredOn) return null;

  const funnel = data.funnel || {};
  const funnelRows = [
    { key: "customers", label: tx("funnelCustomers"), value: funnel.customers, tone: "bg-zinc-800" },
    ...(data.tracksOpens ? [{ key: "opened", label: tx("funnelOpened"), value: funnel.opened30, tone: "bg-sky-500" }] : []),
    { key: "active30", label: tx("funnelActive30"), value: funnel.active30, tone: "bg-emerald-600" },
    { key: "active7", label: tx("funnelActive7"), value: funnel.active7, tone: "bg-emerald-500" },
    { key: "acted", label: tx("funnelActed"), value: funnel.acted30, tone: "bg-violet-500" },
    { key: "spent", label: tx("funnelSpent"), value: funnel.spent30, tone: "bg-amber-500" },
  ].map((row) => ({
    ...row,
    display: `${formatCount(row.value, locale)} · ${formatPercent((Number(row.value) || 0) / Math.max(Number(funnel.customers) || 0, 1), locale)}`,
  }));
  const liftReady = Boolean(data.baselineDay) && (data.signals || []).some((row) => row.lift !== null && row.lift !== undefined);

  return (
    <section className="space-y-5" aria-label={tx("detailTitle", { sector: productName(data.product, data.label) })}>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title={tx("ruleTitle")} className="lg:col-span-1">
          <p className="text-sm font-semibold leading-6 text-zinc-700">
            {data.product === "business_plan" ? tx("rulePlanText") : tx("ruleText", { days: data.churnAfterDays })}
            {data.provisional ? <Provisional /> : null}
          </p>
          <h3 className="mt-4 text-xs font-black uppercase text-zinc-500">{tx("activityTitle")}</h3>
          <p className="mt-1 text-sm font-semibold leading-6 text-zinc-700">{keyedLabel("activity", data.product)}</p>
          {(data.spend30 || []).length ? (
            <>
              <h3 className="mt-4 text-xs font-black uppercase text-zinc-500">{tx("spend30")}</h3>
              <p className="mt-1 text-sm font-black text-zinc-950"><Money list={data.spend30} locale={locale} /></p>
            </>
          ) : null}
        </Card>
        <Card title={tx("funnelTitle")} note={tx("avgActive", { days: funnel.avgActiveDays30 ?? 0, count: funnel.avgActions30 ?? 0 })} className="lg:col-span-2">
          <BarList rows={funnelRows} locale={locale} />
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <Card title={tx("scoreBandsTitle")} className="lg:col-span-2">
          <BarList
            locale={locale}
            rows={(data.scoreBands || []).map((band) => ({
              key: String(band.from),
              label: tx("scoreBand", { from: band.from, to: band.to }),
              value: band.users,
              tone: band.from >= 60 ? "bg-red-500" : band.from >= 40 ? "bg-amber-500" : "bg-emerald-500",
            }))}
          />
        </Card>
        <Card title={tx("liftTitle")} note={liftReady ? tx("liftNote", { date: data.baselineDay }) : tx("liftPending")} className="lg:col-span-3">
          {(data.signals || []).length ? (
            <TableShell head={[tx("colSignal"), tx("colUsers"), tx("colWith"), tx("colWithout"), tx("colLift")]}>
              {data.signals.map((row) => (
                <tr key={row.key}>
                  <td className="py-2.5 pr-3 font-black text-zinc-950">{keyedLabel("signal", row.key)}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{formatCount(row.users, locale)}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{row.withChurnRate === null || row.withChurnRate === undefined ? "—" : formatPercent(row.withChurnRate, locale)}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{row.withoutChurnRate === null || row.withoutChurnRate === undefined ? "—" : formatPercent(row.withoutChurnRate, locale)}</td>
                  <td className="py-2.5 text-right font-black tabular-nums">{row.lift === null || row.lift === undefined ? "—" : tx("liftValue", { value: row.lift })}</td>
                </tr>
              ))}
            </TableShell>
          ) : <p className="text-sm font-semibold text-zinc-500">{tx("signalsEmpty")}</p>}
        </Card>
      </div>
    </section>
  );
}
