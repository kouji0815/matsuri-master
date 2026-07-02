export type AppMode = "today" | "menu" | "cost" | "review" | "data" | "settings";

export type SessionStatus = "planned" | "open" | "closed";

export type CostType = "fixed" | "purchase" | "supply" | "transport" | "other";

export type StockReason = "loss" | "gift" | "countFix" | "other";

export type PaymentMethod = "cash" | "paypay" | "creditCard" | "other";

export type SyncStatus = "pending" | "synced" | "failed";

export type SyncableFields = {
  workspaceId: string;
  deviceId: string;
  syncStatus: SyncStatus;
  updatedAt: string;
  cloudSyncedAt?: string;
  deletedAt?: string | null;
};

export type ProductCategory = SyncableFields & {
  id: string;
  name: string;
  enabled: boolean;
  sortOrder: number;
  showInHighTraffic: boolean;
  createdAt: string;
};

export type CostCategory = SyncableFields & {
  id: string;
  name: string;
  enabled: boolean;
  sortOrder: number;
  createdAt: string;
};

export type Product = SyncableFields & {
  id: string;
  name: string;
  icon: string;
  category: string;
  price: number;
  unitCost: number;
  initialStock: number;
  currentStock: number;
  warningStock: number;
  enabled: boolean;
  sortOrder?: number;
  createdAt: string;
};

export type BundleRule = SyncableFields & {
  id: string;
  name: string;
  price: number;
  itemCount: number;
  allowChoice: boolean;
  includesDrink: boolean;
  allowedCategoryIds: string[];
  discountAmount: number;
  enabled: boolean;
  createdAt: string;
};

export type Session = SyncableFields & {
  id: string;
  name: string;
  date: string;
  location: string;
  startedAt?: string;
  endedAt?: string;
  targetSales: number;
  status: SessionStatus;
  createdAt: string;
};

export type SaleItem = {
  productId: string;
  productName: string;
  category: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  subtotal: number;
  subtotalCost: number;
  subtotalProfit: number;
};

export type SaleRecord = SyncableFields & {
  id: string;
  orderId: string;
  sessionId: string;
  createdAt: string;
  items: SaleItem[];
  bundleId?: string;
  bundleName?: string;
  paymentMethod: PaymentMethod;
  discountAmount: number;
  discountReason: string;
  receivedAmount: number;
  changeAmount: number;
  finalTotal: number;
  totalRevenue: number;
  totalCost: number;
  grossProfit: number;
};

export type CartItem = {
  id: string;
  name: string;
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  totalCost: number;
  items: SaleItem[];
  bundleId?: string;
  bundleName?: string;
};

export type CheckoutInput = {
  paymentMethod: PaymentMethod;
  discountAmount: number;
  discountReason: string;
  receivedAmount: number;
};

export type CurrentCheckoutDisplay = {
  status: "editing" | "confirming" | "completed";
  updatedAt: string;
  items: {
    name: string;
    description: string;
    quantity: number;
    totalPrice: number;
  }[];
  subtotal: number;
  discountAmount: number;
  finalTotal: number;
  receivedAmount: number;
  changeAmount: number;
  paymentMethod: PaymentMethod;
  message?: string;
};

export type CostUnitPriceMode = "gram" | "kilogram" | "piece";

export type CostRecord = SyncableFields & {
  id: string;
  sessionId?: string;
  name: string;
  amount: number;
  type: CostType;
  costCategoryId: string;
  note: string;
  date: string;
  createdAt: string;
  unitPriceMode?: CostUnitPriceMode;
  unitPriceBaseGrams?: number;
};

export type StockAdjustment = SyncableFields & {
  id: string;
  productId: string;
  productName: string;
  delta: number;
  reason: StockReason;
  note: string;
  createdAt: string;
};

export type AppSettings = SyncableFields & {
  id: "main";
  createdAt: string;
  highTrafficMode: boolean;
  soundEnabled: boolean;
  defaultTargetSales: number;
  latestBackupAt?: string;
  workspaceId: string;
  deviceId: string;
  cloudSyncEnabled: boolean;
  lastSyncAt?: string;
  supabaseUrl?: string;
  currentCheckoutDisplay?: CurrentCheckoutDisplay;
  meatUnitPriceBaseGrams: number;
};

export type SessionSummary = {
  revenue: number;
  quantity: number;
  variableCost: number;
  fixedCost: number;
  grossProfit: number;
  netProfit: number;
  profitRate: number;
  costRate: number;
};

export type SyncOverview = {
  connected: boolean;
  online: boolean;
  status: "idle" | "syncing" | "offline" | "error";
  pendingCount: number;
  failedCount: number;
  lastSyncedAt?: string;
  lastError?: string;
  workspaceId: string;
  deviceId: string;
};

export type BackupPayload = {
  version: 2;
  exportedAt: string;
  categories: ProductCategory[];
  costCategories: CostCategory[];
  products: Product[];
  bundles: BundleRule[];
  sessions: Session[];
  sales: SaleRecord[];
  costs: CostRecord[];
  stockAdjustments: StockAdjustment[];
  settings: AppSettings[];
};

export type AutoBackupRecord = {
  id: string;
  createdAt: string;
  reason: string;
  payload: BackupPayload;
};
