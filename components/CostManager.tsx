"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getCostUnitPriceLabel, yen } from "@/lib/calculations";
import { db } from "@/lib/db";
import { useAppStore } from "@/store/useAppStore";
import type { CostCategory, CostRecord, CostType, CostUnitPriceMode } from "@/types";

const UNASSIGNED_SESSION_VALUE = "__unassigned__";

const typeLabels: Record<CostType, string> = {
  fixed: "固定費",
  purchase: "仕入れ",
  supply: "消耗品",
  transport: "交通費",
  other: "その他"
};

const chartColors = [
  "bg-orange-500",
  "bg-emerald-500",
  "bg-sky-500",
  "bg-violet-500",
  "bg-rose-500",
  "bg-lime-500",
  "bg-cyan-500",
  "bg-fuchsia-500"
];

const now = () => new Date().toISOString();

const blankCost = (sessionId?: string): CostRecord => ({
  id: `cost-${crypto.randomUUID()}`,
  sessionId,
  name: "",
  amount: 0,
  type: "purchase",
  costCategoryId: "cost-other",
  note: "",
  date: new Date().toISOString().slice(0, 10),
  createdAt: now(),
  workspaceId: "",
  deviceId: "",
  updatedAt: now(),
  syncStatus: "pending",
  deletedAt: null
});

const blankCostCategory = (sortOrder: number): CostCategory => ({
  id: `cost-category-${crypto.randomUUID()}`,
  name: "",
  enabled: true,
  sortOrder,
  createdAt: now(),
  workspaceId: "",
  deviceId: "",
  updatedAt: now(),
  syncStatus: "pending",
  deletedAt: null
});

