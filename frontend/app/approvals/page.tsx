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
    <div className="flex h-full bg-transparent">
      {/* Left: list */}
      <div className="w-[320px] flex-shrink-0 bg-white/70 backdrop-blur-xl border-r border-zinc-200/40 flex flex-col">
        <div className="px-6 py-6 border-b border-zinc-100">
          <h1 className="font-bold text-zinc-900 text-[24px] tracking-tight leading-none mb-1.5">Approvals</h1>
          <div className="flex gap-1 mt-5 overflow-x-auto pb-1 scrollbar-hide -mx-2 px-2">
            {(["pending", "approved", "rejected", "all"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-full text-[12px] font-bold capitalize transition-all duration-200 whitespace-nowrap ${
                  statusFilter === s
                    ? "bg-zinc-900 text-white shadow-sm"
                    : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
            </div>
          ) : approvals.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-zinc-400 gap-2">
              <CheckCircle className="w-7 h-7" />
              <p className="text-[13px] font-medium">No {statusFilter} approvals</p>
            </div>
          ) : (
            approvals.map((a) => (
              <button
                key={a.id}
                onClick={() => selectApproval(a.id)}
                className={`w-full text-left px-4 py-3.5 rounded-[16px] transition-all duration-200 flex items-center gap-3 ${
                  selected?.approval.id === a.id ? "bg-white shadow-[0_2px_10px_rgba(0,0,0,0.02)] ring-1 ring-zinc-200/50" : "hover:bg-zinc-50/80"
                }`}
              >
                <MerchantAvatar merchant={a.merchant} mcc={a.mcc} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-[14px] font-bold text-zinc-900 truncate">{a.merchant}</p>
                  </div>
                  <p className="text-[12px] text-zinc-500 font-medium mt-0.5 truncate">
                    {a.employee_name ?? a.employee_id}
                  </p>
                </div>
                <div className="text-right flex-shrink-0 flex flex-col items-end gap-1">
                  <p className="text-[14px] font-bold text-zinc-900 tabular-nums">${a.amount.toFixed(2)}</p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right: detail */}
      <div className="flex-1 flex flex-col overflow-hidden bg-transparent">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-zinc-400 flex-col gap-3">
            <ShieldCheck className="w-10 h-10 opacity-50" />
            <p className="text-[15px] font-medium">Select a transaction to review</p>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-10 py-8">
              {/* Header */}
              <div className="flex items-center gap-4 mb-6">
                <MerchantAvatar merchant={selected.approval.merchant} mcc={selected.approval.mcc} size="lg" />
                <div>
                  <h2 className="text-[32px] tracking-tighter font-bold text-zinc-900 leading-none mb-1.5">
                    ${selected.approval.amount.toFixed(2)} <span className="text-zinc-400 font-medium">at</span> {selected.approval.merchant}
                  </h2>
                  <p className="text-[15px] text-zinc-500 font-medium">
                    <span className="text-zinc-900 font-bold">
                      {selected.approval.employee_name ?? selected.approval.employee_id}
                    </span>
                    <span className="text-zinc-300 mx-2">·</span>
                    {selected.approval.transaction_date ?? selected.approval.requested_at.slice(0, 10)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 mb-6">
                <PolicyBadge status={inferPolicyStatus({ recommendation: selected.approval.ai_recommendation })} />
                {isFleet && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-zinc-50 text-zinc-700 border-zinc-200/60">
                    <ShieldCheck className="w-3 h-3" /> Fleet
                  </span>
                )}
              </div>

              {/* AI recommendation */}
              {selected.approval.ai_reasoning && (
                <div className="mb-6">
                  <AIRecommendationCard
                    recommendation={selected.approval.ai_recommendation}
                    reasoning={selected.approval.ai_reasoning}
                  />
                  <button
                    onClick={() => setShowPolicyRef(true)}
                    className="mt-2 text-[12px] font-medium text-zinc-500 hover:text-zinc-800 flex items-center gap-1.5 transition-colors"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    Read full policy reference
                  </button>
                </div>
              )}

              {/* Transaction details */}
              <div className="bg-white rounded-[24px] border border-zinc-200/60 p-5 mb-4 shadow-sm">
                <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-5">
                  Transaction Details
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-5">
                  <DetailItem label="Employee" value={selected.approval.employee_name ?? selected.approval.employee_id} />
                  <DetailItem label="Department" value={selected.approval.department ?? "---"} />
                  <DetailItem label="Category" value={mccLabel(selected.approval.mcc)} />
                  <DetailItem label="Date" value={selected.approval.transaction_date ?? selected.approval.requested_at.slice(0, 10)} />
                  <DetailItem label="Amount" value={`$${selected.approval.amount.toFixed(2)} CAD`} />
                  <DetailItem label="Role" value={selected.approval.role ?? "---"} />
                </div>
              </div>

              {/* Context mini-cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <MiniCard
                  icon={<DollarSign className="w-5 h-5 text-zinc-700" />}
                  label="Monthly Budget"
                  value={`$${(selected.department_budget?.employee_monthly_budget ?? 0).toLocaleString()}`}
                  sub="per employee"
                />
                <MiniCard
                  icon={<Users className="w-5 h-5 text-zinc-700" />}
                  label="Dept Spend (MTD)"
                  value={`$${(selected.department_budget?.dept_spend_this_month ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                  sub={`${selected.department_budget?.active_employees ?? 0} employees`}
                />
                <button
                  onClick={() => setShowViolations(!showViolations)}
                  className={`bg-white rounded-[24px] border p-5 text-left transition-all hover:shadow-md ${
                    showViolations ? "border-zinc-300 ring-1 ring-zinc-200" : "border-zinc-200/60 hover:border-zinc-300"
                  } ${(selected.violation_count ?? 0) > 0 ? "" : "cursor-default"}`}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center">
                      <AlertTriangle className="w-4 h-4 text-zinc-600" />
                    </div>
                    <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Violations</span>
                    {(selected.violation_count ?? 0) > 0 && (
                      <ChevronRight className={`w-4 h-4 text-zinc-400 ml-auto transition-transform ${showViolations ? "rotate-90" : ""}`} />
                    )}
                  </div>
                  <p className="text-[28px] tracking-tight font-bold text-zinc-900">{selected.violation_count ?? 0}</p>
                  <p className="text-[13px] font-medium text-zinc-500 mt-1">
                    {(selected.violation_count ?? 0) > 0 ? "click to expand" : "clean record"}
                  </p>
                </button>
              </div>

              {/* Violations panel */}
              {showViolations && selected.violations && selected.violations.length > 0 && (
                <div className="bg-zinc-50 border border-zinc-200/60 rounded-[24px] p-5 mb-4 shadow-sm">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-full bg-zinc-200 flex items-center justify-center">
                      <AlertTriangle className="w-4 h-4 text-zinc-600" />
                    </div>
                    <span className="text-[14px] font-bold text-zinc-900">
                      {selected.violations.length} Past Violation{selected.violations.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {selected.violations.map((v, i) => (
                      <div key={i} className="bg-white rounded-xl border border-zinc-200/60 p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className={`px-2 py-1 rounded text-[10px] font-bold tracking-wide uppercase ${
                                v.severity === "CRITICAL" ? "bg-red-50 text-red-700 border border-red-100" :
                                v.severity === "HIGH" ? "bg-orange-50 text-orange-700 border border-orange-100" :
                                v.severity === "MEDIUM" ? "bg-amber-50 text-amber-700 border border-amber-100" :
                                "bg-zinc-50 text-zinc-600 border border-zinc-200"
                              }`}>
                                {v.severity}
                              </span>
                              <span className="text-[12px] font-bold text-zinc-600">{v.violation_type.replace(/_/g, " ")}</span>
                            </div>
                            <p className="text-[13px] text-zinc-600 font-medium leading-snug">
                              {v.description.length > 140 ? v.description.slice(0, 140) + "..." : v.description}
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-[14px] font-bold text-zinc-900 tabular-nums">${Number(v.amount ?? 0).toFixed(2)}</p>
                            <p className="text-[11px] font-medium text-zinc-400 mt-1">{v.detected_at?.slice(0, 10)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Spend History */}
              {selected.spend_history && selected.spend_history.length > 0 && (
                <div className="bg-white rounded-[24px] border border-zinc-200/60 mb-4 shadow-sm">
                  <div className="px-5 pt-5 pb-3 flex items-center justify-between border-b border-zinc-100">
                    <div className="flex items-center gap-3 text-[14px] font-bold text-zinc-900 mb-1">
                      <TrendingUp className="w-4 h-4 text-zinc-400" />
                      Employee Spend History
                    </div>
                  </div>
                  <div className="px-5 py-5">
                    <ResponsiveContainer width="100%" height={140}>
                      <BarChart data={[...selected.spend_history].reverse()}>
                        <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(Number(v) / 1000).toFixed(0)}K`} />
                        <Tooltip formatter={(v) => [`$${Number(v).toLocaleString("en-CA", { minimumFractionDigits: 2 })}`, "Spend"]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                        <Bar dataKey="total" fill="#8b9286" radius={[4, 4, 0, 0]} maxBarSize={28} />
                        {(selected.department_budget?.employee_monthly_budget ?? 0) > 0 && (
                          <ReferenceLine y={selected.department_budget!.employee_monthly_budget} stroke="#d4d4d8" strokeDasharray="4 4" />
                        )}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Recent Transactions */}
              {selected.recent_transactions && selected.recent_transactions.length > 0 && (
                <div className="bg-white rounded-[24px] border border-zinc-200/60 overflow-hidden mb-4 shadow-sm">
                  <div className="px-5 py-5 border-b border-zinc-100 flex items-center justify-between">
                    <div className="flex items-center gap-3 text-[14px] font-bold text-zinc-900">
                      <History className="w-4 h-4 text-zinc-400" />
                      Recent Employee Transactions
                    </div>
                  </div>
                  <div className="divide-y divide-zinc-100">
                    {selected.recent_transactions.slice(0, 8).map((t, i) => (
                      <div key={i} className="flex items-center gap-3 px-5 py-3 hover:bg-zinc-50 transition-colors">
                        <MerchantAvatar merchant={t.merchant} mcc={t.mcc} size="sm" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium text-zinc-800 truncate">{t.merchant}</p>
                          <p className="text-[11px] text-zinc-500 mt-0.5">{t.transaction_date?.slice(0, 10)} · {MCC_LABELS[t.mcc] ?? `MCC ${t.mcc}`}</p>
                        </div>
                        <p className="text-[14px] font-semibold text-zinc-900 tabular-nums">${Number(t.amount_cad).toFixed(2)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Raw data */}
              {Object.keys(selected.transaction).length > 0 && (
                <details className="bg-white rounded-[24px] border border-zinc-200/60 shadow-sm mt-4 group">
                  <summary className="text-[14px] font-bold text-zinc-900 px-5 py-5 border-b border-zinc-100 cursor-pointer list-none flex items-center justify-between">
                    Raw transaction fields
                    <ChevronRight className="w-4 h-4 text-zinc-400 group-open:rotate-90 transition-transform" />
                  </summary>
                  <div className="grid grid-cols-2 gap-4 p-5">
                    {Object.entries(selected.transaction)
                      .filter(([, v]) => v !== null && v !== "")
                      .map(([k, v]) => (
                        <div key={k}>
                          <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">{k.replace(/_/g, " ")}</p>
                          <p className="text-[13px] text-zinc-700 font-medium truncate mt-1">{String(v)}</p>
                        </div>
                      ))}
                  </div>
                </details>
              )}
            </div>

            {/* Action bar */}
            {selected.approval.status === "pending" && (
              <div className="bg-white border-t border-zinc-200/60 px-10 py-5 flex items-center justify-between flex-shrink-0 shadow-[0_-4px_10px_rgba(0,0,0,0.02)]">
                <div className="flex items-center gap-2 text-[14px] font-medium text-zinc-500">
                  <Clock className="w-4 h-4 text-amber-500" />
                  Pending since {selected.approval.requested_at.slice(0, 10)}
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => decide("rejected")}
                    disabled={deciding}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-[12px] border border-zinc-200 text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 text-[14px] font-bold transition-all duration-200 disabled:opacity-50"
                  >
                    <XCircle className="w-4 h-4 text-rose-500" />
                    {deciding ? "Processing..." : "Reject"}
                  </button>
                  <button
                    onClick={() => decide("approved")}
                    disabled={deciding}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-[12px] bg-zinc-900 hover:bg-black text-white text-[14px] font-bold transition-all duration-200 shadow-sm disabled:opacity-50"
                  >
                    <CheckCircle className="w-4 h-4" />
                    {deciding ? "Processing..." : "Approve"}
                  </button>
                </div>
              </div>
            )}

            {selected.approval.status !== "pending" && (
              <div className="bg-white border-t border-zinc-200/60 px-10 py-5 flex-shrink-0 shadow-[0_-4px_10px_rgba(0,0,0,0.02)]">
                <div className="flex items-center gap-2.5 text-[14px]">
                  {selected.approval.status === "approved" ? (
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-50 text-zinc-700 rounded-lg border border-zinc-200/60 font-bold">
                      <CheckCircle className="w-4 h-4" /> Approved
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-50 text-zinc-700 rounded-lg border border-zinc-200/60 font-bold">
                      <XCircle className="w-4 h-4" /> Rejected
                    </div>
                  )}
                  {selected.approval.decided_at && (
                    <span className="text-zinc-500 font-medium ml-2">Decided on {selected.approval.decided_at.slice(0, 10)}</span>
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
      <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">{label}</p>
      <p className="text-[14px] font-semibold text-zinc-900 mt-1">{value}</p>
    </div>
  );
}

function MiniCard({ icon, label, value, sub, onClick, interactive }: { icon: React.ReactNode; label: string; value: string; sub: string; onClick?: () => void; interactive?: boolean }) {
  const inner = (
    <>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center">
          {icon}
        </div>
        <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">{label}</span>
        {interactive && (
          <ChevronRight className="w-4 h-4 text-zinc-400 ml-auto transition-transform" />
        )}
      </div>
      <p className="text-[28px] tracking-tight font-bold text-zinc-900">{value}</p>
      <p className="text-[13px] font-medium text-zinc-500 mt-1">{sub}</p>
    </>
  );

  if (onClick && interactive) {
    return (
      <button
        onClick={onClick}
        className="bg-white rounded-[24px] border border-zinc-200/60 p-5 text-left shadow-sm transition-all hover:shadow-md hover:border-zinc-300"
      >
        {inner}
      </button>
    );
  }

  return (
    <div className="bg-white rounded-[24px] border border-zinc-200/60 p-5 shadow-sm transition-all hover:shadow-md">
      {inner}
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const cfg: Record<string, { cls: string; icon: React.ReactNode }> = {
    pending: { cls: "text-zinc-700 bg-zinc-50 border-zinc-200/60", icon: <Clock className="w-3 h-3" /> },
    approved: { cls: "text-zinc-700 bg-zinc-50 border-zinc-200/60", icon: <CheckCircle className="w-3 h-3" /> },
    rejected: { cls: "text-zinc-700 bg-zinc-50 border-zinc-200/60", icon: <XCircle className="w-3 h-3" /> },
  };
  const c = cfg[status] ?? cfg.pending;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border mt-1 ${c.cls}`}>
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
