import { create } from "zustand";
import { db, ensureSeedData } from "@/lib/db";
import { saveCustomerDisplay } from "@/lib/customerDisplay";
import type {
  AppMode,
  AppSettings,
  BundleRule,
  CartItem,
  CheckoutInput,
  CostRecord,
  CurrentCheckoutDisplay,
  Product,
  ProductCategory,
  SaleItem,
  SaleRecord,
  Session,
  StockAdjustment,
  StockReason
} from "@/types";

type AppState = {
  mode: AppMode;
  loading: boolean;
  products: Product[];
  categories: ProductCategory[];
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
  setMode: (mode: AppMode) => void;
  hydrate: () => Promise<void>;
  refresh: () => Promise<void>;
  saveProduct: (product: Product) => Promise<void>;
  deleteProduct: (productId: string) => Promise<void>;
  saveCategory: (category: ProductCategory) => Promise<void>;
  deleteCategory: (categoryId: string) => Promise<void>;
  moveCategory: (categoryId: string, direction: "up" | "down") => Promise<void>;
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

const baseSettings: AppSettings = {
  id: "main",
  highTrafficMode: false,
  soundEnabled: true,
  defaultTargetSales: 100000
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

const newestOpenSession = (sessions: Session[]) =>
  sessions
    .filter((session) => session.status === "open")
    .sort((a, b) => (b.startedAt ?? b.createdAt).localeCompare(a.startedAt ?? a.createdAt))[0];

const newestSession = (sessions: Session[]) => [...sessions].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

async function readSessionData(sessionId?: string) {
  if (!sessionId) return { sales: [], costs: [] };
  const [sales, costs] = await Promise.all([
    db.sales.where("sessionId").equals(sessionId).reverse().sortBy("createdAt"),
    db.costs.where("sessionId").equals(sessionId).sortBy("date")
  ]);
  return { sales: sales.reverse(), costs };
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

function buildDisplay(cartItems: CartItem[], input?: Partial<CheckoutInput>, status: CurrentCheckoutDisplay["status"] = "editing"): CurrentCheckoutDisplay {
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

export const useAppStore = create<AppState>((set, get) => ({
  mode: "today",
  loading: true,
  products: [],
  categories: [],
  bundles: [],
  sessions: [],
  sales: [],
  costs: [],
  adjustments: [],
  settings: baseSettings,
  cartItems: [],
  checkoutDisplay: emptyDisplay,

  setMode: (mode) => set({ mode }),

  hydrate: async () => {
    await ensureSeedData();
    await get().refresh();
    publishDisplay(get().checkoutDisplay);
    set({ loading: false });
  },

  refresh: async () => {
    const [products, categories, bundles, sessions, settings, adjustments] = await Promise.all([
      db.products.toArray(),
      db.categories.toArray(),
      db.bundles.toArray(),
      db.sessions.toArray(),
      db.settings.get("main"),
      db.stockAdjustments.reverse().sortBy("createdAt")
    ]);
    const sortedSessions = sessions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const activeSession = newestOpenSession(sortedSessions);
    const selectedSession = get().selectedSession
      ? sortedSessions.find((session) => session.id === get().selectedSession?.id)
      : activeSession ?? newestSession(sortedSessions);
    const { sales, costs } = await readSessionData(selectedSession?.id);

    set({
      products: products.sort((a, b) => a.name.localeCompare(b.name, "ja")),
      categories: categories.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "ja")),
      bundles: bundles.sort((a, b) => a.name.localeCompare(b.name, "ja")),
      sessions: sortedSessions,
      activeSession,
      selectedSession,
      sales,
      costs,
      adjustments,
      settings: settings ?? baseSettings
    });
  },

  saveProduct: async (product) => {
    await db.products.put({ ...product, updatedAt: now() });
    await get().refresh();
  },

  deleteProduct: async (productId) => {
    await db.products.delete(productId);
    await get().refresh();
  },

  saveCategory: async (category) => {
    await db.categories.put({ ...category, updatedAt: now() });
    await get().refresh();
  },

  deleteCategory: async (categoryId) => {
    const fallback = get().categories.find((category) => category.id === "cat-other") ?? get().categories.find((category) => category.id !== categoryId);
    await db.transaction("rw", [db.categories, db.products], async () => {
      if (fallback) {
        const products = await db.products.where("category").equals(categoryId).toArray();
        await Promise.all(products.map((product) => db.products.update(product.id, { category: fallback.id, updatedAt: now() })));
      }
      await db.categories.delete(categoryId);
    });
    await get().refresh();
  },

  moveCategory: async (categoryId, direction) => {
    const categories = [...get().categories].sort((a, b) => a.sortOrder - b.sortOrder);
    const index = categories.findIndex((category) => category.id === categoryId);
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || swapIndex < 0 || swapIndex >= categories.length) return;
    const current = categories[index];
    const target = categories[swapIndex];
    await db.transaction("rw", db.categories, async () => {
      await db.categories.update(current.id, { sortOrder: target.sortOrder, updatedAt: now() });
      await db.categories.update(target.id, { sortOrder: current.sortOrder, updatedAt: now() });
    });
    await get().refresh();
  },

  saveBundle: async (bundle) => {
    await db.bundles.put({ ...bundle, updatedAt: now() });
    await get().refresh();
  },

  deleteBundle: async (bundleId) => {
    await db.bundles.delete(bundleId);
    await get().refresh();
  },

  addProductToCart: (productId) => {
    const { products, cartItems } = get();
    const product = products.find((item) => item.id === productId);
    if (!product || !product.enabled) return { ok: false, message: "販売できない商品です" };
    const reserved = cartProductCounts(cartItems)[productId] ?? 0;
    if (product.currentStock <= reserved) return { ok: false, message: "在庫が足りません" };

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
    if (productIds.length !== bundle.itemCount) return { ok: false, message: "必要な数を選択してください" };
    if (bundle.includesDrink && !drinkId) return { ok: false, message: "ドリンクを選択してください" };

    const currentCounts = cartProductCounts(cartItems);
    const addingCounts = allIds.reduce<Record<string, number>>((acc, id) => {
      acc[id] = (acc[id] ?? 0) + 1;
      return acc;
    }, {});

    for (const [id, count] of Object.entries(addingCounts)) {
      const product = products.find((item) => item.id === id);
      if (!product || !product.enabled) return { ok: false, message: "販売できない商品が含まれています" };
      if (product.currentStock < (currentCounts[id] ?? 0) + count) return { ok: false, message: `${product.name} の在庫が足りません` };
    }

    const items = groupProducts(products, allIds, bundle.price);
    const detail = items.map((item) => `${item.productName}×${item.quantity}`).join("、");
    const nextCart = [
      ...cartItems,
      {
        id: `bundle-${bundle.id}-${crypto.randomUUID()}`,
        name: bundle.name,
        description: `${bundle.name}：${detail}`,
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
    const { activeSession, cartItems, products } = get();
    if (!activeSession) return { ok: false, message: "営業中の回がありません" };
    if (cartItems.length === 0) return { ok: false, message: "会計する商品がありません" };

    const counts = cartProductCounts(cartItems);
    for (const [id, count] of Object.entries(counts)) {
      const product = products.find((item) => item.id === id);
      if (!product || product.currentStock < count) return { ok: false, message: `${product?.name ?? "商品"} の在庫が足りません` };
    }

    const subtotal = cartSubtotal(cartItems);
    const discountAmount = Math.max(0, Math.min(input.discountAmount, subtotal));
    const finalTotal = Math.max(0, subtotal - discountAmount);
    const receivedAmount = Math.max(0, input.receivedAmount);
    const changeAmount = input.paymentMethod === "cash" ? Math.max(0, receivedAmount - finalTotal) : 0;
    const totalCost = cartItems.reduce((sum, item) => sum + item.totalCost, 0);
    const orderId = `ORD-${new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14)}`;

    const sale: SaleRecord = {
      id: `sale-${crypto.randomUUID()}`,
      orderId,
      sessionId: activeSession.id,
      createdAt: now(),
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
    };

    await db.transaction("rw", db.products, db.sales, async () => {
      await Promise.all(
        Object.entries(counts).map(async ([id, count]) => {
          const product = products.find((item) => item.id === id);
          if (product) await db.products.update(id, { currentStock: product.currentStock - count, updatedAt: now() });
        })
      );
      await db.sales.put(sale);
    });

    const completedDisplay = buildDisplay(cartItems, { ...input, discountAmount, receivedAmount }, "completed");
    set({ cartItems: [], checkoutDisplay: completedDisplay });
    publishDisplay(completedDisplay);
    await get().refresh();
    return { ok: true };
  },

  undoLastSale: async () => {
    const latest = get().sales[0];
    if (!latest) return;
    const products = await db.products.toArray();
    await db.transaction("rw", db.products, db.sales, async () => {
      for (const item of latest.items) {
        const product = products.find((entry) => entry.id === item.productId);
        if (product) await db.products.update(product.id, { currentStock: product.currentStock + item.quantity, updatedAt: now() });
      }
      await db.sales.delete(latest.id);
    });
    await get().refresh();
  },

  adjustStock: async (productId, delta, reason, note) => {
    const product = get().products.find((item) => item.id === productId);
    if (!product) return;
    const nextStock = Math.max(0, product.currentStock + delta);
    const record: StockAdjustment = {
      id: `adjust-${crypto.randomUUID()}`,
      productId,
      productName: product.name,
      delta: nextStock - product.currentStock,
      reason,
      note,
      createdAt: now()
    };
    await db.transaction("rw", db.products, db.stockAdjustments, async () => {
      await db.products.update(productId, { currentStock: nextStock, updatedAt: now() });
      await db.stockAdjustments.put(record);
    });
    await get().refresh();
  },

  saveCost: async (cost) => {
    await db.costs.put(cost);
    await get().refresh();
  },

  deleteCost: async (costId) => {
    await db.costs.delete(costId);
    await get().refresh();
  },

  saveSession: async (session) => {
    await db.sessions.put(session);
    await get().refresh();
  },

  deleteSession: async (sessionId) => {
    await db.transaction("rw", [db.sessions, db.sales, db.costs], async () => {
      await db.sessions.delete(sessionId);
      await db.sales.where("sessionId").equals(sessionId).delete();
      await db.costs.where("sessionId").equals(sessionId).delete();
    });
    set({ selectedSession: undefined });
    await get().refresh();
  },

  selectSession: async (sessionId) => {
    const selectedSession = get().sessions.find((session) => session.id === sessionId);
    const { sales, costs } = await readSessionData(sessionId);
    set({ selectedSession, sales, costs });
  },

  startSession: async (sessionId) => {
    const products = get().products.filter((product) => product.enabled);
    const session = get().sessions.find((item) => item.id === sessionId);
    if (!session) return { ok: false, message: "営業回が見つかりません" };
    if (products.length === 0) return { ok: false, message: "有効な商品がありません" };
    if (!products.some((product) => product.currentStock > 0)) return { ok: false, message: "販売できる在庫がありません" };
    if (products.some((product) => product.price <= 0)) return { ok: false, message: "価格が未設定の商品があります" };
    if (products.some((product) => product.unitCost < 0)) return { ok: false, message: "原価を確認してください" };
    if (session.targetSales <= 0) return { ok: false, message: "売上目標を設定してください" };

    await db.transaction("rw", db.sessions, async () => {
      const opened = get().sessions.filter((item) => item.status === "open");
      await Promise.all(opened.map((item) => db.sessions.update(item.id, { status: "closed", endedAt: now() })));
      await db.sessions.update(sessionId, { status: "open", startedAt: now(), endedAt: undefined });
    });
    await get().refresh();
    return { ok: true };
  },

  closeActiveSession: async () => {
    const activeSession = get().activeSession;
    if (!activeSession) return;
    await db.sessions.update(activeSession.id, { status: "closed", endedAt: now() });
    await get().refresh();
  },

  updateSettings: async (settings) => {
    await db.settings.put(settings);
    await get().refresh();
  },

  resetAllData: async () => {
    await db.transaction("rw", [db.categories, db.products, db.bundles, db.sessions, db.sales, db.costs, db.stockAdjustments, db.settings], async () => {
      await Promise.all([
        db.categories.clear(),
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
  }
}));
