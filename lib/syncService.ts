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
  products: { unitCost: "unit_cost", initialStock: "initial_stock", currentStock: "current_stock", warningStock: "warning_stock" },
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

// Local-only fields that have no matching column on the remote table and must never be sent.
const remoteOmitFields: Partial<Record<LocalTable, string[]>> = {
  products: ["sortOrder"],
  settings: ["supabaseUrl"]
};

const commonCamelFields = ["id", "workspaceId", "deviceId", "syncStatus", "createdAt", "updatedAt", "deletedAt", "cloudSyncedAt"];
const commonSnakeFields = ["id", "workspace_id", "device_id", "sync_status", "created_at", "updated_at", "deleted_at", "cloud_synced_at"];

function toRemoteRecord(local: LocalTable, record: SyncEntity) {
  const fieldMap = entityFieldMaps[local];
  const omit = new Set(remoteOmitFields[local] ?? []);
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

  for (const [key, value] of Object.entries(record)) {
    if (commonCamelFields.includes(key) || omit.has(key)) continue;
    const remoteKey = fieldMap[key] ?? key;
    result[remoteKey] = value === undefined ? null : value;
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

export async function pushLocalChanges(workspaceId: string) {
  const client = getSupabaseClient();
  if (!client || (typeof navigator !== "undefined" && !navigator.onLine)) return;

  for (const { local, remote } of tableConfigs) {
    const table = db[local] as {
      toArray: () => Promise<SyncEntity[]>;
      bulkPut: (records: SyncEntity[]) => Promise<unknown>;
    };

    const rows = (await table.toArray()).filter(
      (row) => row.workspaceId === workspaceId && (row.syncStatus === "pending" || row.syncStatus === "failed")
    );
    if (rows.length === 0) continue;

    const payload = rows.map((row) => toRemoteRecord(local, row));
    const { error } = await (client.from(remote) as never as { upsert: (rows: unknown[], options: { onConflict: string }) => Promise<{ error: Error | null }> }).upsert(payload, {
      onConflict: "id"
    });
    if (error) {
      await table.bulkPut(rows.map((row) => ({ ...row, syncStatus: "failed" })));
      throw error;
    }

    await table.bulkPut(rows.map((row) => ({ ...row, syncStatus: "synced", cloudSyncedAt: now() })));
  }
}

export async function pullRemoteChanges(workspaceId: string) {
  const client = getSupabaseClient();
  if (!client || (typeof navigator !== "undefined" && !navigator.onLine)) return;

  for (const { local, remote } of tableConfigs) {
    const table = db[local] as {
      toArray: () => Promise<SyncEntity[]>;
      bulkPut: (records: SyncEntity[]) => Promise<unknown>;
    };

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
  }
}

export async function syncAll(workspaceId: string) {
  const client = getSupabaseClient();
  if (!client || (typeof navigator !== "undefined" && !navigator.onLine)) return;
  await pushLocalChanges(workspaceId);
  await pullRemoteChanges(workspaceId);
  await db.settings.update("main", { lastSyncAt: now(), updatedAt: now(), syncStatus: "synced", cloudSyncedAt: now() });
}
