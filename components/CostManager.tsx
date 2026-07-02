"use client";

import { useEffect, useMemo, useState } from "react";
import { getCostUnitPriceLabel, isMeatCategoryName, yen } from "@/lib/calculations";
import { useAppStore } from "@/store/useAppStore";
import type { CostCategory, CostRecord, CostType, CostUnitPriceMode } from "@/types";

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

  useEffect(() => {
    setEditing((current) => ({ ...current, sessionId: selectedSession?.id, costCategoryId: current.costCategoryId || firstCategoryId }));
  }, [firstCategoryId, selectedSession?.id]);

  useEffect(() => {
    setAmountText(editing.amount === 0 ? "" : String(editing.amount));
  }, [editing.amount]);

  const total = costs.reduce((sum, cost) => sum + cost.amount, 0);
  const costCategoryMap = useMemo(() => new Map(costCategories.map((category) => [category.id, category.name])), [costCategories]);
  const filteredCosts = useMemo(
    () => costs.filter((cost) => !filterCategoryId || cost.costCategoryId === filterCategoryId),
    [costs, filterCategoryId]
  );
  const categoryTotals = useMemo(() => {
    const amounts = costCategories
      .filter((category) => category.enabled)
      .map((category) => ({
        id: category.id,
        name: category.name,
        amount: costs.filter((cost) => cost.costCategoryId === category.id).reduce((sum, cost) => sum + cost.amount, 0)
      }));
    const maxAmount = Math.max(1, ...amounts.map((item) => item.amount));
    return amounts.map((item) => ({ ...item, ratio: item.amount / maxAmount }));
  }, [costCategories, costs]);

  const isNewCost = !editing.name;

  const openNewCost = () => {
    setEditing(blankCost(selectedSession?.id));
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
      sessionId: selectedSession?.id,
      costCategoryId: editing.costCategoryId || firstCategoryId,
      amount: Number(amountText || 0)
    });
    setEditing(blankCost(selectedSession?.id));
    setAmountText("");
    setCostModalOpen(false);
  };

  const submitCategory = async () => {
    if (!editingCategory.name.trim()) return;
    await saveCostCategory({
      ...editingCategory,
      sortOrder: editingCategory.sortOrder || Math.max(0, ...costCategories.map((category) => category.sortOrder)) + 10
    });
    setEditingCategory(blankCostCategory(Math.max(0, ...costCategories.map((category) => category.sortOrder)) + 20));
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

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black text-gray-900">コスト一覧</h2>
              {sessions.length > 0 ? (
                <label className="mt-1 flex items-center gap-2 text-sm text-gray-500">
                  表示中の営業回
                  <select
                    value={selectedSession?.id ?? ""}
                    onChange={(event) => {
                      if (event.target.value) void selectSession(event.target.value);
                    }}
                    className="rounded-md border border-gray-300 bg-white px-2 py-1 font-bold text-gray-900 focus:border-blue-500 focus:outline-none"
                  >
                    {!selectedSession && <option value="">選択してください</option>}
                    {sessions.map((session) => (
                      <option key={session.id} value={session.id}>
                        {session.name}（{session.date}）
                      </option>
                    ))}
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
                ＋ コストを追加
              </button>
            </div>
          </div>

          <div className="mt-4 space-y-2 rounded-lg border border-gray-200 bg-white p-3">
            {categoryTotals.map((item, index) => (
              <div key={item.id}>
                <div className="flex items-center justify-between text-sm text-gray-900">
                  <span>{item.name}</span>
                  <strong>{yen(item.amount)}</strong>
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
                onSaveUnitPrice={(mode, baseGrams) => void saveCost({ ...cost, unitPriceMode: mode, unitPriceBaseGrams: baseGrams })}
                onEdit={() => openEditCost(cost)}
                onDelete={() => {
                  if (confirm("このコストを削除しますか？")) void deleteCost(cost.id);
                }}
              />
            ))}
            {filteredCosts.length === 0 && (
              <p className="text-gray-500">
                表示できるコスト記録がありません。
                {sessions.length > 1 && "他の営業回にコストが記録されている場合は、上の「表示中の営業回」から切り替えてください。"}
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
                    <div className="text-sm text-gray-500">{category.enabled ? "有効" : "停止"}</div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setEditingCategory(category)} className="rounded-md bg-slate-700 px-3 py-2 font-bold text-white">
                      編集
                    </button>
                    <button
                      onClick={() => {
                        if (confirm("この分類を削除しますか？既存データはその他へ移動します。")) void deleteCostCategory(category.id);
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
              ＋ 新規分類
            </button>
          </div>
        </aside>
      </div>

      {costModalOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
          <div className="flex max-h-[92vh] w-full max-w-xl flex-col rounded-lg border border-line bg-white shadow-soft">
            <div className="flex-1 overflow-y-auto p-5">
              <h2 className="text-xl font-black">{isNewCost ? "コストを追加" : "コスト編集"}</h2>
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
                  会計区分
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
                <Field label="日付" value={editing.date} onChange={(value) => setEditing({ ...editing, date: value })} />
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
  const isMeat = isMeatCategoryName(categoryName);
  const unitPriceLabel = getCostUnitPriceLabel(cost, categoryName, meatUnitPriceBaseGrams);
  const [editingUnit, setEditingUnit] = useState(false);
  const [draftMode, setDraftMode] = useState<CostUnitPriceMode>(cost.unitPriceMode ?? "gram");
  const [draftBaseGrams, setDraftBaseGrams] = useState(String(cost.unitPriceBaseGrams ?? meatUnitPriceBaseGrams ?? 20));

  const applyMode = (mode: CostUnitPriceMode) => {
    setDraftMode(mode);
    onSaveUnitPrice(mode, mode === "gram" ? Number(draftBaseGrams || meatUnitPriceBaseGrams || 20) : undefined);
  };

  const applyBaseGrams = (raw: string) => {
    const next = raw.replace(/^0+(?=\d)/, "");
    setDraftBaseGrams(next);
    const parsed = Number(next);
    if (next && parsed > 0) onSaveUnitPrice("gram", parsed);
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
          {isMeat ? (
            editingUnit ? (
              <div className="mt-1 flex items-center justify-end gap-1">
                <select
                  value={draftMode}
                  onChange={(event) => applyMode(event.target.value as CostUnitPriceMode)}
                  className="rounded-md border border-gray-300 bg-white px-1 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
                >
                  <option value="gram">g</option>
                  <option value="kilogram">kg</option>
                  <option value="piece">個</option>
                </select>
                {draftMode === "gram" && (
                  <input
                    type="number"
                    value={draftBaseGrams}
                    onChange={(event) => applyBaseGrams(event.target.value)}
                    className="w-16 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
                  />
                )}
                <button onClick={() => setEditingUnit(false)} className="rounded-md bg-slate-700 px-2 py-1 text-xs font-bold text-white">
                  閉じる
                </button>
              </div>
            ) : (
              <button onClick={() => setEditingUnit(true)} className="mt-1 block text-sm font-bold text-gray-600 underline decoration-dotted">
                単価 {unitPriceLabel ?? "設定"}
              </button>
            )
          ) : (
            unitPriceLabel && <p className="mt-1 text-sm font-bold text-gray-600">単価 {unitPriceLabel}</p>
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
