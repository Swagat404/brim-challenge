"use client";

import { Suspense } from "react";
import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import {
  CheckCircle,
  XCircle,
  Clock,
  ChevronRight,
  Loader2,
  ShieldCheck,
  AlertTriangle,
  TrendingUp,
  Users,
  DollarSign,
  History,
  BookOpen,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { getApprovals, getApproval, decideApproval } from "@/lib/api";
import type { Approval } from "@/lib/types";
import MerchantAvatar from "@/components/MerchantAvatar";
import AIRecommendationCard from "@/components/AIRecommendationCard";
import PolicyBadge, { inferPolicyStatus } from "@/components/PolicyBadge";
import PolicyReferenceModal from "@/components/PolicyReferenceModal";

const MCC_LABELS: Record<number, string> = {
  5541: "Fuel", 5542: "Fuel (auto)", 9399: "Gov. Permits", 5532: "Tires / Parts",
  7538: "Auto Service", 7542: "Car Wash", 7549: "Towing", 5812: "Restaurant",
  5813: "Bar / Alcohol", 5411: "Grocery", 5983: "Fuel Dealers",
};

const FLEET_MCC = new Set([5541, 5542, 9399, 5532, 7538, 7542, 7549, 5983]);

function mccLabel(mcc?: number) {
  if (!mcc) return "Unknown";
  return MCC_LABELS[mcc] ?? `MCC ${mcc}`;
}

function ApprovalsContent() {
  const searchParams = useSearchParams();
  const preselect = searchParams.get("id");

  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [selected, setSelected] = useState<{
    approval: Approval;
    transaction: Record<string, unknown>;
    spend_history?: Array<{ month: string; total: number }>;
    recent_transactions?: Array<{ transaction_date: string; merchant: string; amount_cad: number; mcc: number }>;
    department_budget?: { department: string; dept_spend_this_month: number; active_employees: number; employee_monthly_budget: number };
    violation_count?: number;
    violations?: Array<{ violation_type: string; severity: string; description: string; amount: number; detected_at: string }>;
  } | null>(null);
  const [showViolations, setShowViolations] = useState(false);
  const [showPolicyRef, setShowPolicyRef] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deciding, setDeciding] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("pending");

  const loadApprovals = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getApprovals({ status: statusFilter === "all" ? undefined : statusFilter, limit: 50 });
      setApprovals(data);
      if (data.length > 0) {
        const target = preselect ? data.find((a) => String(a.id) === preselect) : data[0];
        if (target) selectApproval(target.id);
      }
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  useEffect(() => { loadApprovals(); }, [loadApprovals]);

  async function selectApproval(id: number) {
    const detail = await getApproval(id).catch(() => null);
    if (detail) {
      setSelected(detail);
      setShowViolations(false);
    }
  }

  async function decide(decision: "approved" | "rejected") {
    if (!selected) return;
    setDeciding(true);
    try {
      await decideApproval(selected.approval.id, decision);
      await loadApprovals();
      setSelected(null);
    } finally {
      setDeciding(false);
    }
  }

  const isFleet = selected ? FLEET_MCC.has(selected.approval.mcc ?? 0) : false;

  return (
    <div className="flex h-screen">
      {/* Left: list */}
      <div className="w-[320px] flex-shrink-0 bg-white border-r border-slate-200/80 flex flex-col">
        <div className="px-4 py-4 border-b border-slate-100">
          <h1 className="font-semibold text-slate-900 text-[15px]">Approvals</h1>
          <div className="flex gap-1 mt-3">
            {(["pending", "approved", "rejected", "all"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium capitalize transition-colors ${
                  statusFilter === s
                    ? "bg-green-100 text-green-800"
                    : "text-slate-500 hover:bg-slate-100"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
          ) : approvals.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-slate-400 gap-2">
              <CheckCircle className="w-7 h-7" />
              <p className="text-sm">No {statusFilter} approvals</p>
            </div>
          ) : (
            approvals.map((a) => (
              <button
                key={a.id}
                onClick={() => selectApproval(a.id)}
                className={`w-full text-left px-4 py-2.5 hover:bg-slate-50/50 transition-colors flex items-center gap-2.5 ${
                  selected?.approval.id === a.id ? "bg-green-50/60" : ""
                }`}
              >
                <MerchantAvatar merchant={a.merchant} mcc={a.mcc} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-[13px] font-medium text-slate-900 truncate">{a.merchant}</p>
                    {a.status === "pending" && (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                    {a.employee_name ?? a.employee_id}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-[13px] font-semibold text-slate-900 tabular-nums">${a.amount.toFixed(2)}</p>
                  <StatusChip status={a.status} />
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right: detail */}
      <div className="flex-1 flex flex-col overflow-hidden bg-[#f8fafb]">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-slate-400 flex-col gap-3">
            <ShieldCheck className="w-10 h-10" />
            <p className="text-sm">Select a transaction to review</p>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-7 py-5">
              {/* Header */}
              <div className="flex items-center gap-3.5 mb-2">
                <MerchantAvatar merchant={selected.approval.merchant} mcc={selected.approval.mcc} size="lg" />
                <div>
                  <h2 className="text-xl font-bold text-slate-900">
                    ${selected.approval.amount.toFixed(2)} at {selected.approval.merchant}
                  </h2>
                  <p className="text-[13px] text-slate-500 mt-0.5">
                    <span className="font-medium text-slate-700">
                      {selected.approval.employee_name ?? selected.approval.employee_id}
                    </span>
                    <span className="text-slate-300 mx-1.5">·</span>
                    {selected.approval.transaction_date ?? selected.approval.requested_at.slice(0, 10)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 mb-5">
                <PolicyBadge status={inferPolicyStatus({ recommendation: selected.approval.ai_recommendation })} />
                {isFleet && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-green-50 text-green-700 border-green-200">
                    <ShieldCheck className="w-3 h-3" /> Fleet
                  </span>
                )}
              </div>

              {/* AI recommendation */}
              {selected.approval.ai_reasoning && (
                <div className="mb-4">
                  <AIRecommendationCard
                    recommendation={selected.approval.ai_recommendation}
                    reasoning={selected.approval.ai_reasoning}
                  />
                  <button
                    onClick={() => setShowPolicyRef(true)}
                    className="mt-1.5 text-[11px] text-slate-500 hover:text-slate-700 flex items-center gap-1 transition-colors"
                  >
                    <BookOpen className="w-3 h-3" />
                    Read full policy reference
                  </button>
                </div>
              )}

              {/* Transaction details */}
              <div className="bg-white rounded-xl border border-slate-200/80 p-4 mb-4">
                <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">
                  Transaction Details
                </h3>
                <div className="grid grid-cols-3 gap-x-4 gap-y-2">
                  <DetailItem label="Employee" value={selected.approval.employee_name ?? selected.approval.employee_id} />
                  <DetailItem label="Department" value={selected.approval.department ?? "---"} />
                  <DetailItem label="Category" value={mccLabel(selected.approval.mcc)} />
                  <DetailItem label="Date" value={selected.approval.transaction_date ?? selected.approval.requested_at.slice(0, 10)} />
                  <DetailItem label="Amount" value={`$${selected.approval.amount.toFixed(2)} CAD`} />
                  <DetailItem label="Role" value={selected.approval.role ?? "---"} />
                </div>
              </div>

              {/* Context mini-cards */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <MiniCard
                  icon={<DollarSign className="w-3.5 h-3.5 text-blue-500" />}
                  label="Monthly Budget"
                  value={`$${(selected.department_budget?.employee_monthly_budget ?? 0).toLocaleString()}`}
                  sub="per employee"
                />
                <MiniCard
                  icon={<Users className="w-3.5 h-3.5 text-purple-500" />}
                  label="Dept Spend (MTD)"
                  value={`$${(selected.department_budget?.dept_spend_this_month ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                  sub={`${selected.department_budget?.active_employees ?? 0} employees`}
                />
                <button
                  onClick={() => setShowViolations(!showViolations)}
                  className={`bg-white rounded-xl border p-3.5 text-left transition-colors ${
                    showViolations ? "border-red-300 ring-1 ring-red-100" : "border-slate-200/80 hover:border-red-200"
                  } ${(selected.violation_count ?? 0) > 0 ? "" : "cursor-default"}`}
                >
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Violations</span>
                    {(selected.violation_count ?? 0) > 0 && (
                      <ChevronRight className={`w-3 h-3 text-slate-400 ml-auto transition-transform ${showViolations ? "rotate-90" : ""}`} />
                    )}
                  </div>
                  <p className="text-lg font-bold text-slate-900">{selected.violation_count ?? 0}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {(selected.violation_count ?? 0) > 0 ? "click to expand" : "clean record"}
                  </p>
                </button>
              </div>

              {/* Violations panel */}
              {showViolations && selected.violations && selected.violations.length > 0 && (
                <div className="bg-red-50/60 border border-red-200/60 rounded-xl p-4 mb-4">
                  <div className="flex items-center gap-2 mb-2.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                    <span className="text-[13px] font-semibold text-red-800">
                      {selected.violations.length} Past Violation{selected.violations.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {selected.violations.map((v, i) => (
                      <div key={i} className="bg-white rounded-lg border border-red-100 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                v.severity === "CRITICAL" ? "bg-red-100 text-red-700" :
                                v.severity === "HIGH" ? "bg-orange-100 text-orange-700" :
                                v.severity === "MEDIUM" ? "bg-yellow-100 text-yellow-700" :
                                "bg-slate-100 text-slate-600"
                              }`}>
                                {v.severity}
                              </span>
                              <span className="text-[11px] text-slate-500">{v.violation_type.replace(/_/g, " ")}</span>
                            </div>
                            <p className="text-[13px] text-slate-700 leading-snug">
                              {v.description.length > 140 ? v.description.slice(0, 140) + "..." : v.description}
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-[13px] font-semibold text-slate-900 tabular-nums">${Number(v.amount ?? 0).toFixed(2)}</p>
                            <p className="text-[10px] text-slate-400">{v.detected_at?.slice(0, 10)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Spend History */}
              {selected.spend_history && selected.spend_history.length > 0 && (
                <details className="bg-white rounded-xl border border-slate-200/80 mb-4 group" open>
                  <summary className="px-4 py-3 flex items-center gap-2 text-[13px] font-semibold text-slate-700">
                    <TrendingUp className="w-3.5 h-3.5 text-slate-400" />
                    Employee Spend History
                    <ChevronRight className="w-3 h-3 text-slate-400 ml-auto transition-transform group-open:rotate-90" />
                  </summary>
                  <div className="px-4 pb-3">
                    <ResponsiveContainer width="100%" height={140}>
                      <BarChart data={[...selected.spend_history].reverse()}>
                        <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(Number(v) / 1000).toFixed(0)}K`} />
                        <Tooltip formatter={(v) => [`$${Number(v).toLocaleString("en-CA", { minimumFractionDigits: 2 })}`, "Spend"]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                        <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={28} />
                        {(selected.department_budget?.employee_monthly_budget ?? 0) > 0 && (
                          <ReferenceLine y={selected.department_budget!.employee_monthly_budget} stroke="#ef4444" strokeDasharray="4 4" />
                        )}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </details>
              )}

              {/* Recent Transactions */}
              {selected.recent_transactions && selected.recent_transactions.length > 0 && (
                <details className="bg-white rounded-xl border border-slate-200/80 overflow-hidden mb-4 group">
                  <summary className="px-4 py-3 flex items-center gap-2 text-[13px] font-semibold text-slate-700">
                    <History className="w-3.5 h-3.5 text-slate-400" />
                    Recent Employee Transactions
                    <ChevronRight className="w-3 h-3 text-slate-400 ml-auto transition-transform group-open:rotate-90" />
                  </summary>
                  <div className="divide-y divide-slate-50">
                    {selected.recent_transactions.slice(0, 8).map((t, i) => (
                      <div key={i} className="flex items-center gap-2.5 px-4 py-2">
                        <MerchantAvatar merchant={t.merchant} mcc={t.mcc} size="sm" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] text-slate-800 truncate">{t.merchant}</p>
                          <p className="text-[10px] text-slate-400">{t.transaction_date?.slice(0, 10)} · {MCC_LABELS[t.mcc] ?? `MCC ${t.mcc}`}</p>
                        </div>
                        <p className="text-[13px] font-medium text-slate-900 tabular-nums">${Number(t.amount_cad).toFixed(2)}</p>
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {/* Raw data */}
              {Object.keys(selected.transaction).length > 0 && (
                <details className="bg-white rounded-xl border border-slate-200/80 p-4">
                  <summary className="text-[13px] font-medium text-slate-600">
                    Raw transaction fields
                  </summary>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {Object.entries(selected.transaction)
                      .filter(([, v]) => v !== null && v !== "")
                      .map(([k, v]) => (
                        <div key={k}>
                          <p className="text-[10px] text-slate-400 capitalize">{k.replace(/_/g, " ")}</p>
                          <p className="text-[11px] text-slate-700 font-medium truncate">{String(v)}</p>
                        </div>
                      ))}
                  </div>
                </details>
              )}
            </div>

            {/* Action bar */}
            {selected.approval.status === "pending" && (
              <div className="bg-white border-t border-slate-200/80 px-7 py-3.5 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-2 text-[13px] text-slate-500">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  Pending since {selected.approval.requested_at.slice(0, 10)}
                </div>
                <div className="flex gap-2.5">
                  <button
                    onClick={() => decide("rejected")}
                    disabled={deciding}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-[13px] font-medium transition-colors disabled:opacity-50"
                  >
                    <XCircle className="w-4 h-4 text-red-500" />
                    {deciding ? "Processing..." : "Reject"}
                  </button>
                  <button
                    onClick={() => decide("approved")}
                    disabled={deciding}
                    className="flex items-center gap-2 px-5 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-[13px] font-medium transition-colors disabled:opacity-50"
                  >
                    <CheckCircle className="w-4 h-4" />
                    {deciding ? "Processing..." : "Approve"}
                  </button>
                </div>
              </div>
            )}

            {selected.approval.status !== "pending" && (
              <div className="bg-white border-t border-slate-200/80 px-7 py-3.5 flex-shrink-0">
                <div className="flex items-center gap-2 text-[13px]">
                  {selected.approval.status === "approved" ? (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-500" />
                  )}
                  <span className="capitalize font-medium text-slate-700">{selected.approval.status}</span>
                  {selected.approval.decided_at && (
                    <span className="text-slate-400">· {selected.approval.decided_at.slice(0, 10)}</span>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <PolicyReferenceModal
        open={showPolicyRef}
        onClose={() => setShowPolicyRef(false)}
        highlightMcc={selected?.approval.mcc}
        highlightAmount={selected?.approval.amount}
      />
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-slate-400 uppercase tracking-wider">{label}</p>
      <p className="text-[13px] font-medium text-slate-900 mt-0.5">{value}</p>
    </div>
  );
}

function MiniCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200/80 p-3.5">
      <div className="flex items-center gap-1.5 mb-1.5">
        {icon}
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-lg font-bold text-slate-900">{value}</p>
      <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const cfg: Record<string, { cls: string; icon: React.ReactNode }> = {
    pending: { cls: "text-amber-600 bg-amber-50", icon: <Clock className="w-3 h-3" /> },
    approved: { cls: "text-green-600 bg-green-50", icon: <CheckCircle className="w-3 h-3" /> },
    rejected: { cls: "text-red-600 bg-red-50", icon: <XCircle className="w-3 h-3" /> },
  };
  const c = cfg[status] ?? cfg.pending;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold mt-0.5 ${c.cls}`}>
      {c.icon}
      {status}
    </span>
  );
}

export default function ApprovalsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen"><span className="text-slate-400 text-sm">Loading...</span></div>}>
      <ApprovalsContent />
    </Suspense>
  );
}
