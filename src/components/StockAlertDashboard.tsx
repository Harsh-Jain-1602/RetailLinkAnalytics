import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Archive,
  CheckCircle2,
  Edit3,
  PackagePlus,
  Search,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import {
  clampNum,
  computeSkuAnalytics,
  formatINR,
  sanitizeStr,
  SKU_CATEGORIES,
  type Distributor,
  type InventoryItem,
  type SkuCategory,
  type StockStatus,
  type StoreProfile,
} from '../types/retail';

interface StockAlertDashboardProps {
  store: StoreProfile;
  items: InventoryItem[];
  distributors: Distributor[];
  loading: boolean;
  onAddItem: (item: Omit<InventoryItem, 'id' | 'ownerId' | 'storeId' | 'createdAt' | 'updatedAt' | 'lastLoggedAt' | 'totalSoldTrial'>) => Promise<void>;
  onUpdateItem: (id: string, patch: Partial<InventoryItem>) => Promise<void>;
  onDeleteItem: (id: string) => Promise<void>;
  onQuickQueueRestock: (item: InventoryItem) => void;
  onOpenDailyLog: () => void;
}

const STATUS_META: Record<
  StockStatus,
  { label: string; colorClass: string; icon: React.ComponentType<{ className?: string }> }
> = {
  critical: {
    label: 'Critical',
    colorClass: 'text-red-700 bg-red-50 border-red-200',
    icon: AlertCircle,
  },
  reorder: {
    label: 'Reorder Soon',
    colorClass: 'text-amber-700 bg-amber-50 border-amber-200',
    icon: AlertTriangle,
  },
  optimal: {
    label: 'Optimal',
    colorClass: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    icon: CheckCircle2,
  },
  overstocked: {
    label: 'Overstocked',
    colorClass: 'text-slate-700 bg-slate-100 border-slate-300',
    icon: Archive,
  },
};

