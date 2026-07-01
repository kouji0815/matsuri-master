export type AppMode = "today" | "menu" | "cost" | "review" | "data" | "settings";

export type SessionStatus = "planned" | "open" | "closed";

export type CostType = "fixed" | "purchase" | "supply" | "transport" | "other";

export type StockReason = "loss" | "gift" | "countFix" | "other";

export type PaymentMethod = "cash" | "paypay" | "creditCard" | "other";

export type ProductCategory = {
  id: string;
  name: string;
  enabled: boolean;
  sortOrder: number;
  showInHighTraffic: boolean;
  updatedAt: string;
};

export type Product = {
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
  updatedAt: string;
};

export type BundleRule = {
  id: string;
  name: string;
  price: number;
  itemCount: number;
  allowChoice: boolean;
  includesDrink: boolean;
  allowedCategoryIds: string[];
  discountAmount: number;
  enabled: boolean;
  updatedAt: string;
};

export type Session = {
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

export type SaleRecord = {
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

export type CostRecord = {
  id: string;
  sessionId?: string;
  name: string;
  amount: number;
  type: CostType;
  note: string;
  date: string;
  createdAt: string;
};

export type StockAdjustment = {
  id: string;
  productId: string;
  productName: string;
  delta: number;
  reason: StockReason;
  note: string;
  createdAt: string;
};

export type AppSettings = {
  id: "main";
  highTrafficMode: boolean;
  soundEnabled: boolean;
  defaultTargetSales: number;
  latestBackupAt?: string;
};

export type SessionSummary = {
  revenue: number;
  quantity: number;
  variableCost: number;
  fixedCost: number;
  grossProfit: number;
  netProfit: number;
  profitRate: number;
};

export type BackupPayload = {
  version: 1;
  exportedAt: string;
  categories: ProductCategory[];
  products: Product[];
  bundles: BundleRule[];
  sessions: Session[];
  sales: SaleRecord[];
  costs: CostRecord[];
  stockAdjustments: StockAdjustment[];
  settings: AppSettings[];
};
