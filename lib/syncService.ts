import { db } from "@/lib/db";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";
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
  SyncOverview,
  SyncStatus
} from "@/types";

const now = () => new Date().toISOString();

type SyncEntity =
  | ProductCategory
  | CostCategory
  | Product
  | BundleRule
  | Session
  | SaleRecord
  | CostRecord
  | StockAdjustment
  | AppSettings;

type LocalTable = keyof Pick<typeof db, "categories" | "costCategories" | "products" | "bundles" | "sessions" | "sales" | "costs" | "stockAdjustments" | "settings">;

type TableConfig = {
  local: LocalTable;
  remote: string;
};

const tableConfigs: TableConfig[] = [
  { local: "categories", remote: "categories" },
  { local: "costCategories", remote: "cost_categories" },
  { local: "products", remote: "products" },
  { local: "bundles", remote: "set_menus" },
  { local: "sessions", remote: "sessions" },
  { local: "sales", remote: "sales" },
  { local: "costs", remote: "costs" },
  { local: "stockAdjustments", remote: "stock_adjustments" },
  { local: "settings", remote: "app_settings" }
];

// Entity-specific fields whose camelCase name differs from the Postgres column name.
// Fields not listed here (e.g. "name", "price", "enabled") are assumed to share the same name.
const entityFieldMaps: Record<LocalTable, Record<string, string>> = {
  categories: { sortOrder: "sort_order", showInHighTraffic: "show_in_high_traffic" },
  costCategories: { sortOrder: "sort_order" },
  products: {
    unitCost: "unit_cost",
    initialStock: "initial_stock",
    currentStock: "current_stock",
    warningStock: "warning_stock",
    sortOrder: "sort_order"
  },
  bundles: {
    itemCount: "item_count",
    allowChoice: "allow_choice",
    includesDrink: "includes_drink",
    allowedCategoryIds: "allowed_category_ids",
    discountAmount: "discount_amount"
  },
  sessions: { startedAt: "started_at", endedAt: "ended_at", targetSales: "target_sales" },
  sales: {
    orderId: "order_id",
    sessionId: "session_id",
    bundleId: "bundle_id",
    bundleName: "bundle_name",
    paymentMethod: "payment_method",
    discountAmount: "discount_amount",
    discountReason: "discount_reason",
    receivedAmount: "received_amount",
    changeAmount: "change_amount",
    finalTotal: "final_total",
    totalRevenue: "total_revenue",
    totalCost: "total_cost",
    grossProfit: "gross_profit"
  },
  costs: { sessionId: "session_id", costCategoryId: "cost_category_id" },
  stockAdjustments: { productId: "product_id", productName: "product_name" },
  settings: {
    highTrafficMode: "high_traffic_mode",
    soundEnabled: "sound_enabled",
    defaultTargetSales: "default_target_sales",
    latestBackupAt: "latest_backup_at",
    cloudSyncEnabled: "cloud_sync_enabled",
    lastSyncAt: "last_sync_at",
    currentCheckoutDisplay: "current_checkout_display"
  }
};

// Explicit, fixed list of entity-specific fields to send for each table (excludes the common
// SyncableFields, which are always handled separately, and local-only fields that have no
// remote column, e.g. Product.sortOrder / AppSettings.supabaseUrl).
//
// Using a fixed list — instead of deriving keys dynamically from whatever properties happen to
// exist on a given JS object — guarantees every row in a batch upsert has an identical, complete
// set of keys. Some fields (Session.startedAt/endedAt, SaleRecord.bundleId/bundleName,
// CostRecord.sessionId) are optional and may be genuinely absent as own-properties on older
// records (e.g. created before the field existed, or restored from an older JSON backup).
// PostgREST bulk upserts can fail or silently misalign columns when rows in the same batch have
// different key sets, so every optional field must still be present (as null) on every row.
const entityFields: Record<LocalTable, string[]> = {
  categories: ["name", "enabled", "sortOrder", "showInHighTraffic"],
  costCategories: ["name", "enabled", "sortOrder"],
  products: ["name", "icon", "category", "price", "unitCost", "initialStock", "currentStock", "warningStock", "enabled", "sortOrder"],
  bundles: ["name", "price", "itemCount", "allowChoice", "includesDrink", "allowedCategoryIds", "discountAmount", "enabled"],
  sessions: ["name", "date", "location", "startedAt", "endedAt", "targetSales", "status"],
  sales: [
    "orderId",
    "sessionId",
    "items",
    "bundleId",
    "bundleName",
    "paymentMethod",
    "discountAmount",
    "discountReason",
    "receivedAmount",
    "changeAmount",
    "finalTotal",
    "totalRevenue",
    "totalCost",
    "grossProfit"
  ],
  costs: ["sessionId", "name", "amount", "type", "costCategoryId", "note", "date"],
  stockAdjustments: ["productId", "productName", "delta", "reason", "note"],
  settings: ["highTrafficMode", "soundEnabled", "defaultTargetSales", "latestBackupAt", "cloudSyncEnabled", "lastSyncAt", "currentCheckoutDisplay"]
};

