export type SkuCategory =
  | 'Dairy & Bread'
  | 'Snacks & Biscuits'
  | 'Staples & Oils'
  | 'Beverages'
  | 'Personal & Home';

export const SKU_CATEGORIES: SkuCategory[] = [
  'Dairy & Bread',
  'Snacks & Biscuits',
  'Staples & Oils',
  'Beverages',
  'Personal & Home',
];

export type StockStatus = 'critical' | 'reorder' | 'optimal' | 'overstocked';

export interface StoreProfile {
  ownerId: string;
  storeName: string;
  ownerName: string;
  location: string;
  planStatus: 'trial' | 'active';
  trialDay: number;
  consecutiveLogDays: number;
  weeklyRestockCycles: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface InventoryItem {
  id: string;
  ownerId: string;
  storeId: string;
  name: string;
  category: SkuCategory;
  unit: string;
  currentStock: number;
  dailyVelocity: number;
  leadTimeDays: number;
  safetyBufferDays: number;
  costPrice: number;
  sellingPrice: number;
  distributorId: string;
  distributorName: string;
  totalSoldTrial: number;
  lastLoggedAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface DailyLog {
  id: string;
  ownerId: string;
  storeId: string;
  dateKey: string;
  itemsLoggedCount: number;
  totalUnitsSold: number;
  estimatedRevenue: number;
  alertsTriggered: number;
  createdAt?: unknown;
}

export interface Distributor {
  id: string;
  ownerId: string;
  storeId: string;
  name: string;
  whatsappNumber: string;
  area: string;
  categories: string;
  avgLeadTimeDays: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface RestockOrder {
  id: string;
  ownerId: string;
  storeId: string;
  distributorId: string;
  distributorName: string;
  itemIds: string[];
  itemsSummary: string;
  itemCount: number;
  totalUnits: number;
  estimatedCost: number;
  whatsappMessage: string;
  status: 'draft' | 'sent' | 'delivered';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SkuAnalytics {
  reorderPoint: number;
  daysRemaining: number;
  targetStock: number;
  suggestedOrderQty: number;
  status: StockStatus;
  atRiskDailyRevenue: number;
  trappedCapital: number;
  stockValueCost: number;
}

export function computeSkuAnalytics(item: InventoryItem): SkuAnalytics {
  const velocity = Math.max(0, item.dailyVelocity);
  const leadTime = Math.max(0.5, item.leadTimeDays);
  const buffer = Math.max(0, item.safetyBufferDays);

  const reorderPoint = Math.ceil(velocity * (leadTime + buffer));
  const daysRemaining = velocity > 0 ? item.currentStock / velocity : 99;
  const targetStock = Math.ceil(velocity * (leadTime + buffer + 7));
  const suggestedOrderQty = Math.max(0, targetStock - item.currentStock);

  let status: StockStatus = 'optimal';
  if (item.currentStock <= 0 || (velocity > 0 && daysRemaining <= leadTime)) {
    status = 'critical';
  } else if (item.currentStock <= reorderPoint) {
    status = 'reorder';
  } else if (velocity > 0 && daysRemaining > 21) {
    status = 'overstocked';
  }

  const atRiskDailyRevenue =
    status === 'critical'
      ? velocity * item.sellingPrice
      : status === 'reorder'
        ? velocity * item.sellingPrice * 0.5
        : 0;

  const excessUnits = Math.max(0, item.currentStock - targetStock);
  const trappedCapital = status === 'overstocked' ? excessUnits * item.costPrice : 0;

  return {
    reorderPoint,
    daysRemaining,
    targetStock,
    suggestedOrderQty,
    status,
    atRiskDailyRevenue,
    trappedCapital,
    stockValueCost: item.currentStock * item.costPrice,
  };
}

export function formatINR(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

export function sanitizeStr(value: string, maxLen: number): string {
  return value.trim().slice(0, maxLen);
}

export function clampNum(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function isValidFirebaseId(id: string): boolean {
  return /^[a-zA-Z0-9_\-]{1,128}$/.test(id);
}
