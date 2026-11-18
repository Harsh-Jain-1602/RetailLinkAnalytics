import React, { useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  MessageSquareText,
  PackageCheck,
  Plus,
  Send,
  Truck,
  X,
} from 'lucide-react';
import {
  clampNum,
  computeSkuAnalytics,
  formatINR,
  sanitizeStr,
  type Distributor,
  type InventoryItem,
  type RestockOrder,
  type StoreProfile,
} from '../types/retail';

interface DistributorOrdersViewProps {
  store: StoreProfile;
  items: InventoryItem[];
  distributors: Distributor[];
  orders: RestockOrder[];
  onCreateOrder: (
    order: Omit<RestockOrder, 'id' | 'ownerId' | 'storeId' | 'createdAt' | 'updatedAt'>
  ) => Promise<void>;
  onMarkOrderSent: (order: RestockOrder) => Promise<void>;
  onMarkOrderDelivered: (order: RestockOrder) => Promise<void>;
  onAddDistributor: (
    dist: Omit<Distributor, 'id' | 'ownerId' | 'storeId' | 'createdAt' | 'updatedAt'>
  ) => Promise<void>;
}

export const DistributorOrdersView: React.FC<DistributorOrdersViewProps> = ({
  store,
  items,
  distributors,
  orders,
  onCreateOrder,
  onMarkOrderSent,
  onMarkOrderDelivered,
  onAddDistributor,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [distModalOpen, setDistModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [distForm, setDistForm] = useState({
    name: '',
    whatsappNumber: '+91 ',
    area: 'Sudhowala Chowk, Dehradun',
    categories: 'Daily Needs & FMCG',
    avgLeadTimeDays: '1',
  });

  // Auto-group urgent items (critical & reorder) by distributor
  const recommendedBundles = useMemo(() => {
    return distributors
      .map((dist) => {
        const urgentItems = items
          .filter((item) => item.distributorId === dist.id)
          .map((item) => ({ item, analytics: computeSkuAnalytics(item) }))
          .filter(
            ({ analytics }) =>
              (analytics.status === 'critical' || analytics.status === 'reorder') &&
              analytics.suggestedOrderQty > 0
          );

        const totalUnits = urgentItems.reduce(
          (sum, entry) => sum + entry.analytics.suggestedOrderQty,
          0
        );
        const estimatedCost = urgentItems.reduce(
          (sum, entry) =>
            sum + entry.analytics.suggestedOrderQty * entry.item.costPrice,
          0
        );

        const lines = urgentItems.map(
          ({ item, analytics }) =>
            `- ${item.name}: ${analytics.suggestedOrderQty} ${item.unit}`
        );

        const whatsappMessage =
          urgentItems.length > 0
            ? `Namaste ${dist.name},\nAutomated restock order from ${store.storeName} (${store.location}):\n${lines.join('\n')}\nEstimated order value: ${formatINR(estimatedCost)}.\nPlease confirm dispatch timing. Thank you.`
            : '';

        return {
          distributor: dist,
          urgentItems,
          totalUnits,
          estimatedCost,
          lines,
          whatsappMessage,
        };
      })
      .filter((b) => b.urgentItems.length > 0);
  }, [distributors, items, store]);

  const fulfillmentMetrics = useMemo(() => {
    const sentOrDelivered = orders.filter(
      (o) => o.status === 'sent' || o.status === 'delivered'
    );
    const delivered = orders.filter((o) => o.status === 'delivered');
    const rate =
      sentOrDelivered.length > 0
        ? Math.round((delivered.length / sentOrDelivered.length) * 100)
        : 100;
    return {
      totalDispatched: sentOrDelivered.length,
      deliveredCount: delivered.length,
      fulfillmentRate: rate,
    };
  }, [orders]);

  const handleQueueAndSend = async (
    bundle: (typeof recommendedBundles)[number],
    status: 'draft' | 'sent'
  ) => {
    setSubmitting(true);
    try {
      await onCreateOrder({
        distributorId: bundle.distributor.id,
        distributorName: bundle.distributor.name,
        itemIds: bundle.urgentItems.map((u) => u.item.id).slice(0, 50),
        itemsSummary: bundle.lines.join('\n').slice(0, 2000),
        itemCount: bundle.urgentItems.length,
        totalUnits: bundle.totalUnits,
        estimatedCost: Math.round(bundle.estimatedCost),
        whatsappMessage: bundle.whatsappMessage.slice(0, 3000),
        status,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyText = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId((curr) => (curr === id ? null : curr)), 2000);
    } catch {
      // Clipboard fallback not needed
    }
  };

  const handleSaveDistributor = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = sanitizeStr(distForm.name, 120);
    const cleanPhone = sanitizeStr(distForm.whatsappNumber, 20);
    const cleanArea = sanitizeStr(distForm.area, 120);
    const cleanCats = sanitizeStr(distForm.categories, 160);

    if (cleanName.length < 2) {
      setFormError('Distributor name must be at least 2 characters.');
      return;
    }
    if (!/^[0-9+\-\s]{8,20}$/.test(cleanPhone)) {
      setFormError('Enter a valid WhatsApp phone number (8–20 digits/+/-).');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      await onAddDistributor({
        name: cleanName,
        whatsappNumber: cleanPhone,
        area: cleanArea.length >= 2 ? cleanArea : 'Dehradun',
        categories: cleanCats.length >= 2 ? cleanCats : 'General Wholesale',
        avgLeadTimeDays: clampNum(Number(distForm.avgLeadTimeDays), 0.5, 30),
      });
      setDistModalOpen(false);
      setDistForm({
        name: '',
        whatsappNumber: '+91 ',
        area: 'Sudhowala Chowk, Dehradun',
        categories: 'Daily Needs & FMCG',
        avgLeadTimeDays: '1',
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not add distributor.');
    } finally {
      setSubmitting(false);
    }
  };

  const formatWaHref = (phone: string, text: string) => {
    const digits = phone.replace(/[^0-9]/g, '');
    return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
  };

  return (
    <div className="space-y-6">
      {/* Header & Fulfillment Metrics */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Ready Wholesale Bundles</p>
          <p className="mt-2 text-2xl font-semibold font-mono text-slate-900">
            {recommendedBundles.length}
          </p>
          <p className="mt-1.5 text-xs text-slate-600">
            Auto-grouped from critical & reorder SKUs
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Distributor Fulfillment Rate</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-semibold font-mono text-slate-900">
              {fulfillmentMetrics.fulfillmentRate}%
            </span>
            <span className="text-xs text-slate-500">
              ({fulfillmentMetrics.deliveredCount}/{fulfillmentMetrics.totalDispatched} orders)
            </span>
          </div>
          <p className="mt-1.5 text-xs text-teal-800 font-medium">
            Pilot validation target: ≥ 80% without follow-up calls
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Connected Distributors</p>
            <p className="mt-2 text-2xl font-semibold font-mono text-slate-900">
              {distributors.length}
            </p>
          </div>
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setDistModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Wholesale Distributor
            </button>
          </div>
        </div>
      </section>

      {/* Auto-Recommended WhatsApp Order Bundles */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold font-display text-slate-900">
              Automated Predictive Restock Bundles
            </h2>
            <p className="text-xs text-slate-500">
              Prepared for instant WhatsApp dispatch to your primary Dehradun wholesale distributors.
            </p>
          </div>
        </div>

        {recommendedBundles.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-2">
            <CheckCircle2 className="w-6 h-6 text-emerald-700 mx-auto" />
            <p className="text-sm font-medium text-slate-900">
              All tracked fast-movers are currently above their reorder threshold.
            </p>
            <p className="text-xs text-slate-500">
              When daily closing logs push items into Critical or Reorder Soon, automated WhatsApp order drafts appear here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {recommendedBundles.map((bundle) => (
              <div
                key={bundle.distributor.id}
                className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-4"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold font-display text-slate-900">
                        {bundle.distributor.name}
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {bundle.distributor.whatsappNumber} · {bundle.distributor.area}
                      </p>
                    </div>
                    <div className="text-right font-mono">
                      <div className="text-sm font-semibold text-slate-900">
                        {formatINR(bundle.estimatedCost)}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {bundle.urgentItems.length} SKUs · {bundle.totalUnits} units
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-700 whitespace-pre-wrap leading-relaxed">
                    {bundle.whatsappMessage}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        handleCopyText(bundle.distributor.id, bundle.whatsappMessage)
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg whitespace-nowrap"
                    >
                      {copiedId === bundle.distributor.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-700" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          Copy WhatsApp Text
                        </>
                      )}
                    </button>

                    <a
                      href={formatWaHref(
                        bundle.distributor.whatsappNumber,
                        bundle.whatsappMessage
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg whitespace-nowrap"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Open WhatsApp
                    </a>
                  </div>

                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => handleQueueAndSend(bundle, 'sent')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg whitespace-nowrap"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Log Dispatched Order
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Dispatched & Delivered Order History */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Truck className="w-4 h-4 text-slate-500" />
            <h3 className="text-sm font-semibold font-display text-slate-900">
              Distributor Restock Order Ledger
            </h3>
          </div>
          <span className="text-xs text-slate-500">
            Confirming delivery automatically replenishes SKU inventory
          </span>
        </div>

        {orders.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No restocking orders dispatched yet. Send a recommended bundle above to start tracking distributor fulfillment.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {orders.map((order) => (
              <div
                key={order.id}
                className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-50/70"
              >
                <div className="space-y-1.5 max-w-2xl">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-semibold text-slate-900">
                      {order.distributorName}
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="font-mono text-slate-700">
                      {order.itemCount} SKUs · {order.totalUnits} units ·{' '}
                      {formatINR(order.estimatedCost)}
                    </span>
                    <span className="text-slate-400">·</span>
                    <span
                      className={`font-medium ${
                        order.status === 'delivered'
                          ? 'text-emerald-700'
                          : order.status === 'sent'
                            ? 'text-amber-700'
                            : 'text-slate-600'
                      }`}
                    >
                      {order.status === 'delivered'
                        ? 'Delivered & Restocked'
                        : order.status === 'sent'
                          ? 'Sent via WhatsApp'
                          : 'Draft'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 whitespace-pre-line leading-relaxed">
                    {order.itemsSummary}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleCopyText(order.id, order.whatsappMessage)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg whitespace-nowrap"
                  >
                    <MessageSquareText className="w-3.5 h-3.5" />
                    {copiedId === order.id ? 'Copied' : 'Copy Msg'}
                  </button>

                  {order.status === 'draft' && (
                    <button
                      type="button"
                      onClick={() => onMarkOrderSent(order)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg whitespace-nowrap"
                    >
                      <Send className="w-3.5 h-3.5" />
                      Mark Sent
                    </button>
                  )}

                  {order.status !== 'delivered' && (
                    <button
                      type="button"
                      onClick={() => onMarkOrderDelivered(order)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg whitespace-nowrap"
                    >
                      <PackageCheck className="w-3.5 h-3.5" />
                      Mark Delivered & Replenish
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Local Wholesale Distributors Directory */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h3 className="text-sm font-semibold font-display text-slate-900">
            Local Wholesale Distributors
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200">
          {distributors.map((d) => (
            <div key={d.id} className="p-5 space-y-1.5 text-xs">
              <div className="font-semibold text-slate-900">{d.name}</div>
              <div className="text-slate-600">
                WhatsApp: <span className="font-mono text-slate-800">{d.whatsappNumber}</span> · Lead Time:{' '}
                <span className="font-mono text-slate-800">{d.avgLeadTimeDays}d</span>
              </div>
              <div className="text-slate-500">
                {d.area} · {d.categories}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Add Distributor Modal */}
      {distModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md overflow-hidden shadow-lg">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-semibold font-display text-slate-900">
                Add Local Wholesale Distributor
              </h3>
              <button
                type="button"
                onClick={() => setDistModalOpen(false)}
                aria-label="Close modal"
                className="p-1 text-slate-400 hover:text-slate-700 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveDistributor} className="p-5 space-y-4 text-xs">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg">
                  {formError}
                </div>
              )}
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Distributor Name
                </label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={distForm.name}
                  onChange={(e) => setDistForm({ ...distForm, name: e.target.value })}
                  placeholder="e.g. Dehradun Wholesale Traders"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    WhatsApp Number
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={20}
                    value={distForm.whatsappNumber}
                    onChange={(e) =>
                      setDistForm({ ...distForm, whatsappNumber: e.target.value })
                    }
                    className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Avg Lead Time (Days)
                  </label>
                  <input
                    type="number"
                    min={0.5}
                    max={30}
                    step="0.5"
                    required
                    value={distForm.avgLeadTimeDays}
                    onChange={(e) =>
                      setDistForm({ ...distForm, avgLeadTimeDays: e.target.value })
                    }
                    className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
                  />
                </div>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Supply Area
                </label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={distForm.area}
                  onChange={(e) => setDistForm({ ...distForm, area: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Supplied Categories
                </label>
                <input
                  type="text"
                  required
                  maxLength={160}
                  value={distForm.categories}
                  onChange={(e) =>
                    setDistForm({ ...distForm, categories: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
                />
              </div>
              <div className="pt-2 flex justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setDistModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
                >
                  {submitting ? 'Saving...' : 'Save Distributor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
