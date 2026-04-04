"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  TrendingUp,
  ShieldAlert,
  CheckCircle,
  FileText,
  ArrowRight,

  Clock,
  DollarSign,
  Users,
  Zap,
  ChevronRight,
} from "lucide-react";
import { getApprovals, getViolations, getReports, getDepartmentSpend, getAgentStats } from "@/lib/api";
import type { Approval, Violation, Report } from "@/lib/types";
import SeverityBadge from "@/components/SeverityBadge";
import MerchantAvatar from "@/components/MerchantAvatar";
import { Button } from "@/components/ui/button";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

const DEPT_COLORS = [
  "#10b981", "#3b82f6", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4", "#ec4899",
];

function greetingText() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function fmtCurrency(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

type AgentStats = {
  total_transactions: number;
  total_spend: number;
  employee_count: number;
  in_policy_count: number;
  violation_count: number;
  pending_approvals: number;
  draft_reports: number;
  compliance_rate: number;
};

export default function Dashboard() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [violations, setViolations] = useState<Violation[]>([]);

  const [stats, setStats] = useState<AgentStats | null>(null);
  const [deptSpend, setDeptSpend] = useState<
    Array<{ department: string; total_spend: number; txn_count: number }>
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getApprovals({ status: "pending", limit: 8 }).catch(() => []),
      getViolations({ limit: 5 }).catch(() => []),
      getReports({ status: "draft" }).catch(() => []),
      getDepartmentSpend().catch(() => []),
      getAgentStats().catch(() => null),
    ]).then(([a, v, r, d, s]) => {
      setApprovals(a);
      setViolations(v);

      setDeptSpend(d);
      setStats(s);
      setLoading(false);
    });
  }, []);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      {/* Greeting */}
      <div className="flex flex-col gap-1.5">
        <h1 className="text-4xl font-semibold tracking-tight text-slate-900 leading-tight">
          {greetingText()}, Manager
        </h1>
        <p className="text-[15px] font-medium text-slate-500">
          {new Date().toLocaleDateString("en-CA", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      {/* Summary stats row */}
      <div className="grid grid-cols-4 gap-5">
        <StatCard
          label="Total Spend"
          value={loading ? "..." : fmtCurrency(stats?.total_spend ?? 0)}
          sub={`${stats?.total_transactions?.toLocaleString() ?? 0} transactions`}
          icon={<DollarSign className="w-4 h-4" />}
          color="text-emerald-700 bg-emerald-100/50"
        />
        <StatCard
          label="Employees"
          value={loading ? "..." : String(stats?.employee_count ?? 0)}
          sub="active cardholders"
          icon={<Users className="w-4 h-4" />}
          color="text-indigo-700 bg-indigo-100/50"
        />
        <StatCard
          label="Pending Reviews"
          value={loading ? "..." : String((stats?.pending_approvals ?? 0) + (stats?.draft_reports ?? 0))}
          sub={`${stats?.pending_approvals ?? 0} approvals, ${stats?.draft_reports ?? 0} reports`}
          icon={<Clock className="w-4 h-4" />}
          color="text-amber-700 bg-amber-100/50"
        />
        <StatCard
          label="Compliance"
          value={loading ? "..." : `${stats?.compliance_rate ?? 100}%`}
          sub={`${stats?.violation_count ?? 0} violations found`}
          icon={<ShieldAlert className="w-4 h-4" />}
          color="text-rose-700 bg-rose-100/50"
        />
      </div>

      {/* Compliance bar */}
      {stats && !loading && (
        <div className="bg-emerald-50/70 backdrop-blur-md border border-emerald-200/60 shadow-sm rounded-2xl px-5 py-3.5 flex items-center gap-3">
          <Zap className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <p className="text-sm text-emerald-900 font-medium">
            <span className="font-bold">{stats.in_policy_count.toLocaleString()}</span> transactions within policy
            <span className="mx-2 text-emerald-300">·</span>
            {stats.compliance_rate}% compliance rate
          </p>
        </div>
      )}

      {/* Main content grid */}
      <div className="grid grid-cols-5 gap-6">
        {/* Requires approval */}
        <div className="col-span-3 bg-white/70 backdrop-blur-xl rounded-3xl border border-white/60 shadow-sm overflow-hidden flex flex-col">
          <div className="px-6 pt-6 pb-4 flex items-center justify-between border-b border-slate-200/40">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-[18px] h-[18px] text-slate-400" />
              <h2 className="font-semibold text-slate-900 tracking-tight text-[19px]">
                Requires your approval
              </h2>
              {!loading && approvals.length > 0 && (
                <span className="bg-amber-100 text-amber-700 text-xs font-semibold px-2 py-0.5 rounded-full ring-1 ring-amber-200/50">
                  {approvals.length}
                </span>
              )}
            </div>
            <Button variant="ghost" size="sm" asChild className="text-emerald-600 hover:text-emerald-700 font-semibold hover:bg-emerald-50 pr-2">
              <Link href="/approvals" className="flex items-center gap-1">
                View all <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </Button>
          </div>
          <div className="divide-y divide-slate-200/40 flex-1">
            {loading ? (
              <LoadingRows n={4} />
            ) : approvals.length === 0 ? (
              <EmptyState
                icon={<CheckCircle className="w-8 h-8 text-slate-200" />}
                text="No pending approvals"
              />
            ) : (
              approvals.slice(0, 6).map((a) => (
                <Link
                  key={a.id}
                  href={`/approvals?id=${a.id}`}
                  className="flex items-center gap-4 px-6 py-4 hover:bg-white/60 transition-all duration-200 group"
                >
                  <MerchantAvatar merchant={a.merchant} mcc={a.mcc} size="md" />
                  <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <div className="flex items-center gap-2.5">
                      <p className="text-[15px] font-semibold text-slate-900 truncate">
                        {a.merchant}
                      </p>
                      {a.ai_recommendation && (
                        <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${
                          a.ai_recommendation.toLowerCase().includes("approve")
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200/60"
                            : a.ai_recommendation.toLowerCase().includes("reject")
                            ? "bg-rose-50 text-rose-700 border border-rose-200/60"
                            : "bg-amber-50 text-amber-700 border border-amber-200/60"
                        }`}>
                          {a.ai_recommendation.toLowerCase().includes("approve")
                            ? "Approve"
                            : a.ai_recommendation.toLowerCase().includes("reject")
                            ? "Deny"
                            : "Review"}
                        </span>
                      )}
                    </div>
                    <p className="text-[13px] font-medium text-slate-500 truncate">
                      {a.employee_name ?? a.employee_id}
                      <span className="text-slate-300 mx-1.5">·</span>
                      {a.department ?? ""}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0 flex items-center gap-2">
                    <p className="text-[15px] font-bold text-slate-900 tabular-nums">
                      ${a.amount.toFixed(2)}
                    </p>
                    <ChevronRight className="w-4 h-4 text-slate-300 transform group-hover:translate-x-1 opacity-0 group-hover:opacity-100 transition-all" />
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="col-span-2 flex flex-col gap-6">
          {/* Recent violations */}
          <div className="bg-white/70 backdrop-blur-xl rounded-3xl border border-white/60 shadow-sm overflow-hidden flex-1">
            <div className="px-6 pt-6 pb-4 border-b border-slate-200/40 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-[18px] h-[18px] text-rose-500" />
                <h2 className="font-semibold text-slate-900 tracking-tight text-[19px]">
                  Recent violations
                </h2>
              </div>
              <Button variant="ghost" size="sm" asChild className="text-emerald-600 hover:text-emerald-700 font-semibold hover:bg-emerald-50 pr-2">
                <Link href="/violations" className="flex items-center gap-1">
                  View all <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </Button>
            </div>
            <div className="divide-y divide-slate-200/40">
              {loading ? (
                <LoadingRows n={3} />
              ) : violations.length === 0 ? (
                <EmptyState
                  icon={<ShieldAlert className="w-8 h-8 text-slate-200" />}
                  text="No violations found"
                />
              ) : (
                violations.slice(0, 4).map((v, i) => (
                  <div key={i} className="px-6 py-4 hover:bg-white/60 transition-colors">
                    <div className="flex items-start justify-between gap-3 mb-1.5">
                      <p className="text-[14px] font-medium text-slate-800 leading-relaxed flex-1">
                        {v.description.length > 70
                          ? v.description.slice(0, 70) + "..."
                          : v.description}
                      </p>
                      <SeverityBadge severity={v.severity} />
                    </div>
                    <p className="text-[12px] text-slate-500 font-medium">
                      {v.employee_name ?? v.employee_id}
                      {v.department && <span className="text-slate-300 mx-1.5">·</span>}
                      {v.department}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Quick actions */}
          <div className="bg-white/70 backdrop-blur-xl rounded-3xl border border-white/60 shadow-sm p-6">
            <h2 className="text-[19px] font-semibold tracking-tight text-slate-900 mb-4">
              Quick actions
            </h2>
            <div className="space-y-3">
              <QuickAction
                href="/chat"
                icon={<TrendingUp className="w-[18px] h-[18px]" />}
                label="Analyze spending trends"
                color="green"
              />
              <QuickAction
                href="/violations"
                icon={<ShieldAlert className="w-[18px] h-[18px]" />}
                label="Run compliance scan"
                color="red"
              />
              <QuickAction
                href="/reports"
                icon={<FileText className="w-[18px] h-[18px]" />}
                label="Generate expense report"
                color="purple"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Department Spend Chart */}
      {!loading && deptSpend.length > 0 && (
        <div className="bg-white/70 backdrop-blur-xl rounded-3xl border border-white/60 shadow-sm p-7">
          <h2 className="text-[19px] font-semibold tracking-tight text-slate-900 mb-6">
            Spend by Department
          </h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={deptSpend} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <XAxis
                dataKey="department"
                tick={{ fontSize: 12, fill: "#64748b", fontWeight: 500 }}
                axisLine={false}
                tickLine={false}
                dy={10}
              />
              <YAxis
                tick={{ fontSize: 12, fill: "#64748b", fontWeight: 500 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}K`}
                dx={-10}
              />
              <Tooltip
                cursor={{ fill: "#f1f5f9" }}
                formatter={(v) => [`$${Number(v).toLocaleString("en-CA", { minimumFractionDigits: 2 })}`, "Spend"]}
                labelFormatter={(l) => `${l} department`}
                contentStyle={{ fontSize: 13, borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)" }}
              />
              <Bar dataKey="total_spend" radius={[8, 8, 0, 0]} maxBarSize={48}>
                {deptSpend.map((_, i) => (
                  <Cell key={i} fill={DEPT_COLORS[i % DEPT_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="bg-white/70 backdrop-blur-xl rounded-[28px] border border-white/60 shadow-sm p-6 flex flex-col gap-3 transition-all duration-300 hover:bg-white/90 hover:shadow-md hover:-translate-y-0.5">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-bold text-slate-500 uppercase tracking-widest">
          {label}
        </span>
        <div className={`w-9 h-9 rounded-full flex items-center justify-center ${color}`}>
          {icon}
        </div>
      </div>
      <div>
        <p className="text-[32px] tracking-tight font-bold text-slate-900 tabular-nums leading-none">{value}</p>
        <p className="text-[13px] font-medium text-slate-500 mt-2.5">{sub}</p>
      </div>
    </div>
  );
}

function QuickAction({
  href,
  icon,
  label,
  color,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  color: string;
}) {
  const cls: Record<string, string> = {
    green: "text-emerald-800 bg-emerald-100/40 hover:bg-emerald-100/70 border border-emerald-200/50",
    red: "text-rose-800 bg-rose-100/40 hover:bg-rose-100/70 border border-rose-200/50",
    purple: "text-indigo-800 bg-indigo-100/40 hover:bg-indigo-100/70 border border-indigo-200/50",
  };
  return (
    <Link
      href={href}
      className={`flex items-center gap-3.5 px-4 py-3.5 rounded-2xl text-[15px] font-semibold transition-all duration-200 hover:shadow-sm ${cls[color]}`}
    >
      <div className="bg-white/80 p-2 rounded-xl shadow-sm border border-white/50">
        {icon}
      </div>
      {label}
      <ArrowRight className="w-4 h-4 ml-auto opacity-60" />
    </Link>
  );
}

function LoadingRows({ n }: { n: number }) {
  return (
    <>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="px-4 py-3 flex items-center gap-3 animate-pulse">
          <div className="w-7 h-7 rounded-full bg-slate-100" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 bg-slate-100 rounded w-2/3" />
            <div className="h-2 bg-slate-100 rounded w-1/2" />
          </div>
          <div className="h-3 bg-slate-100 rounded w-14" />
        </div>
      ))}
    </>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="px-4 py-8 flex flex-col items-center gap-2 text-slate-400">
      {icon}
      <p className="text-sm">{text}</p>
    </div>
  );
}
