"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Filter, X, Receipt, ChevronRight, ArrowUpRight } from "lucide-react";
import {
  getApprovals,
  getTransactionDetail,
} from "@/lib/api";
import type {
  Approval,
  TransactionDetail,
} from "@/lib/types";

import MerchantAvatar from "@/components/MerchantAvatar";
import RecommendationBadge from "@/components/RecommendationBadge";
import SubmissionStatusBadges from "@/components/SubmissionStatusBadges";
import TransactionSubmissionForm from "@/components/TransactionSubmissionForm";
import AIRecommendationCard from "@/components/AIRecommendationCard";
import ActivityFeed from "@/components/ActivityFeed";

/**
 * /transactions — Sift's company-wide transaction browser.
 *
 * Sift is a finance-team product. This page is the manager's view into
 * every card transaction across the org, with the AI's recommendation,
 * what the employee submitted (receipt, memo, attendees), and the audit
 * trail. Editing the submission is admin-corrective — the manager can
 * fill in what an employee forgot — but the primary mode is review.
 */
export default function ExpensesPage() {
  const [rows, setRows] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "missing">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [selected, setSelected] = useState<TransactionDetail | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  async function load() {
    setLoading(true);
    try {
      const data = await getApprovals({
        status: statusFilter === "all" ? undefined : statusFilter,
        limit: 200,
      });
      setRows(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [statusFilter]); // eslint-disable-line

  async function open(rowid: number, approvalId: number) {
    setOpenId(approvalId);
    const detail = await getTransactionDetail(rowid);
    setSelected(detail);
  }

  function close() {
    setSelected(null);
    setOpenId(null);
  }

  const filteredRows = useMemo(() => {
    // Without per-row submission state we can only filter by status here.
    // The drawer surfaces missing fields per row; for the list, "missing" is
    // approximated as "pending without an AI decision" — those are the ones
    // the agent paused on, very likely missing context.
    if (filter === "missing") return rows.filter((r) => r.status === "pending" && r.ai_decision === "review");
    return rows;
  }, [rows, filter]);

  return (
    <div className="flex h-full bg-transparent">
      {/* Left: list */}
      <div className="flex-1 overflow-hidden flex flex-col min-w-0">
        <header className="px-8 py-6 border-b border-zinc-100 bg-white/70 backdrop-blur-xl flex-shrink-0">
          <h1 className="text-[24px] font-bold tracking-tight text-zinc-900 leading-none mb-1.5">
            Transactions
          </h1>

          <div className="flex items-center gap-2 mt-5 flex-wrap">
            <div className="flex items-center bg-zinc-100/80 p-1 rounded-full">
              {(["all", "pending", "approved", "rejected"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 rounded-full text-[12px] font-bold capitalize transition-all ${
                    statusFilter === s ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-900"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 ml-auto">
              <button
                onClick={() => setFilter(filter === "missing" ? "all" : "missing")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold transition-all ${
                  filter === "missing"
                    ? "bg-amber-50 text-amber-700 border border-amber-200"
                    : "text-zinc-500 border border-transparent hover:bg-zinc-50"
                }`}
              >
                <Filter className="w-3 h-3" />
                {filter === "missing" ? "Showing review-needed" : "Filter: review needed"}
              </button>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-zinc-400">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="flex flex-col items-center py-20 text-zinc-400 gap-3">
              <Receipt className="w-8 h-8" />
              <p className="text-[13px] font-medium">No expenses match this filter</p>
            </div>
          ) : (
            <div className="px-6 py-4 space-y-2">
              {filteredRows.map((r) => (
                <button
                  key={r.id}
                  onClick={() => open(r.transaction_rowid, r.id)}
                  className={`w-full text-left bg-white border rounded-[16px] px-5 py-4 flex items-center gap-4 transition-all ${
                    openId === r.id
                      ? "border-zinc-900 shadow-md"
                      : "border-zinc-200/70 hover:border-zinc-300 hover:shadow-sm"
                  }`}
                >
                  <MerchantAvatar merchant={r.merchant} mcc={r.mcc} size="md" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[14px] font-bold text-zinc-900 truncate">{r.merchant}</p>
                      {r.ai_decision && (
                        <RecommendationBadge
                          decision={r.ai_decision}
                          citation={r.policy_citation}
                          sectionId={r.cited_section_id}
                          size="sm"
                          hideInfo
                        />
                      )}
                    </div>
                    <p className="text-[12px] text-zinc-500 font-medium mt-0.5 truncate">
                      {r.employee_name ?? r.employee_id}
                      <span className="text-zinc-300 mx-1.5">·</span>
                      {r.transaction_date?.slice(0, 10) ?? r.requested_at.slice(0, 10)}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[14px] font-bold text-zinc-900 tabular-nums">${r.amount.toFixed(2)}</p>
                    <p className="text-[11px] text-zinc-400 font-medium uppercase tracking-wider mt-0.5">{r.status}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-zinc-300 flex-shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right: drawer */}
      {selected && (
        <aside className="w-[500px] flex-shrink-0 border-l border-zinc-200/40 bg-zinc-50/40 flex flex-col">
          <div className="px-6 py-5 border-b border-zinc-100 bg-white/80 backdrop-blur-xl flex items-center justify-between flex-shrink-0">
            <div>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.12em] mb-1">
                Transaction #{selected.transaction.rowid}
              </p>
              <p className="text-[14px] font-bold text-zinc-900 tracking-tight">
                {String(selected.transaction.merchant_info_dba_name ?? "")}
              </p>
            </div>
            <button onClick={close} className="p-2 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {/* Status badges */}
            <SubmissionStatusBadges
              submission={selected.submission}
              missing={selected.missing_required_fields}
            />

            {/* AI recommendation (read-only on this page — decisions live
                in /approvals so the queue stays the single source of truth) */}
            {selected.approval?.ai_decision && selected.approval?.ai_reasoning && (
              <div className="space-y-2">
                <AIRecommendationCard
                  decision={selected.approval.ai_decision}
                  reasoning={selected.approval.ai_reasoning}
                  citation={selected.approval.policy_citation}
                  citedSectionId={selected.approval.cited_section_id}
                  compact
                />
                {selected.approval.status === "pending" && (
                  <Link
                    href="/approvals"
                    className="flex items-center justify-between gap-2 px-4 py-2.5 rounded-[12px] bg-zinc-900 hover:bg-black text-white text-[12.5px] font-bold transition-all"
                  >
                    <span>Decide this in Approvals</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </Link>
                )}
              </div>
            )}

            {/* Submission form */}
            <TransactionSubmissionForm
              detail={selected}
              onChange={(next) => {
                // Local-only update so an in-flight save in one field doesn't
                // reset other fields the user is still editing.
                setSelected(next);
                setRefreshKey((k) => k + 1);
              }}
            />

            {/* Activity feed */}
            <div className="bg-white border border-zinc-200/70 rounded-[20px] shadow-sm p-5">
              <ActivityFeed
                transactionRowid={selected.transaction.rowid}
                limit={20}
                refreshKey={refreshKey}
                title="Activity"
                compact
              />
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}
