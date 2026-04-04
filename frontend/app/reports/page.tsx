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
  DollarSign,
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
  draft: { icon: <Clock className="w-3 h-3" />, cls: "text-slate-600 bg-slate-100", label: "Draft" },
  submitted: { icon: <Send className="w-3 h-3" />, cls: "text-blue-600 bg-blue-50", label: "Submitted" },
  approved: { icon: <CheckCircle className="w-3 h-3" />, cls: "text-green-600 bg-green-50", label: "Approved" },
  rejected: { icon: <XCircle className="w-3 h-3" />, cls: "text-red-600 bg-red-50", label: "Rejected" },
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
    <div className="flex h-screen">
      {/* Left: list */}
      <div className="w-[320px] flex-shrink-0 bg-white border-r border-slate-200/80 flex flex-col">
        <div className="px-4 py-4 border-b border-slate-100">
          <h1 className="font-semibold text-slate-900 text-[15px]">Expense Reports</h1>
          <div className="flex gap-1 mt-3 flex-wrap">
            {(["all", "draft", "submitted", "approved"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium capitalize transition-colors ${
                  statusFilter === s ? "bg-green-100 text-green-800" : "text-slate-500 hover:bg-slate-100"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {!loading && reports.length > 0 && (
          <div className="px-4 py-2.5 bg-slate-50/50 border-b border-slate-100 flex items-center gap-2">
            <DollarSign className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-[11px] text-slate-600">
              {reports.length} report{reports.length !== 1 ? "s" : ""} ·{" "}
              <span className="font-semibold tabular-nums">${totalSpend.toFixed(2)} CAD</span>
            </span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
          ) : reports.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-slate-400 gap-2">
              <FileText className="w-7 h-7" />
              <p className="text-sm">No {statusFilter} reports</p>
              <p className="text-[11px] text-center px-4">
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
                  className={`w-full text-left px-4 py-3 hover:bg-slate-50/50 transition-colors flex items-center justify-between gap-2 ${
                    selected?.report.id === r.id ? "bg-green-50/60" : ""
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-slate-900 truncate">
                      {r.employee_name ?? r.employee_id}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {r.period_start && r.period_end
                        ? `${r.period_start} → ${r.period_end}`
                        : r.created_at.slice(0, 10)}
                    </p>
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold mt-1 ${cfg.cls}`}>
                      {cfg.icon} {cfg.label}
                    </span>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[13px] font-semibold text-slate-900 tabular-nums">${r.total_amount.toFixed(2)}</p>
                    <p className="text-[10px] text-slate-400">CAD</p>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right: detail */}
      <div className="flex-1 flex flex-col overflow-hidden bg-[#f8fafb]">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-slate-400 flex-col gap-2">
            <FileText className="w-10 h-10" />
            <p className="text-sm">Select a report to view details</p>
            <p className="text-[11px] text-center max-w-xs">
              Or ask the AI to generate a new report
            </p>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-7 py-5">
              {/* Header */}
              <div className="flex items-start justify-between mb-1">
                <h2 className="text-xl font-bold text-slate-900">Expense Report</h2>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[13px] font-medium ${STATUS_CFG[selected.report.status]?.cls ?? ""}`}>
                  {STATUS_CFG[selected.report.status]?.icon}
                  {STATUS_CFG[selected.report.status]?.label}
                </span>
              </div>
              <p className="text-[13px] text-slate-500 mb-5">
                <span className="font-medium text-slate-700">
                  {selected.report.employee_name ?? selected.report.employee_id}
                </span>
                {selected.report.period_start && (
                  <> · {selected.report.period_start} → {selected.report.period_end}</>
                )}
              </p>

              {/* Summary + Breakdown */}
              <div className="grid grid-cols-5 gap-4 mb-5">
                <div className="col-span-3 bg-white rounded-xl border border-slate-200/80 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-[11px] uppercase tracking-wider text-slate-400">Summary</h3>
                    <p className="text-xl font-bold text-slate-900 tabular-nums">
                      ${selected.report.total_amount.toFixed(2)}{" "}
                      <span className="text-[13px] font-normal text-slate-500">CAD</span>
                    </p>
                  </div>
                  {selected.report.summary && (
                    <p className="text-[13px] text-slate-700 leading-relaxed bg-slate-50/60 rounded-lg p-3 mb-3">
                      {selected.report.summary}
                    </p>
                  )}

                  {selected.category_breakdown && selected.category_breakdown.length > 0 && (
                    <div>
                      <h4 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">By Category</h4>
                      <div className="space-y-1">
                        {selected.category_breakdown.map((c, i) => (
                          <div key={i} className="flex items-center justify-between text-[13px]">
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                              <span className="text-slate-700">{c.category}</span>
                              <span className="text-[10px] text-slate-400">({c.txn_count})</span>
                            </div>
                            <span className="font-medium text-slate-900 tabular-nums">${c.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="col-span-2 bg-white rounded-xl border border-slate-200/80 p-5 flex flex-col">
                  <h3 className="font-semibold text-[11px] uppercase tracking-wider text-slate-400 mb-2">Breakdown</h3>
                  {selected.category_breakdown && selected.category_breakdown.length > 0 ? (
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie
                          data={selected.category_breakdown.map(c => ({ name: c.category, value: Math.round(c.total * 100) / 100 }))}
                          cx="50%" cy="50%" innerRadius={40} outerRadius={72} dataKey="value" paddingAngle={2}
                        >
                          {selected.category_breakdown.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v) => [`$${Number(v).toFixed(2)}`, "Amount"]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">No category data</div>
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
                <div className="bg-white rounded-xl border border-slate-200/80 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100">
                    <h3 className="text-[13px] font-semibold text-slate-700">
                      {selected.transactions.length} transactions
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[13px]">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50/50">
                          <th className="text-left px-4 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Date</th>
                          <th className="text-left px-4 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Merchant</th>
                          <th className="text-left px-4 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Category</th>
                          <th className="text-center px-2 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                          <th className="text-right px-4 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {selected.transactions.map((t, i) => {
                          const flags = (t.policy_flags as string[] | undefined) ?? [];
                          const merchant = String(t.merchant_info_dba_name ?? t.merchant ?? "---");
                          const mcc = Number(t.merchant_category_code ?? t.mcc ?? 0);
                          return (
                            <tr key={i} className={`hover:bg-slate-50/50 transition-colors ${flags.length > 0 ? "bg-red-50/20" : ""}`}>
                              <td className="px-4 py-2 text-slate-600 text-[11px] whitespace-nowrap tabular-nums">
                                {String(t.transaction_date ?? "").slice(0, 10)}
                              </td>
                              <td className="px-4 py-2">
                                <div className="flex items-center gap-2">
                                  <MerchantAvatar merchant={merchant} mcc={mcc} size="sm" />
                                  <span className="font-medium text-slate-800 truncate">{merchant}</span>
                                </div>
                              </td>
                              <td className="px-4 py-2 text-slate-600 text-[11px]">
                                <span className={t.is_fleet ? "text-green-600 font-medium" : ""}>
                                  {String(t.category_label ?? `MCC ${mcc || "---"}`)}
                                </span>
                              </td>
                              <td className="px-2 py-2 text-center">
                                <PolicyBadge status={inferPolicyStatus({ policyFlags: flags })} />
                              </td>
                              <td className="px-4 py-2 text-right font-semibold text-slate-900 tabular-nums">
                                ${Number(t.amount_cad ?? 0).toFixed(2)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-slate-200 bg-slate-50/50">
                          <td colSpan={4} className="px-4 py-2.5 text-[13px] font-semibold text-slate-700">Total</td>
                          <td className="px-4 py-2.5 text-right text-[15px] font-bold text-slate-900 tabular-nums">
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
            <div className="bg-white border-t border-slate-200/80 px-7 py-3.5 flex items-center justify-between flex-shrink-0">
              <p className="text-[11px] text-slate-400">
                Created {selected.report.created_at.slice(0, 10)} · Report #{selected.report.id}
              </p>
              <div className="flex gap-2">
                {selected.report.status === "draft" && (
                  <button
                    onClick={() => changeStatus(selected.report.id, "submitted")}
                    disabled={updating}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[13px] font-medium transition-colors disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {updating ? "Submitting..." : "Submit for approval"}
                  </button>
                )}
                {selected.report.status === "submitted" && (
                  <>
                    <button
                      onClick={() => changeStatus(selected.report.id, "rejected")}
                      disabled={updating}
                      className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg text-[13px] font-medium transition-colors disabled:opacity-50"
                    >
                      <XCircle className="w-3.5 h-3.5 text-red-500" /> Reject
                    </button>
                    <button
                      onClick={() => changeStatus(selected.report.id, "approved")}
                      disabled={updating}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-[13px] font-medium transition-colors disabled:opacity-50"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      {updating ? "Processing..." : "Approve"}
                    </button>
                  </>
                )}
                {selected.report.status === "approved" && (
                  <div className="flex items-center gap-2 text-green-600 text-[13px] font-medium">
                    <CheckCircle className="w-4 h-4" /> Approved
                  </div>
                )}
                <button
                  onClick={() => viewReport(selected.report.id)}
                  className="flex items-center gap-2 px-3 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-[13px] transition-colors"
                >
                  <Eye className="w-3.5 h-3.5" /> Refresh
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
