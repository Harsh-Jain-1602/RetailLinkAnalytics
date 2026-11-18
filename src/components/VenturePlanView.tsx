import React, { useMemo, useState } from 'react';
import { CheckCircle2, CircleDot, TrendingUp } from 'lucide-react';
import { VENTURE_PLAN_DATA } from '../data/seedData';
import { formatINR, type RestockOrder, type StoreProfile } from '../types/retail';

interface VenturePlanViewProps {
  store: StoreProfile;
  orders: RestockOrder[];
  onUpgradePlan: () => Promise<void>;
}

type ScenarioKey = 'conservative' | 'base' | 'ambitious';

export const VenturePlanView: React.FC<VenturePlanViewProps> = ({
  store,
  orders,
  onUpgradePlan,
}) => {
  const [selectedCompetitorId, setSelectedCompetitorId] = useState<string>('retaillink');
  const [scenarioKey, setScenarioKey] = useState<ScenarioKey>('base');
  const [customCustomers, setCustomCustomers] = useState<number>(
    VENTURE_PLAN_DATA.scenarios.base.customers
  );
  const [customPrice, setCustomPrice] = useState<number>(
    VENTURE_PLAN_DATA.scenarios.base.sellingPrice
  );
  const [customVariableCost, setCustomVariableCost] = useState<number>(
    VENTURE_PLAN_DATA.scenarios.base.variableCost
  );
  const [customFixedCost, setCustomFixedCost] = useState<number>(
    VENTURE_PLAN_DATA.scenarios.base.fixedCost
  );
  const [upgrading, setUpgrading] = useState(false);

  const selectedCompetitor = useMemo(
    () =>
      VENTURE_PLAN_DATA.competitors.find((c) => c.id === selectedCompetitorId) ||
      VENTURE_PLAN_DATA.competitors[3],
    [selectedCompetitorId]
  );

  const handleSelectScenario = (key: ScenarioKey) => {
    setScenarioKey(key);
    const s = VENTURE_PLAN_DATA.scenarios[key];
    setCustomCustomers(s.customers);
    setCustomPrice(s.sellingPrice);
    setCustomVariableCost(s.variableCost);
    setCustomFixedCost(s.fixedCost);
  };

  const economics = useMemo(() => {
    const contributionPerSale = customPrice - customVariableCost;
    const monthlyRevenue = customCustomers * customPrice;
    const totalVariableCost = customCustomers * customVariableCost;
    const operatingSurplus = monthlyRevenue - totalVariableCost - customFixedCost;
    const breakEvenStores =
      contributionPerSale > 0 ? Math.ceil(customFixedCost / contributionPerSale) : 0;
    return {
      contributionPerSale,
      monthlyRevenue,
      operatingSurplus,
      breakEvenStores,
    };
  }, [customCustomers, customPrice, customVariableCost, customFixedCost]);

  const fulfillmentRate = useMemo(() => {
    const sentOrDone = orders.filter((o) => o.status === 'sent' || o.status === 'delivered');
    const done = orders.filter((o) => o.status === 'delivered');
    if (sentOrDone.length === 0) return 0;
    return Math.round((done.length / sentOrDone.length) * 100);
  }, [orders]);

  // SVG Chart dimensions for 2x2 Matrix
  const chartSize = 360;
  const pad = 42;
  const plotSpan = chartSize - pad * 2;
  const toSvgX = (score: number) => pad + ((score - 1) / 9) * plotSpan;
  const toSvgY = (score: number) => chartSize - pad - ((score - 1) / 9) * plotSpan;

  const handleActivateSubscription = async () => {
    setUpgrading(true);
    try {
      await onUpgradePlan();
    } finally {
      setUpgrading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Venture Positioning Header */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-teal-800">
              {VENTURE_PLAN_DATA.meta.institution} · {VENTURE_PLAN_DATA.meta.geography}
            </p>
            <h2 className="text-lg font-semibold font-display text-slate-900 mt-1">
              Venture Strategy, Competitor Battlefield & Unit Economics
            </h2>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {store.planStatus === 'active' ? (
              <span className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg">
                <CheckCircle2 className="w-4 h-4" />
                Active ₹1,000/mo Plan
              </span>
            ) : (
              <button
                type="button"
                disabled={upgrading}
                onClick={handleActivateSubscription}
                className="px-4 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg whitespace-nowrap"
              >
                {upgrading ? 'Activating...' : 'Convert Trial to ₹1,000/mo Plan'}
              </button>
            )}
          </div>
        </div>
        <p className="text-xs text-slate-600 leading-relaxed max-w-4xl">
          {VENTURE_PLAN_DATA.meta.positioningStatement}
        </p>
      </section>

      {/* Mission 5: Competitor Battlefield 2x2 Matrix */}
      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="mb-5">
          <h3 className="text-sm font-semibold font-display text-slate-900">
            Competitor Battlefield Matrix
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Select any alternative on the chart to inspect offer, pricing, strengths, and field evidence.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-6 flex justify-center bg-slate-50 border border-slate-200 rounded-xl p-4">
            <svg
              viewBox={`0 0 ${chartSize} ${chartSize}`}
              className="w-full max-w-[360px] h-auto"
              role="img"
              aria-label="Competitor Battlefield 2x2 Scatter Plot"
            >
              {/* Top-Right Target Quadrant Highlight */}
              <rect
                x={pad + plotSpan / 2}
                y={pad}
                width={plotSpan / 2}
                height={plotSpan / 2}
                fill="#F0FDFA"
              />
              {/* Axes & Gridlines */}
              <rect
                x={pad}
                y={pad}
                width={plotSpan}
                height={plotSpan}
                fill="none"
                stroke="#CBD5E1"
                strokeWidth="1"
              />
              <line
                x1={pad + plotSpan / 2}
                y1={pad}
                x2={pad + plotSpan / 2}
                y2={chartSize - pad}
                stroke="#CBD5E1"
                strokeDasharray="4 4"
              />
              <line
                x1={pad}
                y1={pad + plotSpan / 2}
                x2={chartSize - pad}
                y2={pad + plotSpan / 2}
                stroke="#CBD5E1"
                strokeDasharray="4 4"
              />

              {/* Axis Titles */}
              <text
                x={chartSize / 2}
                y={chartSize - 12}
                textAnchor="middle"
                className="fill-slate-600 text-[10px] font-medium"
              >
                Predictive Intelligence (1 Reactive → 10 Predictive)
              </text>
              <text
                x={14}
                y={chartSize / 2}
                textAnchor="middle"
                transform={`rotate(-90 14 ${chartSize / 2})`}
                className="fill-slate-600 text-[10px] font-medium"
              >
                Kirana Usability (1 Complex → 10 Simple)
              </text>

              {/* Competitor Points */}
              {VENTURE_PLAN_DATA.competitors.map((comp) => {
                const cx = toSvgX(comp.x);
                const cy = toSvgY(comp.y);
                const isSelected = comp.id === selectedCompetitorId;
                const isUs = comp.id === 'retaillink';

                return (
                  <g
                    key={comp.id}
                    onClick={() => setSelectedCompetitorId(comp.id)}
                    className="cursor-pointer"
                  >
                    <circle
                      cx={cx}
                      cy={cy}
                      r={isSelected ? 12 : 9}
                      fill={isUs ? '#0F766E' : isSelected ? '#0F172A' : '#64748B'}
                      stroke="#FFFFFF"
                      strokeWidth="2"
                    />
                    <text
                      x={cx}
                      y={cy + 3.5}
                      textAnchor="middle"
                      className="fill-white text-[9px] font-mono font-semibold pointer-events-none"
                    >
                      {comp.x},{comp.y}
                    </text>
                    <text
                      x={cx}
                      y={cy - 15}
                      textAnchor="middle"
                      className={`text-[10px] font-medium ${
                        isUs ? 'fill-teal-800 font-semibold' : 'fill-slate-700'
                      }`}
                    >
                      {comp.id === 'manual'
                        ? 'Manual'
                        : comp.id === 'pos'
                          ? 'Legacy POS'
                          : comp.id === 'b2b-apps'
                            ? 'B2B Apps'
                            : 'RetailLink'}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="lg:col-span-6 space-y-4">
            <div className="flex flex-wrap gap-1.5">
              {VENTURE_PLAN_DATA.competitors.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedCompetitorId(c.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                    selectedCompetitorId === c.id
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {c.id === 'retaillink' ? 'RetailLink Analytics' : c.name.split('(')[0].trim()}
                </button>
              ))}
            </div>

            <div className="border border-slate-200 rounded-xl p-5 space-y-3 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[11px] font-medium text-teal-800">
                    {selectedCompetitor.type} · Score ({selectedCompetitor.x}, {selectedCompetitor.y})
                  </div>
                  <h4 className="text-sm font-semibold font-display text-slate-900 mt-0.5">
                    {selectedCompetitor.name}
                  </h4>
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div>
                  <span className="font-semibold text-slate-800">Price / Cost: </span>
                  <span className="text-slate-600">{selectedCompetitor.price}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-800">Main Offer: </span>
                  <span className="text-slate-600">{selectedCompetitor.offer}</span>
                </div>
                <div>
                  <span className="font-semibold text-emerald-800">Main Strength: </span>
                  <span className="text-slate-600">{selectedCompetitor.strength}</span>
                </div>
                <div>
                  <span className="font-semibold text-red-700">Main Weakness: </span>
                  <span className="text-slate-600">{selectedCompetitor.weakness}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-800">Evidence Source: </span>
                  <span className="text-slate-600">{selectedCompetitor.evidence}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Missions 7 & 8: Unit Economics & Market Size */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold font-display text-slate-900">
              Subscription Unit Economics & Market Sizing
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Compare Conservative, Base, and Ambitious Dehradun adoption scenarios or adjust parameters live.
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(['conservative', 'base', 'ambitious'] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => handleSelectScenario(key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  scenarioKey === key
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {VENTURE_PLAN_DATA.scenarios[key].label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 grid grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Active Stores
              </label>
              <input
                type="number"
                min={1}
                max={1000}
                value={customCustomers}
                onChange={(e) => setCustomCustomers(Math.max(1, Number(e.target.value)))}
                className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Monthly Fee (₹)
              </label>
              <input
                type="number"
                min={100}
                max={10000}
                step={50}
                value={customPrice}
                onChange={(e) => setCustomPrice(Math.max(0, Number(e.target.value)))}
                className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Variable Cost / Store (₹)
              </label>
              <input
                type="number"
                min={0}
                max={5000}
                value={customVariableCost}
                onChange={(e) => setCustomVariableCost(Math.max(0, Number(e.target.value)))}
                className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Monthly Fixed Cost (₹)
              </label>
              <input
                type="number"
                min={0}
                max={500000}
                step={1000}
                value={customFixedCost}
                onChange={(e) => setCustomFixedCost(Math.max(0, Number(e.target.value)))}
                className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div className="col-span-2 p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 leading-relaxed">
              {VENTURE_PLAN_DATA.scenarios[scenarioKey].notes}
            </div>
          </div>

          <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 border border-slate-200 rounded-xl">
              <div className="text-[11px] text-slate-500">Contribution / Sale</div>
              <div className="mt-1.5 text-lg font-semibold font-mono text-slate-900">
                {formatINR(economics.contributionPerSale)}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">per store / mo</div>
            </div>

            <div className="p-4 border border-slate-200 rounded-xl">
              <div className="text-[11px] text-slate-500">Monthly Revenue</div>
              <div className="mt-1.5 text-lg font-semibold font-mono text-slate-900">
                {formatINR(economics.monthlyRevenue)}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                {customCustomers} paying stores
              </div>
            </div>

            <div className="p-4 border border-slate-200 rounded-xl">
              <div className="text-[11px] text-slate-500">Operating Surplus</div>
              <div
                className={`mt-1.5 text-lg font-semibold font-mono ${
                  economics.operatingSurplus >= 0 ? 'text-emerald-700' : 'text-red-700'
                }`}
              >
                {formatINR(economics.operatingSurplus)}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">after fixed costs</div>
            </div>

            <div className="p-4 border border-slate-200 rounded-xl">
              <div className="text-[11px] text-slate-500">Break-Even Point</div>
              <div className="mt-1.5 text-lg font-semibold font-mono text-slate-900">
                {economics.breakEvenStores}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">active stores</div>
            </div>

            <div className="col-span-2 sm:col-span-4 grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="text-[11px] text-slate-500">TAM (India Kirana)</div>
                <div className="text-sm font-semibold font-mono text-slate-900 mt-0.5">
                  {VENTURE_PLAN_DATA.marketSize.tam}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {VENTURE_PLAN_DATA.marketSize.tamCustomers}
                </div>
              </div>
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="text-[11px] text-slate-500">SAM (Uttarakhand & W. UP)</div>
                <div className="text-sm font-semibold font-mono text-slate-900 mt-0.5">
                  {VENTURE_PLAN_DATA.marketSize.sam}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {VENTURE_PLAN_DATA.marketSize.samCustomers}
                </div>
              </div>
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="text-[11px] text-slate-500">SOM (Dehradun 12–18 mo)</div>
                <div className="text-sm font-semibold font-mono text-teal-800 mt-0.5">
                  {VENTURE_PLAN_DATA.marketSize.som}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {VENTURE_PLAN_DATA.marketSize.somCustomers}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Missions 9 & 11: 30-Day Field Rollout & Live Assumptions Validation */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h3 className="text-sm font-semibold font-display text-slate-900">
            30-Day Sudhowala Chowk Field Experiment
          </h3>
          <div className="divide-y divide-slate-100">
            {VENTURE_PLAN_DATA.rolloutWeeks.map((item) => (
              <div key={item.week} className="py-3 first:pt-0 last:pb-0 text-xs space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-900">
                    {item.week} · {item.focus}
                  </span>
                  <span className="font-mono text-[11px] text-teal-800">
                    {item.target}
                  </span>
                </div>
                <p className="text-slate-600">{item.action}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-teal-700" />
            <h3 className="text-sm font-semibold font-display text-slate-900">
              Top 3 MVP Pilot Assumptions
            </h3>
          </div>
          <div className="space-y-3 text-xs">
            <div className="p-3.5 border border-slate-200 rounded-lg space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-900">
                  1. {VENTURE_PLAN_DATA.assumptions[0].title}
                </span>
                <span className="font-mono text-teal-800">
                  {store.consecutiveLogDays}/10 days
                </span>
              </div>
              <p className="text-slate-600">
                {VENTURE_PLAN_DATA.assumptions[0].targetEvidence}
              </p>
            </div>

            <div className="p-3.5 border border-slate-200 rounded-lg space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-900">
                  2. {VENTURE_PLAN_DATA.assumptions[1].title}
                </span>
                <span className="font-mono text-teal-800">
                  {fulfillmentRate}% / 80%
                </span>
              </div>
              <p className="text-slate-600">
                {VENTURE_PLAN_DATA.assumptions[1].targetEvidence}
              </p>
            </div>

            <div className="p-3.5 border border-slate-200 rounded-lg space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-900">
                  3. {VENTURE_PLAN_DATA.assumptions[2].title}
                </span>
                <span className="inline-flex items-center gap-1 font-mono text-slate-700">
                  <CircleDot className="w-3 h-3 text-teal-700" />
                  {store.planStatus === 'active' ? 'Converted' : '14-Day Trial'}
                </span>
              </div>
              <p className="text-slate-600">
                {VENTURE_PLAN_DATA.assumptions[2].targetEvidence}
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
