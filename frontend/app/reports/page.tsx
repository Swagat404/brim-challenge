"use client";

import { useEffect, useState } from "react";
import {
  FileText,
  ChevronRight,
  Loader2,
  CheckCircle,
  Clock,
  XCircle,
  Send,
  Eye,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { getReports, getReport, updateReportStatus } from "@/lib/api";
import type { Report } from "@/lib/types";
import MerchantAvatar from "@/components/MerchantAvatar";
import PolicyBadge, { inferPolicyStatus } from "@/components/PolicyBadge";
import AIRecommendationCard from "@/components/AIRecommendationCard";

const PIE_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4", "#ec4899", "#f97316"];

const STATUS_CFG: Record<string, { icon: React.ReactNode; cls: string; label: string }> = {
  draft: { icon: <Clock className="w-3 h-3" />, cls: "text-zinc-600 bg-zinc-100 border-zinc-200/60", label: "Draft" },
  submitted: { icon: <Send className="w-3 h-3" />, cls: "text-zinc-600 bg-zinc-50 border-zinc-200/60", label: "Submitted" },
  approved: { icon: <CheckCircle className="w-3 h-3" />, cls: "text-zinc-600 bg-zinc-50 border-zinc-200/60", label: "Approved" },
  rejected: { icon: <XCircle className="w-3 h-3" />, cls: "text-zinc-600 bg-zinc-50 border-zinc-200/60", label: "Rejected" },
};

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [selected, setSelected] = useState<{
    report: Report;
    transactions: Array<Record<string, unknown> & { category_label?: string; is_fleet?: boolean; policy_flags?: string[] }>;
    category_breakdown?: Array<{ category: string; total: number; txn_count: number }>;
    policy_flags?: Array<{ merchant: string; amount: number; flags: string[] }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [updating, setUpdating] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await getReports({ status: statusFilter === "all" ? undefined : statusFilter });
      setReports(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [statusFilter]); // eslint-disable-line

  async function viewReport(id: number) {
    const detail = await getReport(id).catch(() => null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (detail) setSelected(detail as any);
  }

  async function changeStatus(id: number, status: string) {
    setUpdating(true);
    try {
      await updateReportStatus(id, status);
      await load();
      if (selected?.report.id === id) {
        const updated = await getReport(id).catch(() => null);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (updated) setSelected(updated as any);
      }
    } finally {
      setUpdating(false);
    }
  }

  const totalSpend = reports.reduce((s, r) => s + r.total_amount, 0);

  return (
    <div className="flex h-full bg-transparent">
      {/* Left: list */}
      <div className="w-[320px] flex-shrink-0 bg-white/70 backdrop-blur-xl border-r border-zinc-200/40 flex flex-col">
        <div className="px-6 py-6 border-b border-zinc-100">
          <h1 className="font-bold text-zinc-900 text-[24px] tracking-tight leading-none mb-1.5">Expense Reports</h1>
          <div className="flex items-center justify-between mt-5 w-full bg-zinc-100/50 p-1 rounded-full">
            {(["all", "draft", "submitted", "approved"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`flex-1 py-1.5 rounded-full text-[12px] font-bold capitalize transition-all duration-200 text-center ${
                  statusFilter === s
                    ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200/50"
                    : "text-zinc-500 hover:text-zinc-900"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {!loading && reports.length > 0 && (
          <div className="px-6 py-3.5 bg-zinc-50/80 border-b border-zinc-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-zinc-400" />
              <span className="text-[12px] font-medium text-zinc-500">
                {reports.length} report{reports.length !== 1 ? "s" : ""}
              </span>
            </div>
            <span className="text-[13px] font-bold text-zinc-900 tabular-nums">${totalSpend.toFixed(2)} CAD</span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
            </div>
          ) : reports.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-zinc-400 gap-3">
              <div className="w-12 h-12 rounded-full bg-zinc-50 flex items-center justify-center">
                <FileText className="w-5 h-5 text-zinc-400" />
              </div>
              <p className="text-[14px] font-bold text-zinc-900 tracking-tight">No {statusFilter} reports</p>
              <p className="text-[13px] text-center px-4 font-medium">
                Use the chat to generate expense reports
              </p>
            </div>
          ) : (
            reports.map((r) => {
              const cfg = STATUS_CFG[r.status] ?? STATUS_CFG.draft;
              return (
                <button
                  key={r.id}
                  onClick={() => viewReport(r.id)}
                  className={`w-full text-left px-5 py-4 rounded-[16px] transition-all duration-200 flex items-center justify-between gap-4 ${
                    selected?.report.id === r.id ? "bg-white shadow-[0_2px_10px_rgba(0,0,0,0.02)] ring-1 ring-zinc-200/50" : "hover:bg-zinc-50"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-bold text-zinc-900 truncate tracking-tight">
                      {r.employee_name ?? r.employee_id}
                    </p>
                    <p className="text-[12px] text-zinc-500 font-medium mt-1">
                      {r.period_start && r.period_end
                        ? `${r.period_start} → ${r.period_end}`
                        : r.created_at.slice(0, 10)}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0 flex flex-col items-end gap-1">
                    <p className="text-[15px] font-bold text-zinc-900 tabular-nums">${r.total_amount.toFixed(2)}</p>
                    <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">CAD</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-zinc-300 flex-shrink-0 ml-2" />
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right: detail */}
      <div className="flex-1 flex flex-col overflow-hidden bg-transparent">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-zinc-400 flex-col gap-3">
            <FileText className="w-10 h-10 opacity-50" />
            <p className="text-[15px] font-medium">Select a report to view details</p>
            <p className="text-[13px] text-center max-w-xs">
              Or ask the AI to generate a new report
            </p>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-10 py-8">
              {/* Header */}
              <div className="flex items-start justify-between mb-6 border-b border-zinc-100 pb-5">
                <div>
                  <h2 className="text-[24px] font-bold tracking-tight text-zinc-900 leading-none mb-1.5">Expense Report</h2>
                  <p className="text-[14px] text-zinc-500 font-medium">
                    <span className="text-zinc-900 font-semibold">
                      {selected.report.employee_name ?? selected.report.employee_id}
                    </span>
                    {selected.report.period_start && (
                      <> <span className="text-zinc-300 mx-2">·</span> {selected.report.period_start} to {selected.report.period_end}</>
                    )}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[24px] font-bold text-zinc-900 tabular-nums leading-none">
                    ${selected.report.total_amount.toFixed(2)}
                  </p>
                </div>
              </div>

              {/* Summary + Breakdown */}
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-6">
                <div className="col-span-3 bg-white rounded-[24px] border border-zinc-200/60 p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-[11px] uppercase tracking-wider text-zinc-400">Summary</h3>
                  </div>
                  {selected.report.summary && (
                    <p className="text-[14px] font-medium text-zinc-700 leading-relaxed bg-zinc-50/80 rounded-xl p-4 mb-4 border border-zinc-100">
                      {selected.report.summary}
                    </p>
                  )}

                    {selected.category_breakdown && selected.category_breakdown.length > 0 && (
                      <div className="mt-6 border-t border-zinc-100 pt-6">
                        <h4 className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-4">By Category</h4>
                        <div className="space-y-4">
                          {selected.category_breakdown.map((c, i) => (
                            <div key={i} className="flex items-center justify-between text-[13px]">
                              <div className="flex items-center gap-3">
                                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                                <span className="font-bold text-zinc-700">{c.category}</span>
                                <span className="text-[11px] font-medium text-zinc-400">({c.txn_count})</span>
                              </div>
                              <span className="font-bold text-zinc-900 tabular-nums">${c.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                </div>

                <div className="col-span-2 bg-white rounded-2xl border border-zinc-200/60 p-6 flex flex-col shadow-sm">
                  <h3 className="font-bold text-[11px] uppercase tracking-wider text-zinc-400 mb-2">Breakdown</h3>
                  {selected.category_breakdown && selected.category_breakdown.length > 0 ? (
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie
                          data={selected.category_breakdown.map(c => ({ name: c.category, value: Math.round(c.total * 100) / 100 }))}
                          cx="50%" cy="50%" innerRadius={45} outerRadius={80} dataKey="value" paddingAngle={2}
                        >
                          {selected.category_breakdown.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v) => [`$${Number(v).toFixed(2)}`, "Amount"]} contentStyle={{ fontSize: 13, borderRadius: 12, border: "1px solid #e4e4e7", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.05)", padding: "8px 12px" }} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-zinc-400 text-sm font-medium">No category data</div>
                  )}
                </div>
              </div>

              {/* Policy Flags */}
              {selected.policy_flags && selected.policy_flags.length > 0 && (
                <div className="mb-5">
                  <AIRecommendationCard
                    type="deny"
                    recommendation="Policy violations detected"
                    reasoning={selected.policy_flags
                      .map((f) => `${f.merchant} ($${f.amount.toFixed(2)}) — ${f.flags.join("; ")}`)
                      .join(". ")}
                  />
                </div>
              )}

              {/* Transactions table */}
              {selected.transactions.length > 0 && (
                <div className="bg-white rounded-[24px] border border-zinc-200/60 overflow-hidden shadow-sm">
                  <div className="px-6 py-5 border-b border-zinc-100 flex items-center justify-between">
                    <h3 className="text-[14px] font-bold text-zinc-900 tracking-tight">
                      {selected.transactions.length} transactions
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[13px]">
                      <thead>
                        <tr className="border-b border-zinc-100 bg-zinc-50">
                          <th className="text-left px-6 py-3 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Date</th>
                          <th className="text-left px-6 py-3 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Merchant</th>
                          <th className="text-left px-6 py-3 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Category</th>
                          <th className="text-center px-4 py-3 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Status</th>
                          <th className="text-right px-6 py-3 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {selected.transactions.map((t, i) => {
                          const flags = (t.policy_flags as string[] | undefined) ?? [];
                          const merchant = String(t.merchant_info_dba_name ?? t.merchant ?? "---");
                          const mcc = Number(t.merchant_category_code ?? t.mcc ?? 0);
                          return (
                            <tr key={i} className={`hover:bg-zinc-50 transition-colors ${flags.length > 0 ? "bg-red-50/40" : ""}`}>
                              <td className="px-6 py-4 text-zinc-600 text-[12px] font-medium whitespace-nowrap tabular-nums">
                                {String(t.transaction_date ?? "").slice(0, 10)}
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                  <MerchantAvatar merchant={merchant} mcc={mcc} size="sm" />
                                  <div className="flex flex-col">
                                    <span className="font-semibold text-zinc-900">{merchant}</span>
                                    {flags.length > 0 && (
                                      <span className="text-[10px] font-medium text-red-600 mt-0.5 truncate max-w-[200px]">{flags.join(", ")}</span>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-zinc-600 font-medium">
                                {t.category_label ?? t.transaction_category ?? "---"}
                                {t.is_fleet && <span className="ml-2 inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold bg-zinc-100 text-zinc-700 uppercase">Fleet</span>}
                              </td>
                              <td className="px-4 py-4 text-center">
                                <PolicyBadge status={inferPolicyStatus({ policyFlags: flags })} />
                              </td>
                              <td className="px-6 py-4 text-right font-bold text-zinc-900 tabular-nums">
                                ${Number(t.amount_cad ?? 0).toFixed(2)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-zinc-200 bg-zinc-50/50">
                          <td colSpan={4} className="px-6 py-4 text-[14px] font-bold text-zinc-700 uppercase tracking-wider">Total</td>
                          <td className="px-6 py-4 text-right text-[16px] font-bold text-zinc-900 tabular-nums">
                            ${selected.report.total_amount.toFixed(2)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Action bar */}
            <div className="bg-white border-t border-zinc-200/60 px-10 py-5 flex items-center justify-between flex-shrink-0 shadow-[0_-4px_10px_rgba(0,0,0,0.02)]">
              <div className="flex items-center gap-4">
                <p className="text-[12px] font-medium text-zinc-500">
                  Created {selected.report.created_at.slice(0, 10)} <span className="mx-2 text-zinc-300">·</span> Report #{selected.report.id}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {selected.report.status === "draft" && (
                  <button
                    onClick={() => changeStatus(selected.report.id, "submitted")}
                    disabled={updating}
                    className="flex items-center gap-2 px-6 py-2.5 bg-zinc-900 hover:bg-black text-white rounded-[12px] text-[14px] font-bold transition-all shadow-sm disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                    {updating ? "Submitting..." : "Submit for approval"}
                  </button>
                )}
                {selected.report.status === "submitted" && (
                  <>
                    <button
                      onClick={() => changeStatus(selected.report.id, "rejected")}
                      disabled={updating}
                      className="flex items-center gap-2 px-6 py-2.5 border border-zinc-200 text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 rounded-[12px] text-[14px] font-bold transition-all duration-200 disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4 text-rose-500" />
                      Reject
                    </button>
                    <button
                      onClick={() => changeStatus(selected.report.id, "approved")}
                      disabled={updating}
                      className="flex items-center gap-2 px-6 py-2.5 bg-zinc-900 hover:bg-black text-white rounded-[12px] text-[14px] font-bold transition-all shadow-sm disabled:opacity-50"
                    >
                      <CheckCircle className="w-4 h-4" />
                      {updating ? "Processing..." : "Approve"}
                    </button>
                  </>
                )}
                {selected.report.status === "approved" && (
                  <div className="flex items-center gap-2 px-4 py-2 bg-zinc-50 text-zinc-700 rounded-lg text-[13px] font-bold border border-zinc-200/60">
                    <CheckCircle className="w-4 h-4" />
                    Approved
                  </div>
                )}
                {selected.report.status === "rejected" && (
                  <div className="flex items-center gap-2 px-4 py-2 bg-zinc-50 text-zinc-700 rounded-lg text-[13px] font-bold border border-zinc-200/60">
                    <XCircle className="w-4 h-4" />
                    Rejected
                  </div>
                )}
                <button
                  onClick={() => viewReport(selected.report.id)}
                  className="flex items-center gap-2 px-5 py-2.5 border border-zinc-200 text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 rounded-[12px] text-[13px] font-bold transition-all duration-200 ml-2"
                >
                  <Eye className="w-4 h-4" /> Refresh
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
