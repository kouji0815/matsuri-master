"use client";

import { useEffect, useMemo, useState } from "react";
import { yen } from "@/lib/calculations";
import { useAppStore } from "@/store/useAppStore";
import type { CostCategory, CostRecord, CostType } from "@/types";

const typeLabels: Record<CostType, string> = {
  fixed: "固定費",
  purchase: "仕入れ",
  supply: "消耗品",
  transport: "交通費",
  other: "その他"
};

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
    selectedSession,
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
    <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
      <section className="space-y-4">
        <div className="rounded-lg border border-line bg-panel p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black text-white">コスト一覧</h2>
              <p className="text-sm text-slate-300">{selectedSession?.name ?? "営業場次を選択してください"}</p>
            </div>
            <div className="text-right">
              <div className="text-sm text-slate-300">合計</div>
              <div className="text-2xl font-black text-amber-300">{yen(total)}</div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => setFilterCategoryId("")}
              className={`min-h-12 rounded-md px-4 font-bold ${filterCategoryId === "" ? "bg-mint text-slate-950" : "bg-slate-700 text-white"}`}
            >
              すべて
            </button>
            {costCategories.filter((category) => category.enabled).map((category) => (
              <button
                key={category.id}
                onClick={() => setFilterCategoryId(category.id)}
                className={`min-h-12 rounded-md px-4 font-bold ${
                  filterCategoryId === category.id ? "bg-mint text-slate-950" : "bg-slate-700 text-white"
                }`}
              >
                {category.name}
              </button>
            ))}
          </div>

          <div className="mt-4 space-y-3">
            {filteredCosts.map((cost) => (
              <article key={cost.id} className="rounded-lg border border-line bg-slate-900 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-black text-white">{cost.name}</h3>
                    <p className="text-sm text-slate-300">
                      {costCategoryMap.get(cost.costCategoryId) ?? "その他"} / {typeLabels[cost.type]} / {cost.date}
                    </p>
                    {cost.note && <p className="mt-1 text-sm text-slate-300">{cost.note}</p>}
                  </div>
                  <strong className="text-amber-300">{yen(cost.amount)}</strong>
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => {
                      setEditing(cost);
                      setAmountText(cost.amount === 0 ? "" : String(cost.amount));
                    }}
                    className="rounded-md bg-slate-700 px-4 py-2 font-bold text-white"
                  >
                    編集
                  </button>
                  <button
                    onClick={() => {
                      if (confirm("このコストを削除しますか？")) void deleteCost(cost.id);
                    }}
                    className="rounded-md bg-danger px-4 py-2 font-bold text-white"
                  >
                    削除
                  </button>
                </div>
              </article>
            ))}
            {filteredCosts.length === 0 && <p className="text-slate-300">表示できるコスト記録がありません。</p>}
          </div>
        </div>

        <section className="rounded-lg border border-line bg-panel p-4">
          <h2 className="text-xl font-black text-white">分類管理</h2>
          <div className="mt-3 space-y-2">
            {costCategories.map((category) => (
              <div key={category.id} className="rounded-md bg-slate-900 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-black text-white">{category.name}</div>
                    <div className="text-sm text-slate-300">{category.enabled ? "有効" : "停止"}</div>
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
            <label className="flex items-center gap-3 rounded-md bg-slate-900 p-3 font-bold text-white">
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
              新規分類
            </button>
          </div>
        </section>
      </section>

      <aside className="rounded-lg border border-line bg-panel p-4">
        <h2 className="text-xl font-black text-white">コスト入力</h2>
        <div className="mt-4 grid gap-3">
          <Field label="名称" value={editing.name} onChange={(value) => setEditing({ ...editing, name: value })} />
          <label className="text-sm font-bold text-slate-200">
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
              className="mt-1 w-full rounded-md border border-line bg-slate-950 p-3 text-white"
            />
          </label>
          <div>
            <div className="mb-2 text-sm font-bold text-slate-200">分類</div>
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
          <label className="text-sm font-bold text-slate-200">
            会計区分
            <select
              value={editing.type}
              onChange={(event) => setEditing({ ...editing, type: event.target.value as CostType })}
              className="mt-1 w-full rounded-md border border-line bg-slate-950 p-3 text-white"
            >
              {Object.entries(typeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <Field label="日付" value={editing.date} onChange={(value) => setEditing({ ...editing, date: value })} />
          <label className="text-sm font-bold text-slate-200">
            メモ
            <textarea
              value={editing.note}
              onChange={(event) => setEditing({ ...editing, note: event.target.value })}
              className="mt-1 min-h-24 w-full rounded-md border border-line bg-slate-950 p-3 text-white"
            />
          </label>
          <button onClick={submit} className="min-h-14 rounded-lg bg-mint font-black text-slate-950">
            保存
          </button>
          <button
            onClick={() => {
              setEditing(blankCost(selectedSession?.id));
              setAmountText("");
            }}
            className="rounded-md bg-slate-700 py-3 font-bold text-white"
          >
            新規入力
          </button>
        </div>
      </aside>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="text-sm font-bold text-slate-200">
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-md border border-line bg-slate-950 p-3 text-white" />
    </label>
  );
}
