"use client";

import { useEffect, useState } from "react";
import { Wallet, Loader2 } from "lucide-react";
import { getDepartmentBudgets, setDepartmentBudget, removeDepartmentBudget } from "@/lib/api";
import type { DepartmentBudget } from "@/lib/types";

function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export default function DepartmentBudgetsTable() {
  const [rows, setRows] = useState<DepartmentBudget[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      setRows(await getDepartmentBudgets());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function save(dept: string) {
    const raw = edit[dept];
    const v = parseFloat(raw);
    if (!Number.isFinite(v) || v < 0) return;
    setSaving(dept);
    try {
      await setDepartmentBudget(dept, v);
      setEdit({ ...edit, [dept]: "" });
      await load();
    } finally {
      setSaving(null);
    }
  }

  async function remove(dept: string) {
    setSaving(dept);
    try {
      await removeDepartmentBudget(dept);
      await load();
    } finally {
      setSaving(null);
    }
  }

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
        <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center">
          <Wallet className="w-4 h-4 text-zinc-600" />
        </div>
        <div className="flex-1">
          <h3 className="text-[14px] font-bold tracking-tight text-zinc-900">Department monthly caps</h3>
          <p className="text-[12px] text-zinc-500 font-medium">
            Caps are read by Sift when assembling pre-approval context.
          </p>
        </div>
      </div>

      <table className="w-full text-[13px]">
        <thead>
          <tr className="bg-zinc-50/80 border-b border-zinc-100">
            <th className="text-left px-6 py-2.5 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Department</th>
            <th className="text-right px-4 py-2.5 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">MTD spend</th>
            <th className="text-right px-4 py-2.5 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Cap</th>
            <th className="text-left px-4 py-2.5 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">% Used</th>
            <th className="text-right px-6 py-2.5 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Edit</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {rows.map((r) => (
            <tr key={r.department} className="hover:bg-zinc-50/60">
              <td className="px-6 py-3 font-bold text-zinc-800">
                {r.department}
                <span className="text-zinc-400 font-medium ml-2">· {r.active_employees}</span>
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-zinc-700 font-medium">
                {fmtMoney(r.mtd_spend)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {r.has_cap ? (
                  <span className="font-bold text-zinc-900">{fmtMoney(r.monthly_cap)}</span>
                ) : (
                  <span className="text-zinc-400 italic">No cap</span>
                )}
              </td>
              <td className="px-4 py-3">
                {r.has_cap ? (
                  <UsageBar pct={r.pct_used ?? 0} />
                ) : (
                  <span className="text-zinc-300">—</span>
                )}
              </td>
              <td className="px-6 py-3">
                <div className="flex items-center gap-2 justify-end">
                  <input
                    type="number"
                    value={edit[r.department] ?? ""}
                    onChange={(e) => setEdit({ ...edit, [r.department]: e.target.value })}
                    placeholder={r.has_cap ? String(r.monthly_cap) : "Set cap"}
                    className="w-24 px-2 py-1 text-right text-[12.5px] tabular-nums bg-white border border-zinc-200 rounded outline-none focus:border-zinc-900"
                  />
                  <button
                    onClick={() => save(r.department)}
                    disabled={saving === r.department || !edit[r.department]}
                    className="px-3 py-1 rounded bg-zinc-900 text-white text-[11.5px] font-bold hover:bg-black disabled:opacity-50"
                  >
                    Save
                  </button>
                  {r.has_cap && (
                    <button
                      onClick={() => remove(r.department)}
                      disabled={saving === r.department}
                      className="text-[11px] font-medium text-zinc-400 hover:text-rose-700"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UsageBar({ pct }: { pct: number }) {
  const clamped = Math.min(100, Math.max(0, pct));
  const tone = pct >= 100 ? "bg-rose-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
        <div className={`h-full ${tone}`} style={{ width: `${clamped}%` }} />
      </div>
      <span className="text-[11.5px] font-bold tabular-nums text-zinc-600">{pct.toFixed(0)}%</span>
    </div>
  );
}
