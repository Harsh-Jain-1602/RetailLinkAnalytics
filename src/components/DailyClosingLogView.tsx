import React, { useMemo, useState } from 'react';
import { CalendarCheck2, CheckCircle2, ClipboardList, Minus, Plus } from 'lucide-react';
import {
  computeSkuAnalytics,
  formatINR,
  type DailyLog,
  type InventoryItem,
  type StoreProfile,
} from '../types/retail';

interface DailyClosingLogViewProps {
  store: StoreProfile;
  items: InventoryItem[];
  logs: DailyLog[];
  onSubmitClosingLog: (salesByItemId: Record<string, number>) => Promise<void>;
}

export const DailyClosingLogView: React.FC<DailyClosingLogViewProps> = ({
  store,
  items,
  logs,
  onSubmitClosingLog,
}) => {
  const [salesInput, setSalesInput] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    items.forEach((item) => {
      initial[item.id] = Math.min(item.currentStock, Math.round(item.dailyVelocity));
    });
    return initial;
  });

  const [submitting, setSubmitting] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const getQty = (item: InventoryItem) => {
    if (typeof salesInput[item.id] === 'number') return salesInput[item.id];
    return Math.min(item.currentStock, Math.round(item.dailyVelocity));
  };

  const setQty = (item: InventoryItem, next: number) => {
    const clamped = Math.max(0, Math.min(item.currentStock, Math.round(next)));
    setSalesInput((prev) => ({ ...prev, [item.id]: clamped }));
    setSavedNotice(null);
  };

  const handleZeroAll = () => {
    const next: Record<string, number> = {};
    items.forEach((item) => {
      next[item.id] = 0;
    });
    setSalesInput(next);
    setSavedNotice(null);
  };

  const handlePrefillTypical = () => {
    const next: Record<string, number> = {};
    items.forEach((item) => {
      next[item.id] = Math.min(item.currentStock, Math.round(item.dailyVelocity));
    });
    setSalesInput(next);
    setSavedNotice(null);
  };

  const previewSummary = useMemo(() => {
    let totalUnits = 0;
    let totalRevenue = 0;
    let itemsWithSales = 0;
    let projectedAlerts = 0;

    for (const item of items) {
      const sold = getQty(item);
      if (sold > 0) {
        itemsWithSales += 1;
        totalUnits += sold;
        totalRevenue += sold * item.sellingPrice;
      }
      const remainingStock = Math.max(0, item.currentStock - sold);
      const updatedVelocity =
        sold > 0 ? Number((item.dailyVelocity * 0.7 + sold * 0.3).toFixed(1)) : item.dailyVelocity;
      const postAnalytics = computeSkuAnalytics({
        ...item,
        currentStock: remainingStock,
        dailyVelocity: updatedVelocity,
      });
      if (postAnalytics.status === 'critical' || postAnalytics.status === 'reorder') {
        projectedAlerts += 1;
      }
    }

    return { totalUnits, totalRevenue, itemsWithSales, projectedAlerts };
  }, [items, salesInput]);

  const handleSaveLog = async () => {
    const payload: Record<string, number> = {};
    items.forEach((item) => {
      payload[item.id] = getQty(item);
    });
    setSubmitting(true);
    try {
      await onSubmitClosingLog(payload);
      setSavedNotice(
        `Closing log saved (${previewSummary.totalUnits} units · ${formatINR(previewSummary.totalRevenue)}). Predictive alerts updated.`
      );
      const resetNext: Record<string, number> = {};
      items.forEach((item) => {
        resetNext[item.id] = 0;
      });
      setSalesInput(resetNext);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Pilot Habit Summary */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold font-display text-slate-900">
            Closing-Time Daily Sales Log
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Update units sold at closing time to keep predictive stockout alerts accurate without manual paper counting.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs">
          <div className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-lg">
            <span className="text-slate-500">14-Day Habit Streak: </span>
            <span className="font-mono font-semibold text-slate-900">
              {store.consecutiveLogDays} / 14 days
            </span>
            <span className="text-slate-400"> · Target ≥ 10 days</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrefillTypical}
              className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg whitespace-nowrap"
            >
              Prefill Typical Velocity
            </button>
            <button
              type="button"
              onClick={handleZeroAll}
              className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg whitespace-nowrap"
            >
              Reset to 0
            </button>
          </div>
        </div>
      </section>

      {savedNotice && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2.5 text-xs text-emerald-900 font-medium">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>{savedNotice}</span>
        </div>
      )}

      {/* Batch Entry Table */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                <th className="py-2.5 px-4">Fast-Mover Item</th>
                <th className="py-2.5 px-3 text-right">Opening Stock</th>
                <th className="py-2.5 px-3 text-right">Avg Daily Velocity</th>
                <th className="py-2.5 px-3 text-center">Units Sold Today</th>
                <th className="py-2.5 px-3 text-right">Projected Closing</th>
                <th className="py-2.5 px-4 text-right">Est. Sales Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {items.map((item) => {
                const sold = getQty(item);
                const closing = Math.max(0, item.currentStock - sold);
                return (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 min-w-[200px]">
                      <div className="font-medium text-slate-900">{item.name}</div>
                      <div className="text-[11px] text-slate-500">
                        {item.category} · {formatINR(item.sellingPrice)} / {item.unit}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-slate-700 whitespace-nowrap">
                      {item.currentStock} {item.unit}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-slate-500 whitespace-nowrap">
                      {item.dailyVelocity.toFixed(1)}
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setQty(item, sold - 1)}
                          aria-label={`Decrease sold quantity for ${item.name}`}
                          className="p-1.5 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <input
                          type="number"
                          min={0}
                          max={item.currentStock}
                          value={sold}
                          onChange={(e) => setQty(item, Number(e.target.value))}
                          aria-label={`Units sold for ${item.name}`}
                          className="w-16 py-1 px-2 text-center font-mono text-xs border border-slate-300 rounded-md focus:outline-none focus:border-teal-700"
                        />
                        <button
                          type="button"
                          onClick={() => setQty(item, sold + 1)}
                          aria-label={`Increase sold quantity for ${item.name}`}
                          className="p-1.5 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-mono whitespace-nowrap">
                      <span
                        className={
                          closing <= item.dailyVelocity * item.leadTimeDays
                            ? 'font-semibold text-red-700'
                            : 'text-slate-700'
                        }
                      >
                        {closing}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-900 whitespace-nowrap">
                      {formatINR(sold * item.sellingPrice)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Sticky / Bottom Action Summary */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-5 text-xs text-slate-600">
            <div>
              Items logged:{' '}
              <span className="font-mono font-semibold text-slate-900">
                {previewSummary.itemsWithSales}
              </span>
            </div>
            <div>
              Total units sold:{' '}
              <span className="font-mono font-semibold text-slate-900">
                {previewSummary.totalUnits}
              </span>
            </div>
            <div>
              Est. daily revenue:{' '}
              <span className="font-mono font-semibold text-slate-900">
                {formatINR(previewSummary.totalRevenue)}
              </span>
            </div>
            <div>
              Alerts after save:{' '}
              <span className="font-mono font-semibold text-amber-700">
                {previewSummary.projectedAlerts}
              </span>
            </div>
          </div>

          <button
            type="button"
            disabled={submitting || items.length === 0}
            onClick={handleSaveLog}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <CalendarCheck2 className="w-4 h-4" />
            {submitting ? 'Updating Stock & Alerts...' : 'Save Closing Log'}
          </button>
        </div>
      </section>

      {/* Historical Daily Logs */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-slate-500" />
          <h3 className="text-sm font-semibold font-display text-slate-900">
            Recent Closing Logs
          </h3>
        </div>
        {logs.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No closing logs recorded yet. Save today’s closing tally above to begin your 14-day pilot streak.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                  <th className="py-2.5 px-4">Date</th>
                  <th className="py-2.5 px-3 text-right">SKUs Logged</th>
                  <th className="py-2.5 px-3 text-right">Units Sold</th>
                  <th className="py-2.5 px-3 text-right">Estimated Revenue</th>
                  <th className="py-2.5 px-4 text-right">Alerts Flagged</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-mono text-slate-800">{log.dateKey}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                      {log.itemsLoggedCount}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                      {log.totalUnitsSold}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-900">
                      {formatINR(log.estimatedRevenue)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-amber-700">
                      {log.alertsTriggered}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
