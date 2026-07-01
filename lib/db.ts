import Dexie, { type Table } from "dexie";
import { getOrCreateDeviceId, getOrCreateWorkspaceId, setWorkspaceId } from "@/lib/localIdentity";
import {
  seedBundles,
  seedCategories,
  seedCostCategories,
  seedProducts,
  seedSession,
  seedSettings
} from "@/lib/seed";
import type {
  AppSettings,
  BundleRule,
  CostCategory,
  CostRecord,
  Product,
  ProductCategory,
  SaleRecord,
  Session,
  StockAdjustment,
  SyncStatus
} from "@/types";

const now = () => new Date().toISOString();

function defaultSyncStatus(): SyncStatus {
  return "pending";
}

function ensureSyncFields<T extends Record<string, unknown>>(record: T, createdAtFallback?: string) {
  const workspaceId = String(record.workspaceId ?? getOrCreateWorkspaceId());
  const deviceId = String(record.deviceId ?? getOrCreateDeviceId());
  return {
    ...record,
    workspaceId,
    deviceId,
    syncStatus: (record.syncStatus as SyncStatus | undefined) ?? defaultSyncStatus(),
    updatedAt: String(record.updatedAt ?? record.createdAt ?? createdAtFallback ?? now()),
    createdAt: String(record.createdAt ?? createdAtFallback ?? now()),
    deletedAt: (record.deletedAt as string | null | undefined) ?? null,
    cloudSyncedAt: record.cloudSyncedAt ? String(record.cloudSyncedAt) : undefined
  };
}

class MatsuriDb extends Dexie {
  categories!: Table<ProductCategory, string>;
  costCategories!: Table<CostCategory, string>;
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
    this.version(3)
      .stores({
        categories: "id, workspaceId, syncStatus, sortOrder, deletedAt",
        costCategories: "id, workspaceId, syncStatus, sortOrder, deletedAt",
        products: "id, workspaceId, category, enabled, syncStatus, deletedAt",
        bundles: "id, workspaceId, enabled, syncStatus, deletedAt",
        sessions: "id, workspaceId, date, status, syncStatus, deletedAt",
        sales: "id, workspaceId, sessionId, createdAt, syncStatus, deletedAt",
        costs: "id, workspaceId, sessionId, date, type, costCategoryId, syncStatus, deletedAt",
        stockAdjustments: "id, workspaceId, productId, createdAt, syncStatus, deletedAt",
        settings: "id, workspaceId, syncStatus, updatedAt"
      })
      .upgrade(async (tx) => {
        const workspaceId = getOrCreateWorkspaceId();
        const deviceId = getOrCreateDeviceId();
        setWorkspaceId(workspaceId);

        await tx.table("categories").toCollection().modify((record) => {
          Object.assign(record, ensureSyncFields(record, now()));
          if (record.showInHighTraffic === undefined) record.showInHighTraffic = false;
        });
        await tx.table("products").toCollection().modify((record) => {
          Object.assign(record, ensureSyncFields(record, now()));
        });
        await tx.table("bundles").toCollection().modify((record) => {
          Object.assign(record, ensureSyncFields(record, now()));
          if (!Array.isArray(record.allowedCategoryIds)) record.allowedCategoryIds = ["cat-skewer"];
        });
        await tx.table("sessions").toCollection().modify((record) => {
          Object.assign(record, ensureSyncFields(record, now()));
        });
        await tx.table("sales").toCollection().modify((record) => {
          Object.assign(record, ensureSyncFields(record, String(record.createdAt ?? now())));
        });
        await tx.table("costs").toCollection().modify((record) => {
          Object.assign(record, ensureSyncFields(record, String(record.createdAt ?? now())));
          if (!record.costCategoryId) record.costCategoryId = "cost-other";
        });
        await tx.table("stockAdjustments").toCollection().modify((record) => {
          Object.assign(record, ensureSyncFields(record, String(record.createdAt ?? now())));
        });
        await tx.table("settings").toCollection().modify((record) => {
          Object.assign(record, ensureSyncFields(record, now()));
          if (!record.workspaceId) record.workspaceId = workspaceId;
          if (!record.deviceId) record.deviceId = deviceId;
          if (record.cloudSyncEnabled === undefined) record.cloudSyncEnabled = true;
        });
      });
  }
}

export const db = new MatsuriDb();

export async function ensureSeedData() {
  const categoryCount = await db.categories.count();
  if (categoryCount === 0) await db.categories.bulkPut(seedCategories);

  const costCategoryCount = await db.costCategories.count();
  if (costCategoryCount === 0) await db.costCategories.bulkPut(seedCostCategories);

  const productCount = await db.products.count();
  if (productCount === 0) await db.products.bulkPut(seedProducts);

  const legacyCategoryMap: Record<string, string> = {
    skewer: "cat-skewer",
    drink: "cat-drink",
    other: "cat-other"
  };

  const products = await db.products.toArray();
  await Promise.all(
    products
      .filter((product) => legacyCategoryMap[product.category])
      .map((product) =>
        db.products.update(product.id, {
          category: legacyCategoryMap[product.category],
          updatedAt: now(),
          syncStatus: "pending"
        })
      )
  );

  const latestProducts = await db.products.toArray();
  if (!latestProducts.some((product) => product.id === "prod-glow-ring")) {
    await db.products.bulkPut(seedProducts.filter((product) => product.category === "cat-toy"));
  }

  const bundleCount = await db.bundles.count();
  if (bundleCount === 0) await db.bundles.bulkPut(seedBundles);

  const bundles = await db.bundles.toArray();
  await Promise.all(
    bundles
      .filter((bundle) => !bundle.allowedCategoryIds || bundle.allowedCategoryIds.length === 0)
      .map((bundle) =>
        db.bundles.update(bundle.id, {
          allowedCategoryIds: ["cat-skewer"],
          updatedAt: now(),
          syncStatus: "pending"
        })
      )
  );

  const sessionCount = await db.sessions.count();
  if (sessionCount === 0) await db.sessions.put(seedSession());

  const settings = await db.settings.get("main");
  if (!settings) {
    await db.settings.put(seedSettings);
  } else {
    const patched = ensureSyncFields(
      {
        ...settings,
        workspaceId: settings.workspaceId || getOrCreateWorkspaceId(),
        deviceId: settings.deviceId || getOrCreateDeviceId(),
        cloudSyncEnabled: settings.cloudSyncEnabled ?? true
      },
      now()
    ) as AppSettings;
    setWorkspaceId(patched.workspaceId);
    await db.settings.put(patched);
  }

  const costs = await db.costs.toArray();
  await Promise.all(
    costs
      .filter((cost) => !cost.costCategoryId)
      .map((cost) =>
        db.costs.update(cost.id, {
          costCategoryId: "cost-other",
          workspaceId: cost.workspaceId ?? getOrCreateWorkspaceId(),
          deviceId: cost.deviceId ?? getOrCreateDeviceId(),
          syncStatus: "pending",
          updatedAt: now(),
          deletedAt: cost.deletedAt ?? null
        })
      )
  );
}
