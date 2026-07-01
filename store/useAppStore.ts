import { create } from "zustand";
import { db, ensureSeedData } from "@/lib/db";
import type {
  AppMode,
  AppSettings,
  BundleRule,
  CostRecord,
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
  sellProduct: (productId: string) => Promise<{ ok: boolean; message?: string }>;
  sellBundle: (bundle: BundleRule, productIds: string[], drinkId?: string) => Promise<{ ok: boolean; message?: string }>;
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

const newestOpenSession = (sessions: Session[]) =>
  sessions
    .filter((session) => session.status === "open")
    .sort((a, b) => (b.startedAt ?? b.createdAt).localeCompare(a.startedAt ?? a.createdAt))[0];

const newestSession = (sessions: Session[]) =>
  [...sessions].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

async function readSessionData(sessionId?: string) {
  if (!sessionId) {
    return { sales: [], costs: [] };
  }
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

  setMode: (mode) => set({ mode }),

  hydrate: async () => {
    await ensureSeedData();
    await get().refresh();
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

  sellProduct: async (productId) => {
    const { activeSession, products } = get();
    if (!activeSession) return { ok: false, message: "営業中の回がありません" };
    const product = products.find((item) => item.id === productId);
    if (!product || !product.enabled) return { ok: false, message: "販売できない商品です" };
    if (product.currentStock <= 0) return { ok: false, message: "在庫がありません" };

    const sale: SaleRecord = {
      id: `sale-${crypto.randomUUID()}`,
      sessionId: activeSession.id,
      createdAt: now(),
      items: [buildSaleItem(product, 1, product.price)],
      totalRevenue: product.price,
      totalCost: product.unitCost,
      grossProfit: product.price - product.unitCost
    };

    await db.transaction("rw", db.products, db.sales, async () => {
      await db.products.update(product.id, { currentStock: product.currentStock - 1, updatedAt: now() });
      await db.sales.put(sale);
    });
    await get().refresh();
    return { ok: true };
  },

  sellBundle: async (bundle, productIds, drinkId) => {
    const { activeSession, products } = get();
    if (!activeSession) return { ok: false, message: "営業中の回がありません" };
    const allIds = drinkId ? [...productIds, drinkId] : [...productIds];
    if (productIds.length !== bundle.itemCount) return { ok: false, message: "必要な本数を選んでください" };
    if (bundle.includesDrink && !drinkId) return { ok: false, message: "ドリンクを選んでください" };

    const counts = allIds.reduce<Record<string, number>>((acc, id) => {
      acc[id] = (acc[id] ?? 0) + 1;
      return acc;
    }, {});

    for (const [id, count] of Object.entries(counts)) {
      const product = products.find((item) => item.id === id);
      if (!product || !product.enabled) return { ok: false, message: "販売できない商品が含まれています" };
      if (product.currentStock < count) return { ok: false, message: `${product.name} の在庫が足りません` };
    }

    const items = groupProducts(products, allIds, bundle.price);
    const totalCost = items.reduce((sum, item) => sum + item.subtotalCost, 0);
    const sale: SaleRecord = {
      id: `sale-${crypto.randomUUID()}`,
      sessionId: activeSession.id,
      createdAt: now(),
      items,
      bundleId: bundle.id,
      bundleName: bundle.name,
      totalRevenue: bundle.price,
      totalCost,
      grossProfit: bundle.price - totalCost
    };

    await db.transaction("rw", db.products, db.sales, async () => {
      await Promise.all(
        Object.entries(counts).map(async ([id, count]) => {
          const product = products.find((item) => item.id === id);
          if (product) {
            await db.products.update(id, { currentStock: product.currentStock - count, updatedAt: now() });
          }
        })
      );
      await db.sales.put(sale);
    });
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
        if (product) {
          await db.products.update(product.id, {
            currentStock: product.currentStock + item.quantity,
            updatedAt: now()
          });
        }
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
