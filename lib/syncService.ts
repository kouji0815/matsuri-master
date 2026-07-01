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

type TableConfig = {
  local: keyof Pick<typeof db, "categories" | "costCategories" | "products" | "bundles" | "sessions" | "sales" | "costs" | "stockAdjustments" | "settings">;
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

function toRemoteRecord(record: SyncEntity) {
  return {
    ...record,
    workspace_id: record.workspaceId,
    device_id: record.deviceId,
    sync_status: record.syncStatus,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    deleted_at: record.deletedAt ?? null,
    cloud_synced_at: record.cloudSyncedAt ?? null
  };
}

function fromRemoteRecord<T extends SyncEntity>(row: Record<string, unknown>) {
  const copy = { ...row } as Record<string, unknown>;
  copy.workspaceId = String(row.workspace_id ?? row.workspaceId ?? "");
  copy.deviceId = String(row.device_id ?? row.deviceId ?? "");
  copy.syncStatus = (row.sync_status as SyncStatus | undefined) ?? "synced";
  copy.createdAt = String(row.created_at ?? row.createdAt ?? now());
  copy.updatedAt = String(row.updated_at ?? row.updatedAt ?? now());
  copy.deletedAt = (row.deleted_at as string | null | undefined) ?? null;
  copy.cloudSyncedAt = String(row.cloud_synced_at ?? row.cloudSyncedAt ?? now());
  delete copy.workspace_id;
  delete copy.device_id;
  delete copy.sync_status;
  delete copy.created_at;
  delete copy.updated_at;
  delete copy.deleted_at;
  delete copy.cloud_synced_at;
  return copy as T;
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

    const payload = rows.map(toRemoteRecord);
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
      const normalized = fromRemoteRecord<SyncEntity>(remoteRow);
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
