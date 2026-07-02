import { create } from "zustand";
import { db, ensureSeedData } from "@/lib/db";
import { saveCustomerDisplay } from "@/lib/customerDisplay";
import { getOrCreateDeviceId, getOrCreateWorkspaceId, setWorkspaceId as persistWorkspaceId } from "@/lib/localIdentity";
import { getSyncStatus, pullRemoteChanges, pushLocalChanges, syncAll } from "@/lib/syncService";
import { getSupabasePublicEnvStatus, isSupabaseConfigured } from "@/lib/supabaseClient";
import type {
  AppMode,
  AppSettings,
  BundleRule,
  CartItem,
  CheckoutInput,
  CostCategory,
  CostRecord,
  CurrentCheckoutDisplay,
  Product,
  ProductCategory,
  SaleItem,
  SaleRecord,
  Session,
  StockAdjustment,
  StockReason,
  SyncOverview
} from "@/types";

type AppState = {
  mode: AppMode;
  loading: boolean;
  products: Product[];
  categories: ProductCategory[];
  costCategories: CostCategory[];
  bundles: BundleRule[];
  sessions: Session[];
  activeSession?: Session;
  selectedSession?: Session;
  sales: SaleRecord[];
  costs: CostRecord[];
  adjustments: StockAdjustment[];
  settings: AppSettings;
  cartItems: CartItem[];
  checkoutDisplay: CurrentCheckoutDisplay;
  syncOverview: SyncOverview;
  setMode: (mode: AppMode) => void;
  hydrate: () => Promise<void>;
  refresh: () => Promise<void>;
  refreshSyncOverview: () => Promise<void>;
  runSyncAll: () => Promise<{ ok: boolean; message?: string }>;
  runPushSync: () => Promise<{ ok: boolean; message?: string }>;
  runPullSync: () => Promise<{ ok: boolean; message?: string }>;
  disconnectCloudSync: () => Promise<void>;
  saveProduct: (product: Product) => Promise<void>;
  deleteProduct: (productId: string) => Promise<void>;
  reorderProducts: (categoryId: string, orderedProductIds: string[]) => Promise<void>;
  bulkMoveProductsCategory: (productIds: string[], categoryId: string) => Promise<void>;
  saveCategory: (category: ProductCategory) => Promise<void>;
  deleteCategory: (categoryId: string) => Promise<void>;
  moveCategory: (categoryId: string, direction: "up" | "down") => Promise<void>;
  saveCostCategory: (category: CostCategory) => Promise<void>;
  deleteCostCategory: (categoryId: string) => Promise<void>;
  saveBundle: (bundle: BundleRule) => Promise<void>;
  deleteBundle: (bundleId: string) => Promise<void>;
  addProductToCart: (productId: string) => { ok: boolean; message?: string };
  addBundleToCart: (bundle: BundleRule, productIds: string[], drinkId?: string) => { ok: boolean; message?: string };
  removeCartItem: (cartItemId: string) => void;
  clearCart: () => void;
  checkoutCart: (input: CheckoutInput) => Promise<{ ok: boolean; message?: string }>;
  undoLastSale: () => Promise<void>;
  adjustStock: (productId: string, delta: number, reason: StockReason, note: string) => Promise<void>;
  saveCost: (cost: CostRecord) => Promise<void>;
  deleteCost: (costId: string) => Promise<void>;
  saveSession: (session: Session) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  selectSession: (sessionId: string) => Promise<void>;
  startSession: (sessionId: string) => Promise<{ ok: boolean; message?: string }>;
  closeActiveSession: () => Promise<void>;
  updateSettings: (settings: AppSettings) => Promise<void>;
  resetAllData: () => Promise<void>;
};

const now = () => new Date().toISOString();

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return fallback;
}

const baseSettings: AppSettings = {
  id: "main",
  highTrafficMode: false,
  soundEnabled: true,
  defaultTargetSales: 100000,
  workspaceId: getOrCreateWorkspaceId(),
  deviceId: getOrCreateDeviceId(),
  cloudSyncEnabled: true,
  createdAt: now(),
  updatedAt: now(),
  syncStatus: "pending",
  deletedAt: null
};

