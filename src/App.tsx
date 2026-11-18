import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  BarChart3,
  BellRing,
  CalendarCheck2,
  Edit2,
  LogOut,
  Menu,
  Store,
  Truck,
  X,
} from 'lucide-react';
import { DailyClosingLogView } from './components/DailyClosingLogView';
import { DistributorOrdersView } from './components/DistributorOrdersView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { GoogleSignInButton } from './components/GoogleSignInButton';
import { StockAlertDashboard } from './components/StockAlertDashboard';
import { VenturePlanView } from './components/VenturePlanView';
import {
  DEMO_DISTRIBUTORS,
  DEMO_ITEMS,
  DEMO_LOGS,
  DEMO_ORDERS,
  DEMO_STORE,
  seedStoreForUser,
} from './data/seedData';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from './lib/firebase';
import {
  computeSkuAnalytics,
  formatINR,
  sanitizeStr,
  type DailyLog,
  type Distributor,
  type InventoryItem,
  type RestockOrder,
  type StoreProfile,
} from './types/retail';

type ActiveTab = 'alerts' | 'daily-log' | 'orders' | 'venture';

const NAV_ITEMS: {
  id: ActiveTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'alerts', label: 'Stock Alerts', icon: BellRing },
  { id: 'daily-log', label: 'Closing Log', icon: CalendarCheck2 },
  { id: 'orders', label: 'Distributor Orders', icon: Truck },
  { id: 'venture', label: 'Venture & ROI', icon: BarChart3 },
];

