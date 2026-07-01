import Dexie, { type Table } from "dexie";
import type {
  AppSettings,
  BundleRule,
  CostRecord,
  Product,
  ProductCategory,
  SaleRecord,
  Session,
  StockAdjustment
} from "@/types";
import { seedBundles, seedCategories, seedProducts, seedSession, seedSettings } from "@/lib/seed";

class MatsuriDb extends Dexie {
  categories!: Table<ProductCategory, string>;
  products!: Table<Product, string>;
  bundles!: Table<BundleRule, string>;
  sessions!: Table<Session, string>;
  sales!: Table<SaleRecord, string>;
  costs!: Table<CostRecord, string>;
  stockAdjustments!: Table<StockAdjustment, string>;
  settings!: Table<AppSettings, string>;

  constructor() {
    super("MatsuriMasterDb");
    this.version(1).stores({
      products: "id, category, enabled",
      bundles: "id, enabled",
      sessions: "id, date, status",
      sales: "id, sessionId, createdAt",
      costs: "id, sessionId, date, type",
      stockAdjustments: "id, productId, createdAt",
      settings: "id"
    });
    this.version(2).stores({
      categories: "id, enabled, sortOrder",
      products: "id, category, enabled",
      bundles: "id, enabled",
      sessions: "id, date, status",
      sales: "id, sessionId, createdAt",
      costs: "id, sessionId, date, type",
      stockAdjustments: "id, productId, createdAt",
      settings: "id"
    });
  }
}

export const db = new MatsuriDb();

export async function ensureSeedData() {
  const categoryCount = await db.categories.count();
  if (categoryCount === 0) {
    await db.categories.bulkPut(seedCategories);
  }

  const productCount = await db.products.count();
  if (productCount === 0) {
    await db.products.bulkPut(seedProducts);
  }

  const legacyCategoryMap: Record<string, string> = {
    skewer: "cat-skewer",
    drink: "cat-drink",
    other: "cat-other"
  };
  const products = await db.products.toArray();
  await Promise.all(
    products
      .filter((product) => legacyCategoryMap[product.category])
      .map((product) => db.products.update(product.id, { category: legacyCategoryMap[product.category], updatedAt: new Date().toISOString() }))
  );
  const latestProducts = await db.products.toArray();
  if (!latestProducts.some((product) => product.category === "cat-toy")) {
    await db.products.bulkPut(seedProducts.filter((product) => product.category === "cat-toy"));
  }

  const bundleCount = await db.bundles.count();
  if (bundleCount === 0) {
    await db.bundles.bulkPut(seedBundles);
  }
  const bundles = await db.bundles.toArray();
  await Promise.all(
    bundles
      .filter((bundle) => !bundle.allowedCategoryIds || bundle.allowedCategoryIds.length === 0)
      .map((bundle) => db.bundles.update(bundle.id, { allowedCategoryIds: ["cat-skewer"], updatedAt: new Date().toISOString() }))
  );

  const sessionCount = await db.sessions.count();
  if (sessionCount === 0) {
    await db.sessions.put(seedSession());
  }

  const settings = await db.settings.get("main");
  if (!settings) {
    await db.settings.put(seedSettings);
  }
}
