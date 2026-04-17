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
  ShieldAlert,
  Truck,
  Sparkles,
  ChevronDown,
  BookOpen,
} from "lucide-react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { getApprovals, getApproval, decideApproval, getTransactionDetail } from "@/lib/api";
import type { Approval, AiDecision, TransactionDetail } from "@/lib/types";
import MerchantAvatar from "@/components/MerchantAvatar";
import AIRecommendationCard from "@/components/AIRecommendationCard";
import PolicyReferenceModal from "@/components/PolicyReferenceModal";
import SubmissionStatusBadges from "@/components/SubmissionStatusBadges";
import TransactionSubmissionForm from "@/components/TransactionSubmissionForm";
import ActivityFeed from "@/components/ActivityFeed";

const MCC_LABELS: Record<number, string> = {
  5541: "Fuel", 5542: "Fuel (auto)", 9399: "Gov. Permits", 5532: "Tires / Parts",
  7538: "Auto Service", 7542: "Car Wash", 7549: "Towing", 5812: "Restaurant",
  5813: "Bar / Alcohol", 5411: "Grocery", 5983: "Fuel Dealers", 5912: "Pharmacy",
};

const FLEET_MCC = new Set([5541, 5542, 9399, 5532, 7538, 7542, 7549, 5983]);

type ApprovalDetail = {
  approval: Approval;
  transaction: Record<string, unknown>;
  spend_history?: Array<{ month: string; total: number }>;
  recent_transactions?: Array<{ transaction_date: string; merchant: string; amount_cad: number; mcc: number }>;
  department_budget?: { department: string; dept_spend_this_month: number; active_employees: number; employee_monthly_budget: number };
  violation_count?: number;
  violations?: Array<{ violation_type: string; severity: string; description: string; amount: number; detected_at: string }>;
};

function mccLabel(mcc?: number) {
  if (!mcc) return "Other";
  return MCC_LABELS[mcc] ?? `MCC ${mcc}`;
}