export default function CostManager() {
  const {
    costs,
    costCategories,
    sessions,
    selectedSession,
    selectSession,
    settings,
    saveCost,
    deleteCost,
    saveCostCategory,
    deleteCostCategory
  } = useAppStore();

  const firstCategoryId = costCategories[0]?.id ?? "cost-other";
  const [editing, setEditing] = useState<CostRecord>(blankCost(selectedSession?.id));
  const [editingCategory, setEditingCategory] = useState<CostCategory>(blankCostCategory(100));
  const [amountText, setAmountText] = useState("");
  const [filterCategoryId, setFilterCategoryId] = useState("");
  const [costModalOpen, setCostModalOpen] = useState(false);
  const [viewingUnassigned, setViewingUnassigned] = useState(false);
  const [unassignedCosts, setUnassignedCosts] = useState<CostRecord[]>([]);

  const loadUnassignedCosts = useCallback(async () => {
    const rows = await db.costs.filter((cost) => !cost.sessionId && cost.workspaceId === settings.workspaceId && !cost.deletedAt).toArray();
    setUnassignedCosts(rows.sort((a, b) => b.amount - a.amount));
  }, [settings.workspaceId]);

  const activeSessionId = viewingUnassigned ? undefined : selectedSession?.id;
  const displayedCosts = viewingUnassigned ? unassignedCosts : costs;

  useEffect(() => {
    setEditing((current) => ({ ...current, sessionId: activeSessionId, costCategoryId: current.costCategoryId || firstCategoryId }));
  }, [activeSessionId, firstCategoryId]);

  useEffect(() => {
    setAmountText(editing.amount === 0 ? "" : String(editing.amount));
  }, [editing.amount]);

  const total = displayedCosts.reduce((sum, cost) => sum + cost.amount, 0);
  const costCategoryMap = useMemo(() => new Map(costCategories.map((category) => [category.id, category.name])), [costCategories]);
  const filteredCosts = useMemo(
    () => displayedCosts.filter((cost) => !filterCategoryId || cost.costCategoryId === filterCategoryId).sort((a, b) => b.amount - a.amount),
    [displayedCosts, filterCategoryId]
  );

  const categoryTotals = useMemo(() => {
    const amounts = costCategories
      .filter((category) => category.enabled)
      .map((category) => ({
        id: category.id,
        name: category.name,
        amount: displayedCosts.filter((cost) => cost.costCategoryId === category.id).reduce((sum, cost) => sum + cost.amount, 0)
      }));
    const totalAmount = amounts.reduce((sum, item) => sum + item.amount, 0);
    return amounts.map((item) => ({
      ...item,
      ratio: totalAmount > 0 ? item.amount / totalAmount : 0,
      percent: totalAmount > 0 ? (item.amount / totalAmount) * 100 : 0
    }));
  }, [costCategories, displayedCosts]);

  const isNewCost = !displayedCosts.some((cost) => cost.id === editing.id);

  const selectRealSession = (sessionId: string) => {
    setViewingUnassigned(false);
    void selectSession(sessionId);
  };

  const selectUnassignedView = () => {
    setViewingUnassigned(true);
    void loadUnassignedCosts();
  };

  const openNewCost = () => {
    setEditing(blankCost(activeSessionId));
    setAmountText("");
    setCostModalOpen(true);
  };

  const openEditCost = (cost: CostRecord) => {
    setEditing(cost);
    setAmountText(cost.amount === 0 ? "" : String(cost.amount));
    setCostModalOpen(true);
  };

  const submit = async () => {
    if (!editing.name.trim()) return;
    await saveCost({
      ...editing,
      sessionId: activeSessionId,
      costCategoryId: editing.costCategoryId || firstCategoryId,
      amount: Number(amountText || 0)
    });
    if (viewingUnassigned) await loadUnassignedCosts();
    setEditing(blankCost(activeSessionId));
    setAmountText("");
    setCostModalOpen(false);
  };

  const submitCategory = async () => {
    if (!editingCategory.name.trim()) return;
    const nextSortOrder = Math.max(0, ...costCategories.map((category) => category.sortOrder)) + 10;
    await saveCostCategory({
      ...editingCategory,
      sortOrder: editingCategory.sortOrder || nextSortOrder
    });
    setEditingCategory(blankCostCategory(nextSortOrder + 10));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
        <button
          onClick={() => setFilterCategoryId("")}
          className={`min-h-12 rounded-md px-4 font-bold ${filterCategoryId === "" ? "bg-mint text-slate-950" : "bg-gray-100 text-gray-700"}`}
        >
          すべて
        </button>
        {costCategories.filter((category) => category.enabled).map((category) => (
          <button
            key={category.id}
            onClick={() => setFilterCategoryId(category.id)}
            className={`min-h-12 rounded-md px-4 font-bold ${
              filterCategoryId === category.id ? "bg-mint text-slate-950" : "bg-gray-100 text-gray-700"
            }`}
          >
            {category.name}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black text-gray-900">コスト一覧</h2>
              {sessions.length > 0 ? (
                <label className="mt-1 flex items-center gap-2 text-sm text-gray-500">
                  表示中の営業場次
                  <select
                    value={viewingUnassigned ? UNASSIGNED_SESSION_VALUE : (selectedSession?.id ?? "")}
                    onChange={(event) => {
                      if (event.target.value === UNASSIGNED_SESSION_VALUE) {
                        selectUnassignedView();
                      } else if (event.target.value) {
                        selectRealSession(event.target.value);
                      }
                    }}
                    className="rounded-md border border-gray-300 bg-white px-2 py-1 font-bold text-gray-900 focus:border-blue-500 focus:outline-none"
                  >
                    {!selectedSession && !viewingUnassigned && <option value="">選択してください</option>}
                    {sessions.map((session) => (
                      <option key={session.id} value={session.id}>
                        {session.name} / {session.date}
                      </option>
                    ))}
                    <option value={UNASSIGNED_SESSION_VALUE}>未設定コスト</option>
                  </select>
                </label>
              ) : (
                <p className="text-sm text-gray-500">営業場次を選択してください</p>
              )}
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-sm text-gray-500">合計</div>
                <div className="text-2xl font-black text-amber-600">{yen(total)}</div>
              </div>
              <button onClick={openNewCost} className="rounded-md bg-mint px-4 py-2 font-black text-slate-950">
                コストを追加
              </button>
            </div>
          </div>

          <div className="mt-4 space-y-2 rounded-lg border border-gray-200 bg-white p-3">
            {categoryTotals.map((item, index) => (
              <div key={item.id}>
                <div className="flex items-center justify-between text-sm text-gray-900">
                  <span>{item.name}</span>
                  <strong>
                    {yen(item.amount)} <span className="text-gray-500">({item.percent.toFixed(1)}%)</span>
                  </strong>
                </div>
                <div className="mt-1 h-2.5 rounded-full bg-gray-200">
                  <div className={`h-2.5 rounded-full ${chartColors[index % chartColors.length]}`} style={{ width: `${item.ratio * 100}%` }} />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 space-y-3">
            {filteredCosts.map((cost) => (
              <CostListItem
                key={cost.id}
                cost={cost}
                categoryName={costCategoryMap.get(cost.costCategoryId) ?? "その他"}
                typeLabel={typeLabels[cost.type]}
                meatUnitPriceBaseGrams={settings.meatUnitPriceBaseGrams}
                onSaveUnitPrice={(mode, baseGrams) => {
                  void saveCost({ ...cost, unitPriceMode: mode, unitPriceBaseGrams: baseGrams }).then(() => {
                    if (viewingUnassigned) void loadUnassignedCosts();
                  });
                }}
                onEdit={() => openEditCost(cost)}
                onDelete={() => {
                  if (!confirm("このコストを削除しますか？")) return;
                  void deleteCost(cost.id).then(() => {
                    if (viewingUnassigned) void loadUnassignedCosts();
                  });
                }}
              />
            ))}
            {filteredCosts.length === 0 && (
              <p className="text-gray-500">
                {viewingUnassigned
                  ? "営業場次が未設定のコストはまだありません。"
                  : sessions.length > 1
                    ? "表示中の営業場次にはコストがありません。上の切り替えから別の場次も確認できます。"
                    : "表示できるコスト記録がありません。"}
              </p>
            )}
          </div>
        </section>

        <aside className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm lg:sticky lg:top-4 lg:self-start">
          <h2 className="text-xl font-black text-gray-900">分類管理</h2>
          <div className="mt-3 space-y-2">
            {costCategories.map((category) => (
              <div key={category.id} className="rounded-md border border-gray-200 bg-white p-3 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-black text-gray-900">{category.name}</div>
                    <div className="text-sm text-gray-500">{category.enabled ? "有効" : "停止中"}</div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setEditingCategory(category)} className="rounded-md bg-slate-700 px-3 py-2 font-bold text-white">
                      編集
                    </button>
                    <button
                      onClick={() => {
                        if (confirm("この分類を削除しますか？既存データはその他へ移動します。")) {
                          void deleteCostCategory(category.id);
                        }
                      }}
                      className="rounded-md bg-danger px-3 py-2 font-bold text-white"
                    >
                      削除
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-3">
            <Field label="分類名" value={editingCategory.name} onChange={(value) => setEditingCategory({ ...editingCategory, name: value })} />
            <label className="flex items-center gap-3 rounded-md border border-gray-200 bg-white p-3 font-bold text-gray-900">
              <input type="checkbox" checked={editingCategory.enabled} onChange={(event) => setEditingCategory({ ...editingCategory, enabled: event.target.checked })} />
              有効にする
            </label>
            <button onClick={submitCategory} className="min-h-14 rounded-lg bg-mint font-black text-slate-950">
              分類を保存
            </button>
            <button
              onClick={() => setEditingCategory(blankCostCategory(Math.max(0, ...costCategories.map((category) => category.sortOrder)) + 10))}
              className="rounded-md bg-slate-700 py-3 font-bold text-white"
            >
              新しい分類を作成
            </button>
          </div>
        </aside>
      </div>

      {costModalOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
          <div className="flex max-h-[92vh] w-full max-w-xl flex-col rounded-lg border border-line bg-white shadow-soft">
            <div className="flex-1 overflow-y-auto p-5">
              <h2 className="text-xl font-black text-gray-900">{isNewCost ? "コストを追加" : "コストを編集"}</h2>
              <div className="mt-4 grid gap-3">
                <Field label="名称" value={editing.name} onChange={(value) => setEditing({ ...editing, name: value })} />
                <label className="text-sm font-bold text-slate-600">
                  金額
                  <input
                    type="number"
                    value={amountText}
                    placeholder="金額"
                    onChange={(event) => {
                      const next = event.target.value.replace(/^0+(?=\d)/, "");
                      setAmountText(next);
                      setEditing({ ...editing, amount: Number(next || 0) });
                    }}
                    className="mt-1 w-full rounded-md border border-gray-300 bg-white p-3 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
                  />
                </label>
                <div>
                  <div className="mb-2 text-sm font-bold text-slate-600">分類</div>
                  <div className="grid grid-cols-2 gap-2">
                    {costCategories.filter((category) => category.enabled).map((category) => (
                      <button
                        key={category.id}
                        onClick={() => setEditing({ ...editing, costCategoryId: category.id })}
                        className={`min-h-14 rounded-md px-4 text-sm font-bold ${
                          editing.costCategoryId === category.id ? "bg-mint text-slate-950" : "bg-slate-700 text-white"
                        }`}
                      >
                        {category.name}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="text-sm font-bold text-slate-600">
                  種別
                  <select
                    value={editing.type}
                    onChange={(event) => setEditing({ ...editing, type: event.target.value as CostType })}
                    className="mt-1 w-full rounded-md border border-gray-300 bg-white p-3 text-gray-900 focus:border-blue-500 focus:outline-none"
                  >
                    {Object.entries(typeLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <DateField label="日付" value={editing.date} onChange={(value) => setEditing({ ...editing, date: value })} />
                <label className="text-sm font-bold text-slate-600">
                  メモ
                  <textarea
                    value={editing.note}
                    onChange={(event) => setEditing({ ...editing, note: event.target.value })}
                    className="mt-1 min-h-24 w-full rounded-md border border-gray-300 bg-white p-3 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
                  />
                </label>
              </div>
            </div>
            <div className="flex gap-2 border-t border-line p-4">
              <button onClick={() => setCostModalOpen(false)} className="flex-1 rounded-md bg-slate-700 py-3 font-bold text-white">
                キャンセル
              </button>
              <button onClick={() => void submit()} className="flex-1 rounded-lg bg-mint font-black text-slate-950">
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CostListItem({
  cost,
  categoryName,
  typeLabel,
  meatUnitPriceBaseGrams,
  onSaveUnitPrice,
  onEdit,
  onDelete
}: {
  cost: CostRecord;
  categoryName: string;
  typeLabel: string;
  meatUnitPriceBaseGrams: number;
  onSaveUnitPrice: (mode: CostUnitPriceMode, baseGrams?: number) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const unitPriceLabel = getCostUnitPriceLabel(cost, categoryName, meatUnitPriceBaseGrams);
  const [editingUnit, setEditingUnit] = useState(false);
  const [draftMode, setDraftMode] = useState<CostUnitPriceMode>(cost.unitPriceMode ?? "gram");
  const [draftBaseGrams, setDraftBaseGrams] = useState(String(cost.unitPriceBaseGrams ?? meatUnitPriceBaseGrams ?? 20));

  const resetDraft = () => {
    setDraftMode(cost.unitPriceMode ?? "gram");
    setDraftBaseGrams(String(cost.unitPriceBaseGrams ?? meatUnitPriceBaseGrams ?? 20));
  };

  useEffect(() => {
    if (!editingUnit) resetDraft();
  }, [cost, editingUnit, meatUnitPriceBaseGrams]);

  const updateDraftBaseGrams = (raw: string) => {
    setDraftBaseGrams(raw.replace(/^0+(?=\d)/, ""));
  };

  const saveDraft = () => {
    const fallback = meatUnitPriceBaseGrams || 20;
    const parsed = Number(draftBaseGrams || fallback);
    const normalizedBaseGrams = Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    onSaveUnitPrice(draftMode, draftMode === "gram" ? normalizedBaseGrams : undefined);
    setEditingUnit(false);
  };

  const closeEditor = () => {
    resetDraft();
    setEditingUnit(false);
  };

  return (
    <article className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-gray-900">{cost.name}</h3>
          <p className="text-sm text-gray-500">
            {categoryName} / {typeLabel} / {cost.date}
          </p>
          {cost.note && <p className="mt-1 text-sm text-gray-500">{cost.note}</p>}
        </div>
        <div className="text-right">
          <strong className="text-amber-600">{yen(cost.amount)}</strong>
          {editingUnit ? (
            <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
              <input
                type="number"
                value={draftMode === "gram" ? draftBaseGrams : ""}
                placeholder={draftMode === "gram" ? "20" : "1"}
                onChange={(event) => updateDraftBaseGrams(event.target.value)}
                disabled={draftMode !== "gram"}
                className="w-20 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 placeholder:text-gray-400 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400 focus:border-blue-500 focus:outline-none"
              />
              <select
                value={draftMode}
                onChange={(event) => setDraftMode(event.target.value as CostUnitPriceMode)}
                className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
              >
                <option value="gram">g</option>
                <option value="kilogram">kg</option>
                <option value="piece">個</option>
              </select>
              <button onClick={saveDraft} className="rounded-md bg-mint px-3 py-1 text-xs font-black text-slate-950">
                確定
              </button>
              <button onClick={closeEditor} className="rounded-md bg-slate-700 px-3 py-1 text-xs font-bold text-white">
                閉じる
              </button>
            </div>
          ) : (
            <button onClick={() => setEditingUnit(true)} className="mt-1 block text-sm font-bold text-gray-600 underline decoration-dotted">
              単価 {unitPriceLabel ?? "設定"}
            </button>
          )}
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button onClick={onEdit} className="rounded-md bg-slate-700 px-4 py-2 font-bold text-white">
          編集
        </button>
        <button onClick={onDelete} className="rounded-md bg-danger px-4 py-2 font-bold text-white">
          削除
        </button>
      </div>
    </article>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="text-sm font-bold text-slate-600">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-md border border-gray-300 bg-white p-3 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
      />
    </label>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="text-sm font-bold text-slate-600">
      {label}
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-md border border-gray-300 bg-white p-3 text-gray-900 focus:border-blue-500 focus:outline-none"
      />
    </label>
  );
}