export const StockAlertDashboard: React.FC<StockAlertDashboardProps> = ({
  store,
  items,
  distributors,
  loading,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
  onQuickQueueRestock,
  onOpenDailyLog,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | StockStatus>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | SkuCategory>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [formState, setFormState] = useState({
    name: '',
    category: 'Dairy & Bread' as SkuCategory,
    unit: 'packs',
    currentStock: '20',
    dailyVelocity: '10',
    leadTimeDays: '1',
    safetyBufferDays: '2',
    costPrice: '20',
    sellingPrice: '25',
    distributorId: distributors[0]?.id || '',
  });

  const enrichedItems = useMemo(() => {
    const priorityOrder: Record<StockStatus, number> = {
      critical: 0,
      reorder: 1,
      overstocked: 2,
      optimal: 3,
    };

    return items
      .map((item) => ({
        item,
        analytics: computeSkuAnalytics(item),
      }))
      .sort((a, b) => {
        const diff = priorityOrder[a.analytics.status] - priorityOrder[b.analytics.status];
        if (diff !== 0) return diff;
        return a.analytics.daysRemaining - b.analytics.daysRemaining;
      });
  }, [items]);

  const metrics = useMemo(() => {
    let urgentCount = 0;
    let criticalCount = 0;
    let atRiskDaily = 0;
    let trappedCapital = 0;

    for (const { analytics } of enrichedItems) {
      if (analytics.status === 'critical') {
        criticalCount += 1;
        urgentCount += 1;
      } else if (analytics.status === 'reorder') {
        urgentCount += 1;
      }
      atRiskDaily += analytics.atRiskDailyRevenue;
      trappedCapital += analytics.trappedCapital;
    }

    return {
      urgentCount,
      criticalCount,
      atRiskDaily,
      trappedCapital,
    };
  }, [enrichedItems]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return enrichedItems.filter(({ item, analytics }) => {
      if (statusFilter !== 'all' && analytics.status !== statusFilter) return false;
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
      if (
        q &&
        !item.name.toLowerCase().includes(q) &&
        !item.distributorName.toLowerCase().includes(q) &&
        !item.category.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [enrichedItems, searchQuery, statusFilter, categoryFilter]);

  const openCreateModal = () => {
    setEditingItem(null);
    setFormError(null);
    setFormState({
      name: '',
      category: 'Dairy & Bread',
      unit: 'packs',
      currentStock: '25',
      dailyVelocity: '12',
      leadTimeDays: String(distributors[0]?.avgLeadTimeDays || 1),
      safetyBufferDays: '2',
      costPrice: '20',
      sellingPrice: '25',
      distributorId: distributors[0]?.id || '',
    });
    setModalOpen(true);
  };

  const openEditModal = (item: InventoryItem) => {
    setEditingItem(item);
    setFormError(null);
    setFormState({
      name: item.name,
      category: item.category,
      unit: item.unit,
      currentStock: String(item.currentStock),
      dailyVelocity: String(item.dailyVelocity),
      leadTimeDays: String(item.leadTimeDays),
      safetyBufferDays: String(item.safetyBufferDays),
      costPrice: String(item.costPrice),
      sellingPrice: String(item.sellingPrice),
      distributorId: item.distributorId,
    });
    setModalOpen(true);
  };

  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = sanitizeStr(formState.name, 120);
    const cleanUnit = sanitizeStr(formState.unit, 32);

    if (cleanName.length < 2) {
      setFormError('Item name must be at least 2 characters.');
      return;
    }
    if (cleanUnit.length < 1) {
      setFormError('Unit label is required (e.g. packs, packets, kg).');
      return;
    }

    const selectedDist =
      distributors.find((d) => d.id === formState.distributorId) || distributors[0];
    if (!selectedDist) {
      setFormError('Please add a local distributor before adding SKUs.');
      return;
    }

    const payload = {
      name: cleanName,
      category: formState.category,
      unit: cleanUnit,
      currentStock: clampNum(Number(formState.currentStock), 0, 100000),
      dailyVelocity: clampNum(Number(formState.dailyVelocity), 0, 10000),
      leadTimeDays: clampNum(Number(formState.leadTimeDays), 0.5, 30),
      safetyBufferDays: clampNum(Number(formState.safetyBufferDays), 0, 30),
      costPrice: clampNum(Number(formState.costPrice), 0, 100000),
      sellingPrice: clampNum(Number(formState.sellingPrice), 0, 100000),
      distributorId: selectedDist.id,
      distributorName: selectedDist.name,
    };

    setSubmitting(true);
    setFormError(null);
    try {
      if (editingItem) {
        await onUpdateItem(editingItem.id, payload);
      } else {
        await onAddItem(payload);
      }
      setModalOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save SKU.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 4-Column KPI Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Urgent Restock Alerts</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-semibold font-mono text-slate-900">
              {metrics.urgentCount}
            </span>
            <span className="text-xs text-slate-500">
              of {items.length} / 50 fast-movers
            </span>
          </div>
          <p className="mt-2 text-xs text-red-700 font-medium">
            {metrics.criticalCount} critical stockout risk
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Daily Revenue At Risk</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-semibold font-mono text-slate-900">
              {formatINR(metrics.atRiskDaily)}
            </span>
            <span className="text-xs text-slate-500">/ day</span>
          </div>
          <p className="mt-2 text-xs text-slate-600">
            Protected by proactive reorder alerts
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Dead-Stock Capital Tied Up</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-semibold font-mono text-slate-900">
              {formatINR(metrics.trappedCapital)}
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-600">
            Freeable working capital from overstock
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">14-Day Pilot Progress</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-semibold font-mono text-slate-900">
              {store.consecutiveLogDays}
            </span>
            <span className="text-xs text-slate-500">/ 14 days logged</span>
          </div>
          <p className="mt-2 text-xs text-teal-800 font-medium">
            {store.weeklyRestockCycles} / 3 stockout-free weekly cycles
          </p>
        </div>
      </section>

      {/* Main Inventory Alert Workspace */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold font-display text-slate-900">
              Fast-Mover Stock Alert Dashboard
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Leagile predictive reorder tracking for {store.storeName} · {store.location}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onOpenDailyLog}
              className="px-3.5 py-2 text-xs font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Log Closing Sales
            </button>
            <button
              type="button"
              onClick={openCreateModal}
              disabled={items.length >= 50}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <PackagePlus className="w-3.5 h-3.5" />
              Add Fast-Mover SKU
            </button>
          </div>
        </div>

        {/* Search & Filter Controls */}
        <div className="px-5 py-3.5 bg-slate-50/70 border-b border-slate-200 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
            {(
              [
                { id: 'all', label: `All (${items.length})` },
                { id: 'critical', label: 'Critical' },
                { id: 'reorder', label: 'Reorder Soon' },
                { id: 'optimal', label: 'Optimal' },
                { id: 'overstocked', label: 'Overstocked' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  statusFilter === tab.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <select
              aria-label="Filter by category"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as 'all' | SkuCategory)}
              className="px-3 py-1.5 text-xs text-slate-700 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
            >
              <option value="all">All Categories</option>
              {SKU_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search SKU or distributor..."
                className="w-full sm:w-60 pl-8 pr-3 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
              />
            </div>
          </div>
        </div>

        {/* High-Density Data Grid */}
        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4, 5].map((row) => (
              <div
                key={row}
                className="h-10 bg-slate-100 rounded-lg animate-pulse"
              />
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <p className="text-sm font-medium text-slate-800">
              No fast-moving SKUs match your current filters.
            </p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Clear your search filter or add a top-selling daily item to start generating automated reorder predictions.
            </p>
            <div className="pt-1 flex justify-center gap-2">
              {statusFilter !== 'all' || categoryFilter !== 'all' || searchQuery ? (
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter('all');
                    setCategoryFilter('all');
                    setSearchQuery('');
                  }}
                  className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg whitespace-nowrap"
                >
                  Reset Filters
                </button>
              ) : (
                <button
                  type="button"
                  onClick={openCreateModal}
                  className="px-3.5 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg whitespace-nowrap"
                >
                  Add First Fast-Mover SKU
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                  <th className="py-2.5 px-4">Item & Category</th>
                  <th className="py-2.5 px-3">Distributor</th>
                  <th className="py-2.5 px-3 text-right">Stock</th>
                  <th className="py-2.5 px-3 text-right">Velocity / Day</th>
                  <th className="py-2.5 px-3 text-right">Days Left</th>
                  <th className="py-2.5 px-3 text-right">Reorder At</th>
                  <th className="py-2.5 px-3 text-right">Suggested Order</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredItems.map(({ item, analytics }) => {
                  const meta = STATUS_META[analytics.status];
                  const StatusIcon = meta.icon;
                  const isUrgent =
                    analytics.status === 'critical' || analytics.status === 'reorder';

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50/90 transition-colors"
                    >
                      <td className="py-3 px-4 min-w-[210px]">
                        <div className="font-medium text-slate-900">{item.name}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {item.category} · Cost {formatINR(item.costPrice)} · MRP {formatINR(item.sellingPrice)}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-slate-600 whitespace-nowrap">
                        <div>{item.distributorName}</div>
                        <div className="text-[11px] text-slate-400">
                          {item.leadTimeDays}d lead · {item.safetyBufferDays}d buffer
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-900 whitespace-nowrap">
                        {item.currentStock}{' '}
                        <span className="text-[11px] font-sans text-slate-500">{item.unit}</span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-700 whitespace-nowrap">
                        {item.dailyVelocity.toFixed(1)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono whitespace-nowrap">
                        <span
                          className={
                            analytics.daysRemaining <= item.leadTimeDays
                              ? 'text-red-700 font-semibold'
                              : analytics.daysRemaining <= item.leadTimeDays + item.safetyBufferDays
                                ? 'text-amber-700 font-semibold'
                                : 'text-slate-700'
                          }
                        >
                          {analytics.daysRemaining >= 99
                            ? '99+'
                            : analytics.daysRemaining.toFixed(1)}
                          d
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-600 whitespace-nowrap">
                        {analytics.reorderPoint}
                      </td>
                      <td className="py-3 px-3 text-right font-mono whitespace-nowrap">
                        {analytics.suggestedOrderQty > 0 ? (
                          <span className="font-semibold text-teal-800">
                            +{analytics.suggestedOrderQty}
                          </span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium border rounded-md ${meta.colorClass}`}
                        >
                          <StatusIcon className="w-3 h-3 shrink-0" />
                          {meta.label}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          {isUrgent && analytics.suggestedOrderQty > 0 && (
                            <button
                              type="button"
                              onClick={() => onQuickQueueRestock(item)}
                              title="Create WhatsApp Restock Order"
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-md transition-colors whitespace-nowrap"
                            >
                              <Send className="w-3 h-3" />
                              Order
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openEditModal(item)}
                            aria-label={`Edit ${item.name}`}
                            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteItem(item.id)}
                            aria-label={`Delete ${item.name}`}
                            className="p-1.5 text-slate-400 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Add / Edit Fast-Mover SKU Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg overflow-hidden shadow-lg">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-semibold font-display text-slate-900">
                {editingItem ? 'Edit Fast-Mover SKU' : 'Add Fast-Mover SKU'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Close modal"
                className="p-1 text-slate-400 hover:text-slate-700 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveModal} className="p-5 space-y-4 text-xs">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg">
                  {formError}
                </div>
              )}

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Product Name & Pack Size
                </label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={formState.name}
                  onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                  placeholder="e.g. Amul Taaza Toned Milk 500ml"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Category</label>
                  <select
                    value={formState.category}
                    onChange={(e) =>
                      setFormState({ ...formState, category: e.target.value as SkuCategory })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700 bg-white"
                  >
                    {SKU_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">Unit</label>
                  <input
                    type="text"
                    required
                    maxLength={32}
                    value={formState.unit}
                    onChange={(e) => setFormState({ ...formState, unit: e.target.value })}
                    placeholder="packets, packs, bottles"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Current Stock
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="1"
                    required
                    value={formState.currentStock}
                    onChange={(e) =>
                      setFormState({ ...formState, currentStock: e.target.value })
                    }
                    className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Avg Daily Sales Velocity
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.5"
                    required
                    value={formState.dailyVelocity}
                    onChange={(e) =>
                      setFormState({ ...formState, dailyVelocity: e.target.value })
                    }
                    className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Distributor Lead Time (Days)
                  </label>
                  <input
                    type="number"
                    min={0.5}
                    max={30}
                    step="0.5"
                    required
                    value={formState.leadTimeDays}
                    onChange={(e) =>
                      setFormState({ ...formState, leadTimeDays: e.target.value })
                    }
                    className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Safety Buffer (Days)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    step="0.5"
                    required
                    value={formState.safetyBufferDays}
                    onChange={(e) =>
                      setFormState({ ...formState, safetyBufferDays: e.target.value })
                    }
                    className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Wholesale Cost (₹)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.5"
                    required
                    value={formState.costPrice}
                    onChange={(e) =>
                      setFormState({ ...formState, costPrice: e.target.value })
                    }
                    className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Retail Selling Price (₹)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.5"
                    required
                    value={formState.sellingPrice}
                    onChange={(e) =>
                      setFormState({ ...formState, sellingPrice: e.target.value })
                    }
                    className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Assigned Local Distributor
                </label>
                <select
                  value={formState.distributorId}
                  onChange={(e) =>
                    setFormState({ ...formState, distributorId: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700 bg-white"
                >
                  {distributors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.avgLeadTimeDays}d lead)
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg whitespace-nowrap"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-60 rounded-lg whitespace-nowrap"
                >
                  {submitting ? 'Saving...' : editingItem ? 'Save Changes' : 'Add SKU'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