const commonSnakeFields = ["id", "workspace_id", "device_id", "sync_status", "created_at", "updated_at", "deleted_at", "cloud_synced_at"];

function toRemoteRecord(local: LocalTable, record: SyncEntity) {
  const fieldMap = entityFieldMaps[local];
  const result: Record<string, unknown> = {
    id: record.id,
    workspace_id: record.workspaceId,
    device_id: record.deviceId,
    sync_status: record.syncStatus,
    created_at: record.createdAt ?? record.updatedAt,
    updated_at: record.updatedAt,
    deleted_at: record.deletedAt ?? null,
    cloud_synced_at: record.cloudSyncedAt ?? null
  };

  const source = record as unknown as Record<string, unknown>;
  for (const key of entityFields[local]) {
    const remoteKey = fieldMap[key] ?? key;
    let value = source[key];
    if (value === undefined) value = null;
    if (typeof value === "number" && Number.isNaN(value)) value = 0;
    result[remoteKey] = value;
  }
  return result;
}

function fromRemoteRecord<T extends SyncEntity>(local: LocalTable, row: Record<string, unknown>): T {
  const fieldMap = entityFieldMaps[local];
  const reverseMap: Record<string, string> = {};
  for (const [camelKey, snakeKey] of Object.entries(fieldMap)) reverseMap[snakeKey] = camelKey;

  const result: Record<string, unknown> = {
    id: row.id,
    workspaceId: String(row.workspace_id ?? ""),
    deviceId: String(row.device_id ?? ""),
    syncStatus: (row.sync_status as SyncStatus | undefined) ?? "synced",
    createdAt: String(row.created_at ?? now()),
    updatedAt: String(row.updated_at ?? now()),
    deletedAt: (row.deleted_at as string | null | undefined) ?? null,
    cloudSyncedAt: String(row.cloud_synced_at ?? now())
  };

  for (const [key, value] of Object.entries(row)) {
    if (commonSnakeFields.includes(key)) continue;
    const camelKey = reverseMap[key] ?? key;
    result[camelKey] = value;
  }
  return result as T;
}

export async function resolveConflict<T extends SyncEntity>(localRecord: T | undefined, remoteRecord: T): Promise<T> {
  if (!localRecord) return { ...remoteRecord, syncStatus: "synced", cloudSyncedAt: now() };
  if (remoteRecord.updatedAt > localRecord.updatedAt) {
    return { ...remoteRecord, syncStatus: "synced", cloudSyncedAt: now() };
  }
  if (localRecord.updatedAt > remoteRecord.updatedAt) {
    return { ...localRecord, syncStatus: "pending" };
  }
  return { ...remoteRecord, syncStatus: "synced", cloudSyncedAt: now() };
}

export async function getSyncStatus(workspaceId: string, settings?: AppSettings): Promise<SyncOverview> {
  const [pendingCounts, failedCounts] = await Promise.all([
    Promise.all(
      tableConfigs.map(async ({ local }) => {
        const table = db[local] as { where: (key: string) => { equals: (value: unknown) => { count: () => Promise<number> } } };
        return table.where("syncStatus").equals("pending").count();
      })
    ),
    Promise.all(
      tableConfigs.map(async ({ local }) => {
        const table = db[local] as { where: (key: string) => { equals: (value: unknown) => { count: () => Promise<number> } } };
        return table.where("syncStatus").equals("failed").count();
      })
    )
  ]);

  return {
    connected: isSupabaseConfigured() && Boolean(settings?.cloudSyncEnabled),
    online: typeof navigator === "undefined" ? true : navigator.onLine,
    status: typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "idle",
    pendingCount: pendingCounts.reduce((sum, count) => sum + count, 0),
    failedCount: failedCounts.reduce((sum, count) => sum + count, 0),
    lastSyncedAt: settings?.lastSyncAt,
    workspaceId,
    deviceId: settings?.deviceId ?? ""
  };
}