const emptyDisplay: CurrentCheckoutDisplay = {
  status: "editing",
  updatedAt: now(),
  items: [],
  subtotal: 0,
  discountAmount: 0,
  finalTotal: 0,
  receivedAmount: 0,
  changeAmount: 0,
  paymentMethod: "cash"
};

const emptySyncOverview: SyncOverview = {
  connected: false,
  online: true,
  status: "idle",
  pendingCount: 0,
  failedCount: 0,
  workspaceId: baseSettings.workspaceId,
  deviceId: baseSettings.deviceId
};

function getSupabaseConfigMessage() {
  const status = getSupabasePublicEnvStatus();
  if (status.configured) return null;
  return `Supabaseが設定されていません。${status.missingKeys.join(" / ")} を確認してください。`;
}

const newestOpenSession = (sessions: Session[]) =>
  sessions
    .filter((session) => !session.deletedAt && session.status === "open")
    .sort((a, b) => (b.startedAt ?? b.createdAt).localeCompare(a.startedAt ?? a.createdAt))[0];

const newestSession = (sessions: Session[]) =>
  [...sessions].filter((session) => !session.deletedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

async function readSessionData(sessionId?: string) {
  if (!sessionId) return { sales: [], costs: [] };
  const [sales, costs] = await Promise.all([
    db.sales.where("sessionId").equals(sessionId).reverse().sortBy("createdAt"),
    db.costs.where("sessionId").equals(sessionId).sortBy("date")
  ]);
  return {
    sales: sales.reverse().filter((sale) => !sale.deletedAt),
    costs: costs.filter((cost) => !cost.deletedAt)
  };
}

function buildSaleItem(product: Product, quantity: number, unitPrice: number): SaleItem {
  const subtotal = unitPrice * quantity;
  const subtotalCost = product.unitCost * quantity;
  return {
    productId: product.id,
    productName: product.name,
    category: product.category,
    quantity,
    unitPrice,
    unitCost: product.unitCost,
    subtotal,
    subtotalCost,
    subtotalProfit: subtotal - subtotalCost
  };
}

function groupProducts(products: Product[], ids: string[], totalRevenue: number): SaleItem[] {
  const counts = ids.reduce<Record<string, number>>((acc, id) => {
    acc[id] = (acc[id] ?? 0) + 1;
    return acc;
  }, {});
  const quantity = ids.length || 1;
  const unitPrice = Math.round((totalRevenue / quantity) * 10) / 10;

  return Object.entries(counts)
    .map(([id, count]) => {
      const product = products.find((item) => item.id === id);
      return product ? buildSaleItem(product, count, unitPrice) : undefined;
    })
    .filter((item): item is SaleItem => Boolean(item));
}

function cartSubtotal(cartItems: CartItem[]) {
  return cartItems.reduce((sum, item) => sum + item.totalPrice, 0);
}

function cartProductCounts(cartItems: CartItem[]) {
  const counts: Record<string, number> = {};
  for (const cartItem of cartItems) {
    for (const item of cartItem.items) {
      counts[item.productId] = (counts[item.productId] ?? 0) + item.quantity;
    }
  }
  return counts;
}

function buildDisplay(
  cartItems: CartItem[],
  input?: Partial<CheckoutInput>,
  status: CurrentCheckoutDisplay["status"] = "editing"
): CurrentCheckoutDisplay {
  const subtotal = cartSubtotal(cartItems);
  const discountAmount = Math.max(0, input?.discountAmount ?? 0);
  const finalTotal = Math.max(0, subtotal - discountAmount);
  const receivedAmount = Math.max(0, input?.receivedAmount ?? 0);
  const paymentMethod = input?.paymentMethod ?? "cash";
  const changeAmount = paymentMethod === "cash" ? Math.max(0, receivedAmount - finalTotal) : 0;

  return {
    status,
    updatedAt: now(),
    items: cartItems.map((item) => ({
      name: item.name,
      description: item.description,
      quantity: item.quantity,
      totalPrice: item.totalPrice
    })),
    subtotal,
    discountAmount,
    finalTotal,
    receivedAmount,
    changeAmount,
    paymentMethod,
    message: status === "completed" ? "ありがとうございました" : undefined
  };
}

function publishDisplay(display: CurrentCheckoutDisplay) {
  saveCustomerDisplay(display);
}

function withSync<T extends { id: string; createdAt?: string; workspaceId?: string; deviceId?: string; deletedAt?: string | null }>(
  value: T,
  settings: AppSettings
): T & {
  createdAt: string;
  workspaceId: string;
  deviceId: string;
  updatedAt: string;
  syncStatus: "pending";
  deletedAt: string | null;
} {
  return {
    ...value,
    createdAt: value.createdAt ?? now(),
    workspaceId: settings.workspaceId,
    deviceId: settings.deviceId,
    updatedAt: now(),
    syncStatus: "pending",
    deletedAt: value.deletedAt ?? null
  } as T & {
    createdAt: string;
    workspaceId: string;
    deviceId: string;
    updatedAt: string;
    syncStatus: "pending";
    deletedAt: string | null;
  };
}

async function softDelete(table: any, id: string) {
  await table.update(id, { deletedAt: now(), updatedAt: now(), syncStatus: "pending" });
}

export const useAppStore = create<AppState>((set, get) => ({
  mode: "today",
  loading: true,
  products: [],
  categories: [],
  costCategories: [],
  bundles: [],
  sessions: [],
  sales: [],
  costs: [],
  adjustments: [],
  settings: baseSettings,
  cartItems: [],
  checkoutDisplay: emptyDisplay,
  syncOverview: emptySyncOverview,

  setMode: (mode) => set({ mode }),

  hydrate: async () => {
    await ensureSeedData();
    await get().refresh();
    publishDisplay(get().checkoutDisplay);
    await get().refreshSyncOverview();
    set({ loading: false });
  },

  refresh: async () => {
    const [products, categories, costCategories, bundles, sessions, settings, adjustments] = await Promise.all([
      db.products.toArray(),
      db.categories.toArray(),
      db.costCategories.toArray(),
      db.bundles.toArray(),
      db.sessions.toArray(),
      db.settings.get("main"),
      db.stockAdjustments.reverse().sortBy("createdAt")
    ]);
    const aliveSessions = sessions.filter((session) => !session.deletedAt);
    const sortedSessions = aliveSessions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const activeSession = newestOpenSession(sortedSessions);
    const selectedSession = get().selectedSession
      ? sortedSessions.find((session) => session.id === get().selectedSession?.id)
      : activeSession ?? newestSession(sortedSessions);
    const { sales, costs } = await readSessionData(selectedSession?.id);

    set({
      products: products
        .filter((item) => !item.deletedAt)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name, "ja")),
      categories: categories
        .filter((item) => !item.deletedAt)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "ja")),
      costCategories: costCategories
        .filter((item) => !item.deletedAt)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "ja")),
      bundles: bundles.filter((item) => !item.deletedAt).sort((a, b) => a.name.localeCompare(b.name, "ja")),
      sessions: sortedSessions,
      activeSession,
      selectedSession,
      sales,
      costs,
      adjustments: adjustments.filter((item) => !item.deletedAt),
      settings: settings ?? baseSettings
    });
  },

  refreshSyncOverview: async () => {
    const settings = get().settings;
    const overview = await getSyncStatus(settings.workspaceId, settings);
    set({ syncOverview: overview });
  },

  runSyncAll: async () => {
    const settings = get().settings;
    if (!isSupabaseConfigured()) {
      await get().refreshSyncOverview();
      return { ok: false, message: getSupabaseConfigMessage() ?? "Supabaseが設定されていません。環境変数を確認してください。" };
    }
    if (!settings.cloudSyncEnabled) {
      await get().refreshSyncOverview();
      return { ok: false, message: "クラウド同期が無効になっています。設定画面で有効にしてください。" };
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      set((state) => ({ syncOverview: { ...state.syncOverview, status: "offline" } }));
      return { ok: false, message: "オフラインのため同期できませんでした。" };
    }
    set((state) => ({ syncOverview: { ...state.syncOverview, status: "syncing" } }));
    try {
      await syncAll(settings.workspaceId);
      await get().refresh();
      await get().refreshSyncOverview();
      return { ok: true, message: "同期が完了しました。" };
    } catch (error) {
      const message = getErrorMessage(error, "同期に失敗しました。");
      set((state) => ({
        syncOverview: { ...state.syncOverview, status: "error", lastError: message }
      }));
      return { ok: false, message };
    }
  },

  runPushSync: async () => {
    const settings = get().settings;
    if (!isSupabaseConfigured()) {
      await get().refreshSyncOverview();
      return { ok: false, message: getSupabaseConfigMessage() ?? "Supabaseが設定されていません。環境変数を確認してください。" };
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      set((state) => ({ syncOverview: { ...state.syncOverview, status: "offline" } }));
      return { ok: false, message: "オフラインのためアップロードできませんでした。" };
    }
    set((state) => ({ syncOverview: { ...state.syncOverview, status: "syncing" } }));
    try {
      await pushLocalChanges(settings.workspaceId);
      await db.settings.update("main", { lastSyncAt: now(), updatedAt: now(), syncStatus: "synced", cloudSyncedAt: now() });
      await get().refresh();
      await get().refreshSyncOverview();
      return { ok: true, message: "ローカルをアップロードしました。" };
    } catch (error) {
      const message = getErrorMessage(error, "アップロードに失敗しました。");
      set((state) => ({
        syncOverview: { ...state.syncOverview, status: "error", lastError: message }
      }));
      return { ok: false, message };
    }
  },

  runPullSync: async () => {
    const settings = get().settings;
    if (!isSupabaseConfigured()) {
      await get().refreshSyncOverview();
      return { ok: false, message: getSupabaseConfigMessage() ?? "Supabaseが設定されていません。環境変数を確認してください。" };
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      set((state) => ({ syncOverview: { ...state.syncOverview, status: "offline" } }));
      return { ok: false, message: "オフラインのため取得できませんでした。" };
    }
    set((state) => ({ syncOverview: { ...state.syncOverview, status: "syncing" } }));
    try {
      await pullRemoteChanges(settings.workspaceId);
      await db.settings.update("main", { lastSyncAt: now(), updatedAt: now(), syncStatus: "synced", cloudSyncedAt: now() });
      await get().refresh();
      await get().refreshSyncOverview();
      return { ok: true, message: "クラウドから取得しました。" };
    } catch (error) {
      const message = getErrorMessage(error, "クラウド取得に失敗しました。");
      set((state) => ({
        syncOverview: { ...state.syncOverview, status: "error", lastError: message }
      }));
      return { ok: false, message };
    }
  },

  disconnectCloudSync: async () => {
    const next = withSync({ ...get().settings, cloudSyncEnabled: false }, get().settings);
    await db.settings.put(next);
    await get().refresh();
    await get().refreshSyncOverview();
  },

  saveProduct: async (product) => {
    await db.products.put(withSync(product, get().settings));
    await get().refresh();
    await get().refreshSyncOverview();
  },

  deleteProduct: async (productId) => {
    await softDelete(db.products, productId);
    await get().refresh();
    await get().refreshSyncOverview();
  },

  reorderProducts: async (categoryId, orderedProductIds) => {
    await db.transaction("rw", db.products, async () => {
      await Promise.all(
        orderedProductIds.map((productId, index) =>
          db.products.update(productId, { sortOrder: (index + 1) * 10, updatedAt: now(), syncStatus: "pending" })
        )
      );
    });
    await get().refresh();
    await get().refreshSyncOverview();
  },

  bulkMoveProductsCategory: async (productIds, categoryId) => {
    await db.transaction("rw", db.products, async () => {
      await Promise.all(
        productIds.map((productId) => db.products.update(productId, { category: categoryId, updatedAt: now(), syncStatus: "pending" }))
      );
    });
    await get().refresh();
    await get().refreshSyncOverview();
  },

  saveCategory: async (category) => {
    await db.categories.put(withSync(category, get().settings));
    await get().refresh();
    await get().refreshSyncOverview();
  },

  deleteCategory: async (categoryId) => {
    const fallback = get().categories.find((category) => category.id === "cat-other") ?? get().categories.find((category) => category.id !== categoryId);
    await db.transaction("rw", [db.categories, db.products], async () => {
      if (fallback) {
        const products = await db.products.where("category").equals(categoryId).toArray();
        await Promise.all(
          products.map((product) => db.products.update(product.id, { category: fallback.id, updatedAt: now(), syncStatus: "pending" }))
        );
      }
      await softDelete(db.categories, categoryId);
    });
    await get().refresh();
    await get().refreshSyncOverview();
  },

  moveCategory: async (categoryId, direction) => {
    const categories = [...get().categories].sort((a, b) => a.sortOrder - b.sortOrder);
    const index = categories.findIndex((category) => category.id === categoryId);
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || swapIndex < 0 || swapIndex >= categories.length) return;
    const current = categories[index];
    const target = categories[swapIndex];
    await db.transaction("rw", db.categories, async () => {
      await db.categories.update(current.id, { sortOrder: target.sortOrder, updatedAt: now(), syncStatus: "pending" });
      await db.categories.update(target.id, { sortOrder: current.sortOrder, updatedAt: now(), syncStatus: "pending" });
    });
    await get().refresh();
    await get().refreshSyncOverview();
  },

  saveCostCategory: async (category) => {
    await db.costCategories.put(withSync(category, get().settings));
    await get().refresh();
    await get().refreshSyncOverview();
  },

  deleteCostCategory: async (categoryId) => {
    const fallback = get().costCategories.find((category) => category.id === "cost-other") ?? get().costCategories.find((category) => category.id !== categoryId);
    await db.transaction("rw", [db.costCategories, db.costs], async () => {
      if (fallback) {
        const costs = await db.costs.where("costCategoryId").equals(categoryId).toArray();
        await Promise.all(
          costs.map((cost) => db.costs.update(cost.id, { costCategoryId: fallback.id, updatedAt: now(), syncStatus: "pending" }))
        );
      }
      await softDelete(db.costCategories, categoryId);
    });
    await get().refresh();
    await get().refreshSyncOverview();
  },

  saveBundle: async (bundle) => {
    await db.bundles.put(withSync(bundle, get().settings));
    await get().refresh();
    await get().refreshSyncOverview();
  },

  deleteBundle: async (bundleId) => {
    await softDelete(db.bundles, bundleId);
    await get().refresh();
    await get().refreshSyncOverview();
  },

  addProductToCart: (productId) => {
    const { products, cartItems } = get();
    const product = products.find((item) => item.id === productId);
    if (!product || !product.enabled) return { ok: false, message: "販売できない商品です。" };
    const reserved = cartProductCounts(cartItems)[productId] ?? 0;
    if (product.currentStock <= reserved) return { ok: false, message: "在庫が足りません。" };

    const existing = cartItems.find((item) => item.id === `product-${productId}`);
    const nextCart = existing
      ? cartItems.map((item) =>
          item.id === existing.id
            ? {
                ...item,
                quantity: item.quantity + 1,
                totalPrice: item.totalPrice + product.price,
                totalCost: item.totalCost + product.unitCost,
                items: [buildSaleItem(product, item.quantity + 1, product.price)]
              }
            : item
        )
      : [
          ...cartItems,
          {
            id: `product-${productId}`,
            name: product.name,
            description: product.name,
            quantity: 1,
            unitPrice: product.price,
            totalPrice: product.price,
            totalCost: product.unitCost,
            items: [buildSaleItem(product, 1, product.price)]
          }
        ];
    const display = buildDisplay(nextCart);
    set({ cartItems: nextCart, checkoutDisplay: display });
    publishDisplay(display);
    return { ok: true };
  },

  addBundleToCart: (bundle, productIds, drinkId) => {
    const { products, cartItems } = get();
    const allIds = drinkId ? [...productIds, drinkId] : [...productIds];
    if (productIds.length !== bundle.itemCount) return { ok: false, message: "必要な本数を選択してください。" };
    if (bundle.includesDrink && !drinkId) return { ok: false, message: "ドリンクを選択してください。" };

    const currentCounts = cartProductCounts(cartItems);
    const addingCounts = allIds.reduce<Record<string, number>>((acc, id) => {
      acc[id] = (acc[id] ?? 0) + 1;
      return acc;
    }, {});

    for (const [id, count] of Object.entries(addingCounts)) {
      const product = products.find((item) => item.id === id);
      if (!product || !product.enabled) return { ok: false, message: "販売できない商品が含まれています。" };
      if (product.currentStock < (currentCounts[id] ?? 0) + count) return { ok: false, message: `${product.name} の在庫が足りません。` };
    }

    const items = groupProducts(products, allIds, bundle.price);
    const detail = items.map((item) => `${item.productName}×${item.quantity}`).join(" / ");
    const nextCart = [
      ...cartItems,
      {
        id: `bundle-${bundle.id}-${crypto.randomUUID()}`,
        name: bundle.name,
        description: `${bundle.name}: ${detail}`,
        quantity: 1,
        unitPrice: bundle.price,
        totalPrice: bundle.price,
        totalCost: items.reduce((sum, item) => sum + item.subtotalCost, 0),
        items,
        bundleId: bundle.id,
        bundleName: bundle.name
      }
    ];
    const display = buildDisplay(nextCart);
    set({ cartItems: nextCart, checkoutDisplay: display });
    publishDisplay(display);
    return { ok: true };
  },

  removeCartItem: (cartItemId) => {
    const nextCart = get().cartItems.filter((item) => item.id !== cartItemId);
    const display = buildDisplay(nextCart);
    set({ cartItems: nextCart, checkoutDisplay: display });
    publishDisplay(display);
  },

  clearCart: () => {
    const display = buildDisplay([]);
    set({ cartItems: [], checkoutDisplay: display });
    publishDisplay(display);
  },

  checkoutCart: async (input) => {
    const { activeSession, cartItems, products, settings } = get();
    if (!activeSession) return { ok: false, message: "営業中の場次がありません。" };
    if (cartItems.length === 0) return { ok: false, message: "会計する商品がありません。" };

    const counts = cartProductCounts(cartItems);
    for (const [id, count] of Object.entries(counts)) {
      const product = products.find((item) => item.id === id);
      if (!product || product.currentStock < count) return { ok: false, message: `${product?.name ?? "商品"} の在庫が足りません。` };
    }

    const subtotal = cartSubtotal(cartItems);
    const discountAmount = Math.max(0, Math.min(input.discountAmount, subtotal));
    const finalTotal = Math.max(0, subtotal - discountAmount);
    const receivedAmount = Math.max(0, input.receivedAmount);
    const changeAmount = input.paymentMethod === "cash" ? Math.max(0, receivedAmount - finalTotal) : 0;
    const totalCost = cartItems.reduce((sum, item) => sum + item.totalCost, 0);
    const createdAt = now();
    const orderId = `ORD-${new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14)}`;

    const sale: SaleRecord = withSync(
      {
        id: `sale-${crypto.randomUUID()}`,
        orderId,
        sessionId: activeSession.id,
        createdAt,
        items: cartItems.flatMap((item) => item.items),
        bundleId: cartItems.find((item) => item.bundleId)?.bundleId,
        bundleName: cartItems.find((item) => item.bundleName)?.bundleName,
        paymentMethod: input.paymentMethod,
        discountAmount,
        discountReason: input.discountReason,
        receivedAmount,
        changeAmount,
        finalTotal,
        totalRevenue: finalTotal,
        totalCost,
        grossProfit: finalTotal - totalCost
      },
      settings
    );

    await db.transaction("rw", db.products, db.sales, async () => {
      await Promise.all(
        Object.entries(counts).map(async ([id, count]) => {
          const product = products.find((item) => item.id === id);
          if (product) {
            await db.products.update(id, {
              currentStock: product.currentStock - count,
              updatedAt: now(),
              syncStatus: "pending"
            });
          }
        })
      );
      await db.sales.put(sale);
    });

    const completedDisplay = buildDisplay(cartItems, { ...input, discountAmount, receivedAmount }, "completed");
    await db.settings.update("main", { currentCheckoutDisplay: completedDisplay, updatedAt: now(), syncStatus: "pending" });
    set({ cartItems: [], checkoutDisplay: completedDisplay });
    publishDisplay(completedDisplay);
    await get().refresh();
    await get().refreshSyncOverview();
    return { ok: true };
  },

  undoLastSale: async () => {
    const latest = get().sales[0];
    if (!latest) return;
    const products = await db.products.toArray();
    await db.transaction("rw", db.products, db.sales, async () => {
      for (const item of latest.items) {
        const product = products.find((entry) => entry.id === item.productId);
        if (product) {
          await db.products.update(product.id, {
            currentStock: product.currentStock + item.quantity,
            updatedAt: now(),
            syncStatus: "pending"
          });
        }
      }
      await softDelete(db.sales, latest.id);
    });
    await get().refresh();
    await get().refreshSyncOverview();
  },

  adjustStock: async (productId, delta, reason, note) => {
    const product = get().products.find((item) => item.id === productId);
    if (!product) return;
    const nextStock = Math.max(0, product.currentStock + delta);
    const record: StockAdjustment = withSync(
      {
        id: `adjust-${crypto.randomUUID()}`,
        productId,
        productName: product.name,
        delta: nextStock - product.currentStock,
        reason,
        note,
        createdAt: now()
      },
      get().settings
    );
    await db.transaction("rw", db.products, db.stockAdjustments, async () => {
      await db.products.update(productId, { currentStock: nextStock, updatedAt: now(), syncStatus: "pending" });
      await db.stockAdjustments.put(record);
    });
    await get().refresh();
    await get().refreshSyncOverview();
  },

  saveCost: async (cost) => {
    await db.costs.put(withSync(cost, get().settings));
    await get().refresh();
    await get().refreshSyncOverview();
  },

  deleteCost: async (costId) => {
    await softDelete(db.costs, costId);
    await get().refresh();
    await get().refreshSyncOverview();
  },

  saveSession: async (session) => {
    await db.sessions.put(withSync(session, get().settings));
    await get().refresh();
    await get().refreshSyncOverview();
  },

  deleteSession: async (sessionId) => {
    await db.transaction("rw", [db.sessions, db.sales, db.costs], async () => {
      await softDelete(db.sessions, sessionId);
      const sales = await db.sales.where("sessionId").equals(sessionId).toArray();
      const costs = await db.costs.where("sessionId").equals(sessionId).toArray();
      await Promise.all(sales.map((sale) => softDelete(db.sales, sale.id)));
      await Promise.all(costs.map((cost) => softDelete(db.costs, cost.id)));
    });
    set({ selectedSession: undefined });
    await get().refresh();
    await get().refreshSyncOverview();
  },

  selectSession: async (sessionId) => {
    const selectedSession = get().sessions.find((session) => session.id === sessionId);
    const { sales, costs } = await readSessionData(sessionId);
    set({ selectedSession, sales, costs });
  },

  startSession: async (sessionId) => {
    const products = get().products.filter((product) => product.enabled);
    const session = get().sessions.find((item) => item.id === sessionId);
    if (!session) return { ok: false, message: "場次が見つかりません。" };
    if (products.length === 0) return { ok: false, message: "有効な商品がありません。" };
    if (!products.some((product) => product.currentStock > 0)) return { ok: false, message: "販売できる在庫がありません。" };
    if (products.some((product) => product.price <= 0)) return { ok: false, message: "価格が未設定の商品があります。" };
    if (products.some((product) => product.unitCost < 0)) return { ok: false, message: "原価を確認してください。" };
    if (session.targetSales <= 0) return { ok: false, message: "売上目標を設定してください。" };

    await db.transaction("rw", db.sessions, async () => {
      const opened = get().sessions.filter((item) => item.status === "open");
      await Promise.all(
        opened.map((item) => db.sessions.update(item.id, { status: "closed", endedAt: now(), updatedAt: now(), syncStatus: "pending" }))
      );
      await db.sessions.update(sessionId, { status: "open", startedAt: now(), endedAt: undefined, updatedAt: now(), syncStatus: "pending" });
    });
    await get().refresh();
    await get().refreshSyncOverview();
    return { ok: true };
  },

  closeActiveSession: async () => {
    const activeSession = get().activeSession;
    if (!activeSession) return;
    await db.sessions.update(activeSession.id, { status: "closed", endedAt: now(), updatedAt: now(), syncStatus: "pending" });
    await get().refresh();
    await get().refreshSyncOverview();
  },

  updateSettings: async (settings) => {
    const nextSettings = withSync(settings, settings);
    persistWorkspaceId(nextSettings.workspaceId);
    await db.settings.put(nextSettings);
    await get().refresh();
    await get().refreshSyncOverview();
  },

  resetAllData: async () => {
    await db.transaction("rw", [db.categories, db.costCategories, db.products, db.bundles, db.sessions, db.sales, db.costs, db.stockAdjustments, db.settings], async () => {
      await Promise.all([
        db.categories.clear(),
        db.costCategories.clear(),
        db.products.clear(),
        db.bundles.clear(),
        db.sessions.clear(),
        db.sales.clear(),
        db.costs.clear(),
        db.stockAdjustments.clear(),
        db.settings.clear()
      ]);
    });
    await ensureSeedData();
    await get().refresh();
    await get().refreshSyncOverview();
  }
}));
