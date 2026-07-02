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
  AutoBackupRecord,
  BackupPayload,
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

const MAX_AUTO_BACKUPS = 5;
const dataTables = ["categories", "costCategories", "products", "bundles", "sessions", "sales", "costs", "stockAdjustments", "settings"] as const;

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
  autoBackups!: Table<AutoBackupRecord, string>;

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
    this.version(4)
      .stores({
        categories: "id, workspaceId, syncStatus, sortOrder, deletedAt",
        costCategories: "id, workspaceId, syncStatus, sortOrder, deletedAt",
        products: "id, workspaceId, category, enabled, syncStatus, deletedAt, sortOrder",
        bundles: "id, workspaceId, enabled, syncStatus, deletedAt",
        sessions: "id, workspaceId, date, status, syncStatus, deletedAt",
        sales: "id, workspaceId, sessionId, createdAt, syncStatus, deletedAt",
        costs: "id, workspaceId, sessionId, date, type, costCategoryId, syncStatus, deletedAt",
        stockAdjustments: "id, workspaceId, productId, createdAt, syncStatus, deletedAt",
        settings: "id, workspaceId, syncStatus, updatedAt"
      })
      .upgrade(async (tx) => {
        const products = await tx.table("products").toArray();
        const byCategory = new Map<string, typeof products>();
        for (const product of products) {
          if (typeof product.sortOrder === "number") continue;
          const list = byCategory.get(product.category) ?? [];
          list.push(product);
          byCategory.set(product.category, list);
        }
        for (const list of byCategory.values()) {
          list.sort((a, b) => String(a.name).localeCompare(String(b.name), "ja"));
          await Promise.all(
            list.map((product, index) =>
              tx.table("products").update(product.id, { sortOrder: (index + 1) * 10, updatedAt: now(), syncStatus: "pending" })
            )
          );
        }
      });
    this.version(5).stores({
      categories: "id, workspaceId, syncStatus, sortOrder, deletedAt",
      costCategories: "id, workspaceId, syncStatus, sortOrder, deletedAt",
      products: "id, workspaceId, category, enabled, syncStatus, deletedAt, sortOrder",
      bundles: "id, workspaceId, enabled, syncStatus, deletedAt",
      sessions: "id, workspaceId, date, status, syncStatus, deletedAt",
      sales: "id, workspaceId, sessionId, createdAt, syncStatus, deletedAt",
      costs: "id, workspaceId, sessionId, date, type, costCategoryId, syncStatus, deletedAt",
      stockAdjustments: "id, workspaceId, productId, createdAt, syncStatus, deletedAt",
      settings: "id, workspaceId, syncStatus, updatedAt",
      autoBackups: "id, createdAt"
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

  const productsMissingSortOrder = (await db.products.toArray()).filter((product) => typeof product.sortOrder !== "number");
  if (productsMissingSortOrder.length > 0) {
    const byCategory = new Map<string, typeof productsMissingSortOrder>();
    for (const product of productsMissingSortOrder) {
      const list = byCategory.get(product.category) ?? [];
      list.push(product);
      byCategory.set(product.category, list);
    }
    for (const list of byCategory.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name, "ja"));
      await Promise.all(
        list.map((product, index) =>
          db.products.update(product.id, { sortOrder: (index + 1) * 10, updatedAt: now(), syncStatus: "pending" })
        )
      );
    }
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
        cloudSyncEnabled: settings.cloudSyncEnabled ?? true,
        meatUnitPriceBaseGrams: settings.meatUnitPriceBaseGrams ?? 20
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

async function buildBackupPayload(): Promise<BackupPayload> {
  return {
    version: 2,
    exportedAt: now(),
    categories: await db.categories.toArray(),
    costCategories: await db.costCategories.toArray(),
    products: await db.products.toArray(),
    bundles: await db.bundles.toArray(),
    sessions: await db.sessions.toArray(),
    sales: await db.sales.toArray(),
    costs: await db.costs.toArray(),
    stockAdjustments: await db.stockAdjustments.toArray(),
    settings: await db.settings.toArray()
  };
}

// Snapshots every local table into db.autoBackups before a destructive operation (e.g. pulling
// cloud data over local data), so the previous state can be restored if the operation was a mistake.
// Keeps only the most recent MAX_AUTO_BACKUPS entries.
export async function createAutoBackup(reason: string): Promise<AutoBackupRecord> {
  const record: AutoBackupRecord = {
    id: `autobackup-${crypto.randomUUID()}`,
    createdAt: now(),
    reason,
    payload: await buildBackupPayload()
  };
  await db.autoBackups.put(record);

  const all = await db.autoBackups.orderBy("createdAt").toArray();
  const excess = all.slice(0, Math.max(0, all.length - MAX_AUTO_BACKUPS));
  if (excess.length > 0) {
    await db.autoBackups.bulkDelete(excess.map((item) => item.id));
  }

  return record;
}

export async function listAutoBackups(): Promise<AutoBackupRecord[]> {
  return (await db.autoBackups.orderBy("createdAt").reverse().toArray());
}

// Replaces every local data table's contents with the given backup payload. Used both for
// restoring a manually-imported JSON backup and for undoing a "クラウドから取得" overwrite via
// an auto-backup snapshot. Never touches db.autoBackups itself.
export async function restoreFromBackupPayload(payload: BackupPayload) {
  await db.transaction("rw", dataTables.map((table) => db[table]), async () => {
    await Promise.all(dataTables.map((table) => db[table].clear()));
    await Promise.all([
      db.categories.bulkPut(payload.categories),
      db.costCategories.bulkPut(payload.costCategories),
      db.products.bulkPut(payload.products),
      db.bundles.bulkPut(payload.bundles),
      db.sessions.bulkPut(payload.sessions),
      db.sales.bulkPut(payload.sales),
      db.costs.bulkPut(payload.costs),
      db.stockAdjustments.bulkPut(payload.stockAdjustments),
      db.settings.bulkPut(payload.settings)
    ]);
  });
  await ensureSeedData();
}