function describeSyncError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return "unknown error";
}

export async function pushLocalChanges(workspaceId: string) {
  const client = getSupabaseClient();
  if (!client || (typeof navigator !== "undefined" && !navigator.onLine)) return;

  const failures: string[] = [];

  for (const { local, remote } of tableConfigs) {
    const table = db[local] as {
      toArray: () => Promise<SyncEntity[]>;
      bulkPut: (records: SyncEntity[]) => Promise<unknown>;
    };

    const rows = (await table.toArray()).filter(
      (row) => row.workspaceId === workspaceId && (row.syncStatus === "pending" || row.syncStatus === "failed")
    );
    if (rows.length === 0) continue;

    try {
      const payload = rows.map((row) => toRemoteRecord(local, row));
      // Records are uniquely identified per-workspace, not globally: seed data (e.g. "prod-beer")
      // and app_settings ("main") reuse the same fixed id across every workspace. The remote
      // primary key is (workspace_id, id) — see supabase/schema.sql — so upserts must target
      // that composite key, otherwise two different workspaces' rows with the same id would
      // overwrite each other.
      const { error } = await (client.from(remote) as never as { upsert: (rows: unknown[], options: { onConflict: string }) => Promise<{ error: Error | null }> }).upsert(payload, {
        onConflict: "workspace_id,id"
      });
      if (error) throw error;

      await table.bulkPut(rows.map((row) => ({ ...row, syncStatus: "synced", cloudSyncedAt: now() })));
    } catch (error) {
      await table.bulkPut(rows.map((row) => ({ ...row, syncStatus: "failed" })));
      failures.push(`${local}: ${describeSyncError(error)}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`一部のデータのアップロードに失敗しました (${failures.join(" / ")})`);
  }
}

export async function pullRemoteChanges(workspaceId: string) {
  const client = getSupabaseClient();
  if (!client || (typeof navigator !== "undefined" && !navigator.onLine)) return;

  const failures: string[] = [];

  for (const { local, remote } of tableConfigs) {
    const table = db[local] as {
      toArray: () => Promise<SyncEntity[]>;
      bulkPut: (records: SyncEntity[]) => Promise<unknown>;
    };

    try {
      const [localRows, remoteResult] = await Promise.all([
        table.toArray(),
        client.from(remote).select("*").eq("workspace_id", workspaceId)
      ]);
      if (remoteResult.error) throw remoteResult.error;
      const localMap = new Map(localRows.map((row) => [row.id, row]));
      const merged: SyncEntity[] = [];

      for (const remoteRow of remoteResult.data ?? []) {
        const normalized = fromRemoteRecord<SyncEntity>(local, remoteRow);
        const resolved = await resolveConflict(localMap.get(normalized.id), normalized);
        merged.push(resolved);
        localMap.delete(normalized.id);
      }

      for (const leftover of localMap.values()) {
        merged.push(leftover);
      }

      if (merged.length > 0) {
        await table.bulkPut(merged);
      }
    } catch (error) {
      failures.push(`${local}: ${describeSyncError(error)}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`一部のデータの取得に失敗しました (${failures.join(" / ")})`);
  }
}

export async function syncAll(workspaceId: string) {
  const client = getSupabaseClient();
  if (!client || (typeof navigator !== "undefined" && !navigator.onLine)) return;

  const errors: string[] = [];
  try {
    await pushLocalChanges(workspaceId);
  } catch (error) {
    errors.push(describeSyncError(error));
  }
  try {
    await pullRemoteChanges(workspaceId);
  } catch (error) {
    errors.push(describeSyncError(error));
  }

  await db.settings.update("main", { lastSyncAt: now(), updatedAt: now(), syncStatus: "synced", cloudSyncedAt: now() });

  if (errors.length > 0) {
    throw new Error(errors.join(" / "));
  }
}
