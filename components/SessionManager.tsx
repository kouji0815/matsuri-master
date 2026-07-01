"use client";

import { useState } from "react";
import type { Session } from "@/types";
import { yen } from "@/lib/calculations";
import { useAppStore } from "@/store/useAppStore";

const blankSession = (targetSales: number): Session => ({
  id: `session-${crypto.randomUUID()}`,
  name: "",
  date: new Date().toISOString().slice(0, 10),
  location: "",
  targetSales,
  status: "planned",
  createdAt: new Date().toISOString()
});

export default function SessionManager() {
  const { sessions, selectedSession, activeSession, settings, saveSession, deleteSession, selectSession, startSession } = useAppStore();
  const [editing, setEditing] = useState<Session>(blankSession(settings.defaultTargetSales));
  const [message, setMessage] = useState("");

  const submit = async () => {
    if (!editing.name.trim()) return;
    await saveSession(editing);
    setEditing(blankSession(settings.defaultTargetSales));
  };

  const start = async (id: string) => {
    const result = await startSession(id);
    setMessage(result.ok ? "営業を開始しました" : result.message ?? "開始できませんでした");
  };

  const remove = async (session: Session) => {
    if (session.status === "open") {
      setMessage("営業中の回は削除できません。先に収店してください。");
      return;
    }
    if (confirm(`${session.name} を削除しますか？売上とコスト記録も削除されます。`)) {
      await deleteSession(session.id);
      setMessage("営業回を削除しました");
    }
  };

  return (
    <section className="rounded-lg border border-line bg-panel p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black">営業回</h2>
          <p className="text-sm text-slate-500">未終了の営業は自動で復元されます。</p>
        </div>
        {activeSession && <span className="rounded-md bg-mint px-3 py-2 font-black text-slate-950">営業中</span>}
      </div>
      {message && <p className="mt-3 rounded-md bg-mint/15 p-3 text-sm font-bold text-emerald-700">{message}</p>}
      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          {sessions.map((session) => (
            <article key={session.id} className={`rounded-lg border p-4 ${selectedSession?.id === session.id ? "border-mint bg-mint/10" : "border-line bg-white"}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-black">{session.name}</h3>
                  <p className="text-sm text-slate-500">
                    {session.date} / {session.location || "場所未設定"} / 目標 {yen(session.targetSales)}
                  </p>
                </div>
                <Status status={session.status} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={() => void selectSession(session.id)} className="rounded-md bg-slate-700 px-4 py-2 font-bold text-white">
                  表示
                </button>
                <button onClick={() => setEditing(session)} className="rounded-md bg-slate-700 px-4 py-2 font-bold text-white">
                  編集
                </button>
                <button onClick={() => void start(session.id)} className="rounded-md bg-mint px-4 py-2 font-black text-slate-950">
                  開始
                </button>
                <button onClick={() => void remove(session)} className="rounded-md bg-danger px-4 py-2 font-black text-white">
                  削除
                </button>
              </div>
            </article>
          ))}
        </div>

        <aside className="rounded-lg border border-line bg-white p-4">
          <h3 className="text-xl font-black">営業回編集</h3>
          <div className="mt-4 grid gap-3">
            <Field label="営業回名" value={editing.name} onChange={(value) => setEditing({ ...editing, name: value })} />
            <Field label="日付" value={editing.date} onChange={(value) => setEditing({ ...editing, date: value })} />
            <Field label="場所" value={editing.location} onChange={(value) => setEditing({ ...editing, location: value })} />
            <NumberField label="売上目標" value={editing.targetSales} onChange={(value) => setEditing({ ...editing, targetSales: value })} />
            <button onClick={submit} className="min-h-14 rounded-lg bg-mint font-black text-slate-950">
              保存
            </button>
            <button onClick={() => setEditing(blankSession(settings.defaultTargetSales))} className="rounded-md bg-slate-700 py-3 font-bold text-white">
              新規入力
            </button>
          </div>
        </aside>
      </div>
    </section>
  );
}

function Status({ status }: { status: Session["status"] }) {
  const label = status === "open" ? "営業中" : status === "closed" ? "終了" : "未開始";
  const tone = status === "open" ? "bg-mint text-slate-950" : status === "closed" ? "bg-slate-700 text-white" : "bg-amber text-slate-950";
  return <span className={`rounded-md px-2 py-1 text-xs font-black ${tone}`}>{label}</span>;
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="text-sm font-bold text-slate-600">
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-md border border-line bg-white p-3 text-slate-950" />
    </label>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="text-sm font-bold text-slate-600">
      {label}
      <input type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-1 w-full rounded-md border border-line bg-white p-3 text-slate-950" />
    </label>
  );
}