function AppContent() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<ActiveTab>('alerts');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);

  // Store & collections (either Firestore-synced when signed in, or interactive demo when signed out)
  const [store, setStore] = useState<StoreProfile>(DEMO_STORE);
  const [items, setItems] = useState<InventoryItem[]>(DEMO_ITEMS);
  const [distributors, setDistributors] = useState<Distributor[]>(DEMO_DISTRIBUTORS);
  const [logs, setLogs] = useState<DailyLog[]>(DEMO_LOGS);
  const [orders, setOrders] = useState<RestockOrder[]>(DEMO_ORDERS);

  // Store Profile Edit Modal
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({
    storeName: DEMO_STORE.storeName,
    ownerName: DEMO_STORE.ownerName,
    location: DEMO_STORE.location,
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthReady(true);
      setAuthError(null);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!authReady) return;

    if (!user) {
      setStore(DEMO_STORE);
      setItems(DEMO_ITEMS);
      setDistributors(DEMO_DISTRIBUTORS);
      setLogs(DEMO_LOGS);
      setOrders(DEMO_ORDERS);
      setDataLoading(false);
      return;
    }

    let cancelled = false;
    let unsubStore: (() => void) | undefined;
    let unsubItems: (() => void) | undefined;
    let unsubDist: (() => void) | undefined;
    let unsubLogs: (() => void) | undefined;
    let unsubOrders: (() => void) | undefined;

    async function initUserWorkspace(currentUser: User) {
      setDataLoading(true);
      const uid = currentUser.uid;
      const storeRef = doc(db, 'stores', uid);

      try {
        const snap = await getDoc(storeRef);
        if (!snap.exists()) {
          await seedStoreForUser(uid, currentUser.displayName);
        }
      } catch (err) {
        if (!cancelled) {
          handleFirestoreError(err, OperationType.GET, `stores/${uid}`);
        }
        return;
      }

      if (cancelled) return;

      unsubStore = onSnapshot(
        storeRef,
        (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.data() as StoreProfile;
            setStore(data);
            setProfileForm({
              storeName: data.storeName,
              ownerName: data.ownerName,
              location: data.location,
            });
          }
          setDataLoading(false);
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, `stores/${uid}`);
        }
      );

      const itemsPath = `stores/${uid}/items`;
      unsubItems = onSnapshot(
        query(collection(db, itemsPath), where('ownerId', '==', uid)),
        (snapshot) => {
          const list: InventoryItem[] = snapshot.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<InventoryItem, 'id'>),
          }));
          setItems(list);
        },
        (error) => {
          handleFirestoreError(error, OperationType.LIST, itemsPath);
        }
      );

      const distPath = `stores/${uid}/distributors`;
      unsubDist = onSnapshot(
        query(collection(db, distPath), where('ownerId', '==', uid)),
        (snapshot) => {
          const list: Distributor[] = snapshot.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<Distributor, 'id'>),
          }));
          setDistributors(list);
        },
        (error) => {
          handleFirestoreError(error, OperationType.LIST, distPath);
        }
      );

      const logsPath = `stores/${uid}/dailyLogs`;
      unsubLogs = onSnapshot(
        query(collection(db, logsPath), where('ownerId', '==', uid)),
        (snapshot) => {
          const list: DailyLog[] = snapshot.docs
            .map((d) => ({
              id: d.id,
              ...(d.data() as Omit<DailyLog, 'id'>),
            }))
            .sort((a, b) => b.dateKey.localeCompare(a.dateKey));
          setLogs(list);
        },
        (error) => {
          handleFirestoreError(error, OperationType.LIST, logsPath);
        }
      );

      const ordersPath = `stores/${uid}/orders`;
      unsubOrders = onSnapshot(
        query(collection(db, ordersPath), where('ownerId', '==', uid)),
        (snapshot) => {
          const list: RestockOrder[] = snapshot.docs
            .map((d) => ({
              id: d.id,
              ...(d.data() as Omit<RestockOrder, 'id'>),
            }))
            .sort((a, b) => b.id.localeCompare(a.id));
          setOrders(list);
        },
        (error) => {
          handleFirestoreError(error, OperationType.LIST, ordersPath);
        }
      );
    }

    initUserWorkspace(user);

    return () => {
      cancelled = true;
      unsubStore?.();
      unsubItems?.();
      unsubDist?.();
      unsubLogs?.();
      unsubOrders?.();
    };
  }, [authReady, user]);

  const handleGoogleSignIn = async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : 'Google Sign-In could not be completed.';
      if (!msg.includes('popup-closed-by-user')) {
        setAuthError(msg);
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
  };

  // --- CRUD Handlers (Firestore when signed in, local state in preview) ---

  const handleAddItem = async (
    payload: Omit<
      InventoryItem,
      'id' | 'ownerId' | 'storeId' | 'createdAt' | 'updatedAt' | 'lastLoggedAt' | 'totalSoldTrial'
    >
  ) => {
    const newId = `sku-${Date.now()}`;
    if (!user) {
      setItems((prev) => [
        {
          id: newId,
          ownerId: 'demo-store',
          storeId: 'demo-store',
          ...payload,
          totalSoldTrial: 0,
        },
        ...prev,
      ]);
      return;
    }

    const path = `stores/${user.uid}/items/${newId}`;
    try {
      await setDoc(doc(db, 'stores', user.uid, 'items', newId), {
        ownerId: user.uid,
        storeId: user.uid,
        ...payload,
        totalSoldTrial: 0,
        lastLoggedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const handleUpdateItem = async (id: string, patch: Partial<InventoryItem>) => {
    if (!user) {
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
      );
      return;
    }

    const path = `stores/${user.uid}/items/${id}`;
    try {
      await updateDoc(doc(db, 'stores', user.uid, 'items', id), {
        name: patch.name,
        category: patch.category,
        unit: patch.unit,
        currentStock: patch.currentStock,
        dailyVelocity: patch.dailyVelocity,
        leadTimeDays: patch.leadTimeDays,
        safetyBufferDays: patch.safetyBufferDays,
        costPrice: patch.costPrice,
        sellingPrice: patch.sellingPrice,
        distributorId: patch.distributorId,
        distributorName: patch.distributorName,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!user) {
      setItems((prev) => prev.filter((item) => item.id !== id));
      return;
    }

    const path = `stores/${user.uid}/items/${id}`;
    try {
      await deleteDoc(doc(db, 'stores', user.uid, 'items', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const handleSubmitClosingLog = async (salesByItemId: Record<string, number>) => {
    let totalUnits = 0;
    let estimatedRevenue = 0;
    let itemsLoggedCount = 0;
    let alertsTriggered = 0;

    const updatedItemsList = items.map((item) => {
      const sold = Math.max(0, Math.min(item.currentStock, salesByItemId[item.id] || 0));
      if (sold > 0) {
        itemsLoggedCount += 1;
        totalUnits += sold;
        estimatedRevenue += sold * item.sellingPrice;
      }
      const nextStock = Math.max(0, item.currentStock - sold);
      const nextVelocity =
        sold > 0
          ? Number((item.dailyVelocity * 0.7 + sold * 0.3).toFixed(1))
          : item.dailyVelocity;
      const nextTotalSold = item.totalSoldTrial + sold;
      const post = computeSkuAnalytics({
        ...item,
        currentStock: nextStock,
        dailyVelocity: nextVelocity,
      });
      if (post.status === 'critical' || post.status === 'reorder') {
        alertsTriggered += 1;
      }
      return {
        ...item,
        currentStock: nextStock,
        dailyVelocity: nextVelocity,
        totalSoldTrial: nextTotalSold,
      };
    });

    const todayKey = new Date().toISOString().slice(0, 10);
    const logId = `log-${Date.now()}`;

    if (!user) {
      setItems(updatedItemsList);
      setLogs((prev) => [
        {
          id: logId,
          ownerId: 'demo-store',
          storeId: 'demo-store',
          dateKey: todayKey,
          itemsLoggedCount,
          totalUnitsSold: totalUnits,
          estimatedRevenue: Math.round(estimatedRevenue),
          alertsTriggered,
        },
        ...prev,
      ]);
      setStore((prev) => ({
        ...prev,
        consecutiveLogDays: prev.consecutiveLogDays + 1,
        trialDay: Math.min(14, prev.trialDay + 1),
      }));
      return;
    }

    const batch = writeBatch(db);
    for (const uItem of updatedItemsList) {
      const itemRef = doc(db, 'stores', user.uid, 'items', uItem.id);
      batch.update(itemRef, {
        currentStock: uItem.currentStock,
        dailyVelocity: uItem.dailyVelocity,
        totalSoldTrial: uItem.totalSoldTrial,
        lastLoggedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    const logRef = doc(db, 'stores', user.uid, 'dailyLogs', logId);
    batch.set(logRef, {
      ownerId: user.uid,
      storeId: user.uid,
      dateKey: todayKey,
      itemsLoggedCount,
      totalUnitsSold: totalUnits,
      estimatedRevenue: Math.round(estimatedRevenue),
      alertsTriggered,
      createdAt: serverTimestamp(),
    });

    const storeRef = doc(db, 'stores', user.uid);
    batch.update(storeRef, {
      trialDay: store.trialDay + 1,
      consecutiveLogDays: store.consecutiveLogDays + 1,
      weeklyRestockCycles: store.weeklyRestockCycles,
      updatedAt: serverTimestamp(),
    });

    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `stores/${user.uid}/dailyLogs/${logId}`);
    }
  };

  const handleCreateOrder = async (
    orderPayload: Omit<
      RestockOrder,
      'id' | 'ownerId' | 'storeId' | 'createdAt' | 'updatedAt'
    >
  ) => {
    const orderId = `ord-${Date.now()}`;
    if (!user) {
      setOrders((prev) => [
        {
          id: orderId,
          ownerId: 'demo-store',
          storeId: 'demo-store',
          ...orderPayload,
        },
        ...prev,
      ]);
      return;
    }

    const path = `stores/${user.uid}/orders/${orderId}`;
    try {
      await setDoc(doc(db, 'stores', user.uid, 'orders', orderId), {
        ownerId: user.uid,
        storeId: user.uid,
        ...orderPayload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const handleMarkOrderSent = async (order: RestockOrder) => {
    if (!user) {
      setOrders((prev) =>
        prev.map((o) => (o.id === order.id ? { ...o, status: 'sent' } : o))
      );
      return;
    }

    const path = `stores/${user.uid}/orders/${order.id}`;
    try {
      await updateDoc(doc(db, 'stores', user.uid, 'orders', order.id), {
        status: 'sent',
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const handleMarkOrderDelivered = async (order: RestockOrder) => {
    const replenishMap = new Map<string, number>();
    for (const item of items) {
      if (order.itemIds.includes(item.id)) {
        const analytics = computeSkuAnalytics(item);
        const addQty =
          analytics.suggestedOrderQty > 0
            ? analytics.suggestedOrderQty
            : Math.max(10, Math.ceil(item.dailyVelocity * 7));
        replenishMap.set(item.id, item.currentStock + addQty);
      }
    }

    if (!user) {
      setOrders((prev) =>
        prev.map((o) => (o.id === order.id ? { ...o, status: 'delivered' } : o))
      );
      setItems((prev) =>
        prev.map((item) =>
          replenishMap.has(item.id)
            ? { ...item, currentStock: replenishMap.get(item.id)! }
            : item
        )
      );
      setStore((prev) => ({
        ...prev,
        weeklyRestockCycles: prev.weeklyRestockCycles + 1,
      }));
      return;
    }

    const batch = writeBatch(db);
    const orderRef = doc(db, 'stores', user.uid, 'orders', order.id);
    batch.update(orderRef, {
      status: 'delivered',
      updatedAt: serverTimestamp(),
    });

    for (const [itemId, nextStock] of replenishMap.entries()) {
      batch.update(doc(db, 'stores', user.uid, 'items', itemId), {
        currentStock: nextStock,
        updatedAt: serverTimestamp(),
      });
    }

    batch.update(doc(db, 'stores', user.uid), {
      trialDay: store.trialDay,
      consecutiveLogDays: store.consecutiveLogDays,
      weeklyRestockCycles: store.weeklyRestockCycles + 1,
      updatedAt: serverTimestamp(),
    });

    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `stores/${user.uid}/orders/${order.id}`);
    }
  };

  const handleAddDistributor = async (
    distPayload: Omit<
      Distributor,
      'id' | 'ownerId' | 'storeId' | 'createdAt' | 'updatedAt'
    >
  ) => {
    const distId = `dist-${Date.now()}`;
    if (!user) {
      setDistributors((prev) => [
        ...prev,
        {
          id: distId,
          ownerId: 'demo-store',
          storeId: 'demo-store',
          ...distPayload,
        },
      ]);
      return;
    }

    const path = `stores/${user.uid}/distributors/${distId}`;
    try {
      await setDoc(doc(db, 'stores', user.uid, 'distributors', distId), {
        ownerId: user.uid,
        storeId: user.uid,
        ...distPayload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const handleQuickQueueRestock = async (item: InventoryItem) => {
    const analytics = computeSkuAnalytics(item);
    const qty = analytics.suggestedOrderQty > 0 ? analytics.suggestedOrderQty : 10;
    const cost = Math.round(qty * item.costPrice);
    const summary = `- ${item.name}: ${qty} ${item.unit}`;
    const msg = `Namaste ${item.distributorName},\nUrgent restock order from ${store.storeName} (${store.location}):\n${summary}\nEstimated value: ${formatINR(cost)}.\nPlease confirm delivery. Thank you.`;

    await handleCreateOrder({
      distributorId: item.distributorId,
      distributorName: item.distributorName,
      itemIds: [item.id],
      itemsSummary: summary,
      itemCount: 1,
      totalUnits: qty,
      estimatedCost: cost,
      whatsappMessage: msg,
      status: 'draft',
    });
    setActiveTab('orders');
  };

  const handleUpgradePlan = async () => {
    if (!user) {
      setStore((prev) => ({ ...prev, planStatus: 'active' }));
      return;
    }
    const path = `stores/${user.uid}`;
    try {
      await updateDoc(doc(db, 'stores', user.uid), {
        planStatus: 'active',
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const handleSaveStoreProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const storeName = sanitizeStr(profileForm.storeName, 120);
    const ownerName = sanitizeStr(profileForm.ownerName, 100);
    const location = sanitizeStr(profileForm.location, 120);
    if (storeName.length < 2 || ownerName.length < 1 || location.length < 2) return;

    if (!user) {
      setStore((prev) => ({ ...prev, storeName, ownerName, location }));
      setProfileModalOpen(false);
      return;
    }

    const path = `stores/${user.uid}`;
    try {
      await updateDoc(doc(db, 'stores', user.uid), {
        storeName,
        ownerName,
        location,
        updatedAt: serverTimestamp(),
      });
      setProfileModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const activeNavLabel = NAV_ITEMS.find((n) => n.id === activeTab)?.label || 'Stock Alerts';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col lg:flex-row">
      {/* Desktop Sidebar (260px) */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 bg-white border-r border-slate-200 justify-between">
        <div>
          <div className="h-16 px-5 border-b border-slate-200 flex items-center">
            <span className="text-base font-bold font-display tracking-tight text-slate-900 whitespace-nowrap">
              RetailLink Analytics
            </span>
          </div>

          <nav className="p-3 space-y-1" aria-label="Workspace Navigation">
            {NAV_ITEMS.map((nav) => {
              const Icon = nav.icon;
              const isActive = activeTab === nav.id;
              return (
                <button
                  key={nav.id}
                  type="button"
                  onClick={() => setActiveTab(nav.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-teal-50 text-teal-800'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{nav.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Store Card Footer in Sidebar */}
        <div className="p-4 border-t border-slate-200 space-y-3 text-xs">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 font-semibold text-slate-900 truncate">
                <Store className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                <span className="truncate">{store.storeName}</span>
              </div>
              <p className="text-slate-500 mt-0.5 truncate">{store.location}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setProfileForm({
                  storeName: store.storeName,
                  ownerName: store.ownerName,
                  location: store.location,
                });
                setProfileModalOpen(true);
              }}
              aria-label="Edit store profile"
              className="p-1 text-slate-400 hover:text-slate-700 rounded"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
            <span className="text-slate-500">
              {store.planStatus === 'active'
                ? 'Active Subscription'
                : `Day ${store.trialDay} of 14-Day Trial`}
            </span>
            <span className="font-mono font-medium text-slate-800">₹1,000/mo</span>
          </div>
        </div>
      </aside>

      {/* Mobile Drawer Navigation */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden bg-slate-900/40 flex">
          <div className="w-72 bg-white h-full flex flex-col justify-between p-4">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                <span className="text-base font-bold font-display text-slate-900">
                  RetailLink Analytics
                </span>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Close navigation menu"
                  className="p-1.5 text-slate-500 rounded-md"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <nav className="mt-4 space-y-1">
                {NAV_ITEMS.map((nav) => {
                  const Icon = nav.icon;
                  const isActive = activeTab === nav.id;
                  return (
                    <button
                      key={nav.id}
                      type="button"
                      onClick={() => {
                        setActiveTab(nav.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg ${
                        isActive
                          ? 'bg-teal-50 text-teal-800'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{nav.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
            <div className="pt-4 border-t border-slate-200 text-xs text-slate-600">
              <div className="font-semibold text-slate-900">{store.storeName}</div>
              <div>{store.location}</div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar (Strict 1-row contract) */}
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open menu"
              className="lg:hidden p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="font-semibold font-display text-slate-900 lg:hidden whitespace-nowrap">
                RetailLink Analytics
              </span>
              <span className="text-slate-300 lg:hidden">/</span>
              <h1 className="text-sm font-semibold font-display text-slate-900 truncate">
                {activeNavLabel}
              </h1>
              <span className="hidden sm:inline text-slate-300">·</span>
              <span className="hidden sm:inline text-xs text-slate-500 truncate">
                {store.storeName}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {user ? (
              <div className="flex items-center gap-3">
                <div className="hidden sm:flex items-center gap-2 text-xs">
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName || 'Store Owner'}
                      referrerPolicy="no-referrer"
                      className="w-7 h-7 rounded-full border border-slate-200 object-cover"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-teal-700 text-white flex items-center justify-center font-semibold text-xs">
                      {(user.displayName || user.email || 'U')[0].toUpperCase()}
                    </div>
                  )}
                  <div className="leading-tight">
                    <div className="font-medium text-slate-900 max-w-[140px] truncate">
                      {user.displayName || 'Store Owner'}
                    </div>
                    <div className="text-[11px] text-slate-500 max-w-[140px] truncate">
                      {user.email}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg whitespace-nowrap shrink-0"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign Out
                </button>
              </div>
            ) : (
              <GoogleSignInButton
                onClick={handleGoogleSignIn}
                loading={authLoading}
                label="Sign in with Google"
                variant="primary"
              />
            )}
          </div>
        </header>

        {/* Main Workspace Body */}
        <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto space-y-6">
          {/* Cloud Sync / Google Sign-In Notice when browsing demo */}
          {authReady && !user && (
            <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <h2 className="text-sm font-semibold font-display text-slate-900">
                  Interactive Demo Mode — Gopal General Store & Daily Needs (Sudhowala Chowk)
                </h2>
                <p className="text-xs text-slate-600">
                  Sign in with your Google account to save your store’s Top 50 fast-moving SKUs, daily closing logs, and automated WhatsApp distributor orders in the cloud.
                </p>
                {authError && (
                  <p className="text-xs text-red-700 font-medium pt-1">{authError}</p>
                )}
              </div>
              <GoogleSignInButton
                onClick={handleGoogleSignIn}
                loading={authLoading}
                label="Sign in with Google"
                variant="outline"
              />
            </section>
          )}

          {activeTab === 'alerts' && (
            <StockAlertDashboard
              store={store}
              items={items}
              distributors={distributors}
              loading={dataLoading}
              onAddItem={handleAddItem}
              onUpdateItem={handleUpdateItem}
              onDeleteItem={handleDeleteItem}
              onQuickQueueRestock={handleQuickQueueRestock}
              onOpenDailyLog={() => setActiveTab('daily-log')}
            />
          )}

          {activeTab === 'daily-log' && (
            <DailyClosingLogView
              store={store}
              items={items}
              logs={logs}
              onSubmitClosingLog={handleSubmitClosingLog}
            />
          )}

          {activeTab === 'orders' && (
            <DistributorOrdersView
              store={store}
              items={items}
              distributors={distributors}
              orders={orders}
              onCreateOrder={handleCreateOrder}
              onMarkOrderSent={handleMarkOrderSent}
              onMarkOrderDelivered={handleMarkOrderDelivered}
              onAddDistributor={handleAddDistributor}
            />
          )}

          {activeTab === 'venture' && (
            <VenturePlanView
              store={store}
              orders={orders}
              onUpgradePlan={handleUpgradePlan}
            />
          )}
        </main>
      </div>

      {/* Store Profile Modal */}
      {profileModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md overflow-hidden shadow-lg">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-semibold font-display text-slate-900">
                Store Profile Settings
              </h3>
              <button
                type="button"
                onClick={() => setProfileModalOpen(false)}
                aria-label="Close modal"
                className="p-1 text-slate-400 hover:text-slate-700 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveStoreProfile} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Store Name
                </label>
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={120}
                  value={profileForm.storeName}
                  onChange={(e) =>
                    setProfileForm({ ...profileForm, storeName: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Owner / Operator Name
                </label>
                <input
                  type="text"
                  required
                  minLength={1}
                  maxLength={100}
                  value={profileForm.ownerName}
                  onChange={(e) =>
                    setProfileForm({ ...profileForm, ownerName: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Store Locality
                </label>
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={120}
                  value={profileForm.location}
                  onChange={(e) =>
                    setProfileForm({ ...profileForm, location: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
                />
              </div>
              <div className="pt-2 flex justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setProfileModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
                >
                  Save Profile
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}
