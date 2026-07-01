"use client";

import { useEffect, useState } from "react";
import type { CostRecord, CostType } from "@/types";
import { yen } from "@/lib/calculations";
import { useAppStore } from "@/store/useAppStore";

const typeLabels: Record<CostType, string> = {
  fixed: "固定費",
  purchase: "仕入れ",
  supply: "消耗品",
  transport: "交通費",
  other: "その他"
};

const blankCost = (sessionId?: string): CostRecord => ({
  id: `cost-${crypto.randomUUID()}`,
  sessionId,
  name: "",
  amount: 0,
  type: "fixed",
  note: "",
  date: new Date().toISOString().slice(0, 10),
  createdAt: new Date().toISOString()
});

export default function CostManager() {
  const { costs, selectedSession, saveCost, deleteCost } = useAppStore();
  const [editing, setEditing] = useState<CostRecord>(blankCost(selectedSession?.id));
  const total = costs.reduce((sum, cost) => sum + cost.amount, 0);

  const submit = async () => {
    if (!editing.name.trim()) return;
    await saveCost({ ...editing, sessionId: selectedSession?.id });
    setEditing(blankCost(selectedSession?.id));
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <section className="rounded-lg border border-line bg-panel p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black">コスト管理</h2>
            <p className="text-sm text-slate-600">{selectedSession?.name ?? "営業回未選択"}</p>
          </div>
          <div className="text-right">
            <div className="text-sm text-slate-600">合計</div>
            <div className="text-2xl font-black text-amber">{yen(total)}</div>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          {costs.map((cost) => (
            <article key={cost.id} className="rounded-lg border border-line bg-ink p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-black">{cost.name}</h3>
                  <p className="text-sm text-slate-600">
                    {typeLabels[cost.type]} / {cost.date}
                  </p>
                  {cost.note && <p className="mt-1 text-sm text-slate-600">{cost.note}</p>}
                </div>
                <strong className="text-amber">{yen(cost.amount)}</strong>
              </div>
              <div className="mt-3 flex gap-2">
                <button onClick={() => setEditing(cost)} className="rounded-md bg-slate-700 px-4 py-2 font-bold text-white">
                  編集
                </button>
                <button
                  onClick={() => {
                    if (confirm("このコストを削除しますか？")) void deleteCost(cost.id);
                  }}
                  className="rounded-md bg-danger px-4 py-2 font-bold"
                >
                  削除
                </button>
              </div>
            </article>
          ))}
          {costs.length === 0 && <p className="text-slate-600">まだコスト記録がありません。</p>}
        </div>
      </section>

      <aside className="rounded-lg border border-line bg-panel p-4">
        <h2 className="text-xl font-black">コスト入力</h2>
        <div className="mt-4 grid gap-3">
          <Field label="名称" value={editing.name} onChange={(value) => setEditing({ ...editing, name: value })} />
          <NumberField label="金額" value={editing.amount} onChange={(value) => setEditing({ ...editing, amount: value })} />
          <label className="text-sm font-bold text-slate-600">
            種類
            <select value={editing.type} onChange={(event) => setEditing({ ...editing, type: event.target.value as CostType })} className="mt-1 w-full rounded-md border border-line bg-ink p-3">
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
            <textarea value={editing.note} onChange={(event) => setEditing({ ...editing, note: event.target.value })} className="mt-1 min-h-24 w-full rounded-md border border-line bg-ink p-3" />
          </label>
          <button onClick={submit} className="min-h-14 rounded-lg bg-mint font-black text-slate-950">
            保存
          </button>
          <button onClick={() => setEditing(blankCost(selectedSession?.id))} className="rounded-md bg-slate-700 py-3 font-bold text-white">
            新規入力
          </button>
        </div>
      </aside>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="text-sm font-bold text-slate-600">
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-md border border-line bg-ink p-3 text-slate-950" />
    </label>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const [text, setText] = useState(value === 0 ? "" : String(value));

  useEffect(() => {
    setText(value === 0 ? "" : String(value));
  }, [value]);

  const handleChange = (raw: string) => {
    const next = raw.replace(/^0+(?=\d)/, "");
    setText(next);
    onChange(Number(next || 0));
  };

  return (
    <label className="text-sm font-bold text-slate-600">
      {label}
      <input type="number" value={text} placeholder="金額" onChange={(event) => handleChange(event.target.value)} className="mt-1 w-full rounded-md border border-line bg-ink p-3 text-slate-950" />
    </label>
  );
}
