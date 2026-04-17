"use client";

import { useEffect, useState } from "react";
import { Users, Loader2, Check } from "lucide-react";
import { getEmployeeBudgets, setEmployeeBudget } from "@/lib/api";
import type { EmployeeBudget } from "@/lib/types";

export default function EmployeeBudgetsTable() {
  const [rows, setRows] = useState<EmployeeBudget[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [savedRecently, setSavedRecently] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      setRows(await getEmployeeBudgets());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function save(id: string) {
    const raw = edits[id];
    const v = parseFloat(raw);
    if (!Number.isFinite(v) || v < 0) return;
    setSaving(id);
    try {
      await setEmployeeBudget(id, v);
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, monthly_budget: v } : r)));
      setEdits((e) => { const next = { ...e }; delete next[id]; return next; });
      setSavedRecently(id);
      setTimeout(() => setSavedRecently((s) => (s === id ? null : s)), 1500);
    } finally {
      setSaving(null);
    }
  }

  const departments = Array.from(new Set(rows.map((r) => r.department))).sort();
  const visible = filter === "all" ? rows : rows.filter((r) => r.department === filter);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-zinc-400">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-white border border-zinc-200/70 rounded-[20px] shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-zinc-100 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center flex-shrink-0">
          <Users className="w-4 h-4 text-zinc-600" />
        </div>
        <div className="flex-1">
          <h3 className="text-[14px] font-bold tracking-tight text-zinc-900">Per-employee monthly budgets</h3>
          <p className="text-[12px] text-zinc-500 font-medium">
            Sift uses each employee&apos;s budget when reasoning about spend pace.
          </p>
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="text-[12.5px] font-medium bg-white border border-zinc-200 rounded-[10px] px-3 py-1.5 outline-none focus:border-zinc-900"
        >
          <option value="all">All departments ({rows.length})</option>
          {departments.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>

      <div className="max-h-[480px] overflow-y-auto">
        <table className="w-full text-[13px]">
          <thead className="sticky top-0 bg-zinc-50/95 backdrop-blur-sm">
            <tr className="border-b border-zinc-100">
              <th className="text-left px-6 py-2.5 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Employee</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Role</th>
              <th className="text-right px-4 py-2.5 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Budget</th>
              <th className="text-right px-6 py-2.5 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Edit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {visible.map((r) => (
              <tr key={r.id} className="hover:bg-zinc-50/60">
                <td className="px-6 py-3">
                  <div className="font-bold text-zinc-800">{r.name}</div>
                  <div className="text-[11px] text-zinc-400 font-medium">{r.department} · {r.id}</div>
                </td>
                <td className="px-4 py-3 text-zinc-600 font-medium">{r.role}</td>
                <td className="px-4 py-3 text-right tabular-nums font-bold text-zinc-900">
                  ${r.monthly_budget.toLocaleString()}
                </td>
                <td className="px-6 py-3">
                  <div className="flex items-center gap-2 justify-end">
                    <input
                      type="number"
                      value={edits[r.id] ?? ""}
                      onChange={(e) => setEdits({ ...edits, [r.id]: e.target.value })}
                      placeholder="New value"
                      className="w-24 px-2 py-1 text-right text-[12.5px] tabular-nums bg-white border border-zinc-200 rounded outline-none focus:border-zinc-900"
                    />
                    <button
                      onClick={() => save(r.id)}
                      disabled={saving === r.id || !edits[r.id]}
                      className="px-3 py-1 rounded bg-zinc-900 text-white text-[11.5px] font-bold hover:bg-black disabled:opacity-50"
                    >
                      Save
                    </button>
                    {savedRecently === r.id && <Check className="w-4 h-4 text-emerald-600" />}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