function fmtMoney(n: number, opts: { compact?: boolean } = {}) {
  if (opts.compact && n >= 10_000) return `$${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 2 });
}

function relativeTime(iso: string): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  const hours = diffMs / (1000 * 60 * 60);
  if (hours < 1) return `${Math.max(1, Math.round(diffMs / 60000))}m ago`;
  if (hours < 24) return `${Math.round(hours)}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function ApprovalsContent() {
  const searchParams = useSearchParams();
  const preselect = searchParams.get("id");

  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [selected, setSelected] = useState<ApprovalDetail | null>(null);
  const [loadingDetailId, setLoadingDetailId] = useState<number | null>(null);
  const [submissionDetail, setSubmissionDetail] = useState<TransactionDetail | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showPolicyRef, setShowPolicyRef] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deciding, setDeciding] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [activityKey, setActivityKey] = useState(0);

  const loadApprovals = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getApprovals({ status: statusFilter === "all" ? undefined : statusFilter, limit: 50 });
      setApprovals(data);
      if (data.length > 0) {
        const target = preselect ? data.find((a) => String(a.id) === preselect) : data[0];
        if (target) selectApproval(target.id);
      } else {
        setSelected(null);
      }
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  useEffect(() => { loadApprovals(); }, [loadApprovals]);

  async function selectApproval(id: number) {
    // Clear stale content immediately so the user sees a loading state
    // instead of the previous request's data while we fetch.
    setSelected(null);
    setSubmissionDetail(null);
    setShowDetails(false);
    setShowHistory(false);
    setLoadingDetailId(id);

    const detail = await getApproval(id).catch(() => null);
    // Drop the response if the user already clicked another row
    setLoadingDetailId((curr) => (curr === id ? null : curr));
    if (detail) {
      setSelected(detail);
      const txnId = detail.approval.transaction_rowid;
      if (txnId) {
        getTransactionDetail(txnId)
          .then(setSubmissionDetail)
          .catch(() => setSubmissionDetail(null));
      }
    }
  }

  async function decide(decision: "approved" | "rejected") {
    if (!selected) return;
    setDeciding(true);
    try {
      await decideApproval(selected.approval.id, decision);
      await loadApprovals();
    } finally {
      setDeciding(false);
    }
  }

  const isFleet = selected ? FLEET_MCC.has(selected.approval.mcc ?? 0) : false;
  const recommendationKind: AiDecision | null = selected?.approval.ai_decision ?? null;

  return (
    <div className="flex h-full bg-transparent">
      {/* ───────────────── Left: list ───────────────── */}
      <div className="w-[320px] flex-shrink-0 bg-white/70 backdrop-blur-xl border-r border-zinc-200/40 flex flex-col">
        <div className="px-6 py-6 border-b border-zinc-100">
          <h1 className="font-bold text-zinc-900 text-[24px] tracking-tight leading-none mb-1.5">Approvals</h1>
          <p className="text-[13px] text-zinc-500 font-medium">
            {approvals.length} {statusFilter === "all" ? "total" : statusFilter}
          </p>
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
            approvals.map((a) => {
              const tone = a.ai_decision ?? null;
              return (
                <button
                  key={a.id}
                  onClick={() => selectApproval(a.id)}
                  className={`w-full text-left px-4 py-3.5 rounded-[16px] transition-all duration-200 flex items-center gap-3 ${
                    selected?.approval.id === a.id
                      ? "bg-white shadow-[0_2px_10px_rgba(0,0,0,0.04)] ring-1 ring-zinc-200/50"
                      : "hover:bg-zinc-50/80"
                  }`}
                >
                  <MerchantAvatar merchant={a.merchant} mcc={a.mcc} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-bold text-zinc-900 truncate">{a.merchant}</p>
                    <p className="text-[12px] text-zinc-500 font-medium mt-0.5 truncate">
                      {a.employee_name ?? a.employee_id}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0 flex flex-col items-end gap-1">
                    <p className="text-[14px] font-bold text-zinc-900 tabular-nums">${a.amount.toFixed(2)}</p>
                    {tone && a.status === "pending" && <ToneDot tone={tone} />}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ───────────────── Right: detail (card-first) ───────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-transparent">
        {!selected ? (
          loadingDetailId !== null ? (
            <div className="flex-1 flex items-center justify-center text-zinc-400 flex-col gap-3">
              <Loader2 className="w-6 h-6 animate-spin" />
              <p className="text-[13px] font-medium">Loading request…</p>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-zinc-400 flex-col gap-3">
              <ShieldCheck className="w-10 h-10 opacity-50" />
              <p className="text-[15px] font-medium">Select a request to review</p>
            </div>
          )
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-10 pt-8 pb-6">
              <div className="max-w-[680px] mx-auto space-y-5">
                {/* ── Request hero card ─────────────────────────────────── */}
                <div className="bg-white rounded-[24px] border border-zinc-200/60 shadow-sm p-7">
                  <div className="flex items-start gap-4">
                    <MerchantAvatar
                      merchant={selected.approval.merchant}
                      mcc={selected.approval.mcc}
                      size="lg"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-[0.12em]">
                          Pre-approval request
                        </span>
                        <span className="text-zinc-300">·</span>
                        <span className="text-[12px] font-medium text-zinc-500">
                          {relativeTime(selected.approval.requested_at)}
                        </span>
                      </div>
                      <p className="text-[16px] font-medium text-zinc-700 leading-snug">
                        <span className="font-bold text-zinc-900">
                          {selected.approval.employee_name ?? selected.approval.employee_id}
                        </span>{" "}
                        from{" "}
                        <span className="font-bold text-zinc-900">
                          {selected.approval.department ?? "—"}
                        </span>{" "}
                        is requesting
                      </p>
                      <p className="text-[36px] font-bold text-zinc-900 tracking-tighter leading-tight mt-2">
                        {fmtMoney(selected.approval.amount)}
                      </p>
                      <p className="text-[14px] text-zinc-600 font-medium mt-1.5">
                        at <span className="font-bold text-zinc-900">{selected.approval.merchant}</span>
                        <span className="text-zinc-300 mx-2">·</span>
                        {mccLabel(selected.approval.mcc)}
                        {isFleet && (
                          <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                            <Truck className="w-3 h-3" /> Fleet
                          </span>
                        )}
                      </p>
                      {submissionDetail && (
                        <div className="mt-3">
                          <SubmissionStatusBadges
                            submission={submissionDetail.submission}
                            missing={submissionDetail.missing_required_fields}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* ── AI recommendation ─────────────────────────────────── */}
                {selected.approval.ai_decision && selected.approval.ai_reasoning && (
                  <AIRecommendationCard
                    decision={selected.approval.ai_decision}
                    reasoning={selected.approval.ai_reasoning}
                    citation={selected.approval.policy_citation}
                    citedSectionId={selected.approval.cited_section_id}
                  />
                )}

                {/* ── Submission (receipt + memo + attendees + GL) ─────── */}
                {submissionDetail && (
                  <TransactionSubmissionForm
                    detail={submissionDetail}
                    onChange={(next) => {
                      // Update locally only — DON'T call selectApproval, which
                      // would clear state and reset any in-progress edits in
                      // other fields. The TransactionDetail response already
                      // includes the updated approval row, so we patch the
                      // surrounding `selected` view from it directly.
                      setSubmissionDetail(next);
                      setActivityKey((k) => k + 1);
                      if (next.approval) {
                        setSelected((prev) =>
                          prev
                            ? {
                                ...prev,
                                approval: { ...prev.approval, ...next.approval },
                              }
                            : prev
                        );
                      }
                    }}
                  />
                )}

                {/* ── Inline context strip (one card, three numbers) ─── */}
                <div className="bg-white rounded-[20px] border border-zinc-200/60 shadow-sm overflow-hidden">
                  <div className="grid grid-cols-3 divide-x divide-zinc-100">
                    <ContextStat
                      label="Monthly budget"
                      value={fmtMoney(selected.department_budget?.employee_monthly_budget ?? 0, { compact: true })}
                      sub="per employee"
                    />
                    <ContextStat
                      label="Dept spend MTD"
                      value={fmtMoney(selected.department_budget?.dept_spend_this_month ?? 0, { compact: true })}
                      sub={`${selected.department_budget?.active_employees ?? 0} active`}
                    />
                    <ContextStat
                      label="Past flags"
                      value={String(selected.violation_count ?? 0)}
                      sub={(selected.violation_count ?? 0) > 0 ? "this employee" : "clean record"}
                      tone={(selected.violation_count ?? 0) > 0 ? "warn" : "good"}
                    />
                  </div>
                  {selected.spend_history && selected.spend_history.length > 1 && (
                    <div className="border-t border-zinc-100 px-5 py-4 flex items-center gap-4">
                      <div className="flex-1">
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.12em]">
                          6-month spend trend
                        </p>
                        <p className="text-[12px] font-medium text-zinc-500 mt-0.5">
                          {selected.approval.employee_name ?? selected.approval.employee_id}
                        </p>
                      </div>
                      <div className="w-[140px] h-[40px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={[...selected.spend_history].reverse()}>
                            <defs>
                              <linearGradient id="apvSpark" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#8b9286" stopOpacity={0.4} />
                                <stop offset="100%" stopColor="#8b9286" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <Area
                              type="monotone"
                              dataKey="total"
                              stroke="#8b9286"
                              strokeWidth={1.8}
                              fill="url(#apvSpark)"
                              isAnimationActive={false}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Past violations (only if any) ─────────────────────── */}
                {selected.violations && selected.violations.length > 0 && (
                  <button
                    onClick={() => setShowHistory((s) => !s)}
                    className="w-full bg-white rounded-[20px] border border-zinc-200/60 shadow-sm overflow-hidden text-left"
                  >
                    <div className="flex items-center gap-3 px-5 py-4">
                      <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center flex-shrink-0 ring-1 ring-amber-100">
                        <ShieldAlert className="w-4 h-4 text-amber-600" />
                      </div>
                      <div className="flex-1">
                        <p className="text-[14px] font-bold text-zinc-900 tracking-tight">
                          {selected.violations.length} prior policy flag
                          {selected.violations.length !== 1 ? "s" : ""}
                        </p>
                        <p className="text-[12px] font-medium text-zinc-500 mt-0.5">
                          {showHistory ? "tap to collapse" : "tap to review"}
                        </p>
                      </div>
                      <ChevronDown
                        className={`w-4 h-4 text-zinc-400 transition-transform ${showHistory ? "rotate-180" : ""}`}
                      />
                    </div>
                    {showHistory && (
                      <div className="px-5 pb-5 pt-1 space-y-2 border-t border-zinc-100">
                        {selected.violations.slice(0, 4).map((v, i) => (
                          <div
                            key={i}
                            className="flex items-start justify-between gap-3 bg-zinc-50/60 rounded-xl px-4 py-3 border border-zinc-100"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-[12px] font-bold text-zinc-700">
                                {v.violation_type.replace(/_/g, " ")}
                                <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                                  {v.severity}
                                </span>
                              </p>
                              <p className="text-[12px] text-zinc-500 font-medium mt-1 leading-snug">
                                {v.description.length > 110 ? v.description.slice(0, 110) + "…" : v.description}
                              </p>
                            </div>
                            <p className="text-[13px] font-bold text-zinc-900 tabular-nums flex-shrink-0">
                              ${Number(v.amount ?? 0).toFixed(0)}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </button>
                )}

                {/* ── Activity feed for this transaction ────────────── */}
                {selected.approval.transaction_rowid && (
                  <div className="bg-white rounded-[20px] border border-zinc-200/60 shadow-sm p-5">
                    <ActivityFeed
                      transactionRowid={selected.approval.transaction_rowid}
                      limit={20}
                      refreshKey={activityKey}
                      title="Activity"
                      compact
                    />
                  </div>
                )}

                {/* ── Progressive disclosure: full transaction record ──── */}
                <button
                  onClick={() => setShowDetails((s) => !s)}
                  className="w-full text-[12px] font-bold text-zinc-500 hover:text-zinc-900 flex items-center justify-center gap-2 py-2 transition-colors"
                >
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform ${showDetails ? "rotate-180" : ""}`}
                  />
                  {showDetails ? "Hide details" : "Show transaction & history"}
                </button>

                {showDetails && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    {/* Transaction details */}
                    <div className="bg-white rounded-[20px] border border-zinc-200/60 shadow-sm p-6">
                      <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.12em] mb-4">
                        Transaction
                      </h3>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4">
                        <DetailItem label="Date" value={selected.approval.transaction_date ?? selected.approval.requested_at.slice(0, 10)} />
                        <DetailItem label="Department" value={selected.approval.department ?? "—"} />
                        <DetailItem label="Role" value={selected.approval.role ?? "—"} />
                        <DetailItem label="Category" value={mccLabel(selected.approval.mcc)} />
                        <DetailItem label="Amount" value={fmtMoney(selected.approval.amount)} />
                        <DetailItem label="MCC" value={String(selected.approval.mcc ?? "—")} />
                      </div>
                    </div>

                    {/* Recent transactions */}
                    {selected.recent_transactions && selected.recent_transactions.length > 0 && (
                      <div className="bg-white rounded-[20px] border border-zinc-200/60 shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-zinc-100">
                          <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.12em]">
                            Last {Math.min(6, selected.recent_transactions.length)} charges
                          </h3>
                        </div>
                        <div className="divide-y divide-zinc-50">
                          {selected.recent_transactions.slice(0, 6).map((t, i) => (
                            <div key={i} className="flex items-center gap-3 px-6 py-3">
                              <MerchantAvatar merchant={t.merchant} mcc={t.mcc} size="sm" />
                              <div className="flex-1 min-w-0">
                                <p className="text-[13px] font-medium text-zinc-800 truncate">{t.merchant}</p>
                                <p className="text-[11px] text-zinc-500 mt-0.5">
                                  {t.transaction_date?.slice(0, 10)} · {mccLabel(t.mcc)}
                                </p>
                              </div>
                              <p className="text-[13px] font-bold text-zinc-900 tabular-nums">
                                ${Number(t.amount_cad).toFixed(2)}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <button
                      onClick={() => setShowPolicyRef(true)}
                      className="text-[12px] font-bold text-zinc-500 hover:text-zinc-900 flex items-center gap-1.5 transition-colors"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      Read full policy reference
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* ── Action bar ─────────────────────────────────────────── */}
            {selected.approval.status === "pending" && (
              <div className="bg-white/95 backdrop-blur-md border-t border-zinc-200/60 px-10 py-5 flex items-center justify-between flex-shrink-0 shadow-[0_-4px_12px_rgba(0,0,0,0.03)]">
                <div className="flex items-center gap-2 text-[13px] font-medium text-zinc-500">
                  <Clock className="w-4 h-4 text-amber-500" />
                  Pending {relativeTime(selected.approval.requested_at)}
                </div>
                <div className="flex gap-3 items-center">
                  {recommendationKind && (
                    <span className="hidden sm:flex items-center gap-1.5 text-[11px] font-bold text-zinc-400 uppercase tracking-[0.1em] mr-2">
                      <Sparkles className="w-3 h-3" />
                      Sift suggests {recommendationKind}
                    </span>
                  )}
                  <button
                    onClick={() => decide("rejected")}
                    disabled={deciding}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-[12px] border border-zinc-200 text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 text-[14px] font-bold transition-all duration-200 disabled:opacity-50"
                  >
                    <XCircle className="w-4 h-4 text-rose-500" />
                    {deciding ? "Working..." : "Reject"}
                  </button>
                  <button
                    onClick={() => decide("approved")}
                    disabled={deciding}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-[12px] text-white text-[14px] font-bold transition-all duration-200 shadow-sm disabled:opacity-50 ${
                      recommendationKind === "approve"
                        ? "bg-emerald-600 hover:bg-emerald-700"
                        : "bg-zinc-900 hover:bg-black"
                    }`}
                  >
                    <CheckCircle className="w-4 h-4" />
                    {deciding ? "Working..." : "Approve"}
                  </button>
                </div>
              </div>
            )}

            {selected.approval.status !== "pending" && (
              <div className="bg-white border-t border-zinc-200/60 px-10 py-5 flex-shrink-0 shadow-[0_-4px_10px_rgba(0,0,0,0.02)]">
                <div className="flex items-center gap-2.5 text-[14px]">
                  {selected.approval.status === "approved" ? (
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-200/60 font-bold">
                      <CheckCircle className="w-4 h-4" /> Approved
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-rose-50 text-rose-700 rounded-lg border border-rose-200/60 font-bold">
                      <XCircle className="w-4 h-4" /> Rejected
                    </div>
                  )}
                  {(selected.approval.decided_at || selected.approval.resolved_at) && (
                    <span className="text-zinc-500 font-medium ml-2">
                      {relativeTime(selected.approval.decided_at || selected.approval.resolved_at!)}
                    </span>
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

function ToneDot({ tone }: { tone: AiDecision }) {
  const cls =
    tone === "approve" ? "bg-emerald-500" : tone === "reject" ? "bg-rose-500" : "bg-amber-500";
  return <span className={`w-1.5 h-1.5 rounded-full ${cls}`} />;
}

function ContextStat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "good" | "warn";
}) {
  return (
    <div className="px-5 py-4">
      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.12em]">{label}</p>
      <p
        className={`text-[22px] tracking-tight font-bold tabular-nums leading-none mt-2 ${
          tone === "warn" ? "text-amber-600" : "text-zinc-900"
        }`}
      >
        {value}
      </p>
      <p className="text-[11px] font-medium text-zinc-500 mt-1.5">{sub}</p>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.12em]">{label}</p>
      <p className="text-[13px] font-semibold text-zinc-900 mt-1">{value}</p>
    </div>
  );
}

export default function ApprovalsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen"><span className="text-slate-400 text-sm">Loading...</span></div>}>
      <ApprovalsContent />
    </Suspense>
  );
}
