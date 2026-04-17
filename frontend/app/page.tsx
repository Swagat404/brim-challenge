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
} from "lucide-react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts";
import { getApprovals, getViolations, getReports, getDepartmentSpend, getAgentStats } from "@/lib/api";
import type { Approval, Violation } from "@/lib/types";
import SeverityBadge from "@/components/SeverityBadge";
import MerchantAvatar from "@/components/MerchantAvatar";
import RecommendationBadge from "@/components/RecommendationBadge";
import { Button } from "@/components/ui/button";
import { LiquidButton } from "@/components/ui/liquid-glass-button";

import HorizontalFlowBars from "@/components/ui/horizontal-flow-bars";

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

import type { AgentStats } from "@/lib/types";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function fmtMonthYear(iso: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const [, y, mm] = m;
  const idx = parseInt(mm, 10) - 1;
  if (idx < 0 || idx > 11) return iso;
  return `${MONTHS[idx]} ${y}`;
}

function fmtDataWindow(window?: { start: string; end: string }): string {
  if (!window?.start || !window?.end) return "";
  return `${fmtMonthYear(window.start)} – ${fmtMonthYear(window.end)}`;
}

function SpendTrendCard({ spend90: spend }: { spend90: number }) {
  // The sparkline is decorative (we don't have a daily trend series cached
  // yet); the headline number is the real 90-day spend from the API.
  const trendData = [
    { value: 10 }, { value: 12 }, { value: 11 }, { value: 14 },
    { value: 18 }, { value: 24 }, { value: 35 }, { value: 55 }, { value: 100 }
  ];

  return (
    <Link href="/reports" className="bg-white rounded-[24px] border border-zinc-200/60 shadow-sm p-6 flex justify-between items-center hover:shadow-md transition-all group">
      <div className="flex flex-col justify-between h-full">
        <p className="text-[13px] font-medium text-zinc-500 mb-2">Spend last 90 days</p>
        <div className="flex items-center gap-1">
          <p className="text-[28px] font-bold text-zinc-900 tracking-tight leading-none">
            {fmtCurrency(spend)}
          </p>
          <ArrowRight className="w-5 h-5 text-zinc-400 group-hover:text-zinc-900 transition-colors ml-1" />
        </div>
      </div>
      <div className="w-[100px] h-[50px] mt-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={trendData}>
            <defs>
              <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8b9286" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#8b9286" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <Area type="monotone" dataKey="value" stroke="#8b9286" strokeWidth={2} fillOpacity={1} fill="url(#trendGradient)" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Link>
  );
}

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
    <div className="p-10 max-w-7xl mx-auto space-y-10 animate-in fade-in duration-500">
      {/* Dashboard Header */}
      <div className="mb-12 pt-4">
        <div className="flex items-center gap-2 text-zinc-400 mb-4">
          <Zap className="w-4 h-4" />
          <span className="text-[11px] font-bold tracking-[0.2em] uppercase">
            Total spend
            {stats?.data_window?.start && stats?.data_window?.end && (
              <span className="ml-2 text-zinc-500 font-medium tracking-normal normal-case">
                · {fmtDataWindow(stats.data_window)}
              </span>
            )}
          </span>
        </div>
        <div className="flex items-end gap-6 mb-10">
          <h1 className="text-[64px] font-bold tracking-tighter text-zinc-900 leading-none">
            ${stats?.total_spend ? stats.total_spend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"}
          </h1>
        </div>
        
        {/* Department Sub-stats — same window as the headline */}
        <div className="flex flex-wrap gap-12 border-b border-zinc-100 pb-8 mb-8">
          {[...deptSpend].sort((a, b) => b.total_spend - a.total_spend).slice(0, 5).map((d, i) => (
            <div key={d.department} className="flex flex-col gap-1">
              <div className="flex items-center gap-2 text-zinc-900 font-bold text-[22px] tracking-tight">
                <div className={`w-2 h-2 rounded-full ${i === 0 ? "bg-[#8b9286]" : "bg-zinc-300"}`} />
                ${d.total_spend.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
              <span className="text-[13px] text-zinc-500 font-medium pl-4">{d.department}</span>
            </div>
          ))}
        </div>

        {/* Animated Vertical Bars Chart */}
        <div className="w-full h-[240px] relative rounded-[24px] border border-zinc-200/60 shadow-sm overflow-hidden mb-8">
          <HorizontalFlowBars
            backgroundColor="#ffffff"
            lineColor="#a1a1aa"
            barColor="#000000"
            lineWidth={1}
            animationSpeed={0.0005}
            removeWaveLine={true}
          />
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <SpendTrendCard spend90={stats?.spend_90_days ?? 0} />
          <StatCard
            label="Active Employees"
            value={stats ? stats.employee_count.toString() : "0"}
            sub="Across all departments"
            icon={<Users className="w-5 h-5 text-zinc-600" strokeWidth={2.5} />}
            color="bg-white border border-zinc-200/60 shadow-sm"
          />
          <StatCard
            label="Policy Violations"
            value={stats ? stats.violation_count.toString() : "0"}
            sub={
              stats && stats.total_transactions > 0
                ? `${((stats.violation_count / stats.total_transactions) * 100).toFixed(1)}% of total`
                : "0% of total"
            }
            icon={<ShieldAlert className="w-5 h-5 text-zinc-600" strokeWidth={2.5} />}
            color="bg-white border border-zinc-200/60 shadow-sm"
          />
          <StatCard
            label="Pending Approvals"
            value={stats ? stats.pending_approvals.toString() : "0"}
            sub="Requires your attention"
            icon={<Clock className="w-5 h-5 text-zinc-600" strokeWidth={2.5} />}
            color="bg-white border border-zinc-200/60 shadow-sm"
          />
        </div>
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Requires approval */}
        <div className="col-span-3 bg-white rounded-[24px] border border-zinc-200/60 shadow-sm overflow-hidden flex flex-col">
          <div className="px-6 pt-6 pb-4 flex items-center justify-between border-b border-zinc-100">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-zinc-50 flex items-center justify-center">
                <CheckCircle className="w-4 h-4 text-zinc-400" />
              </div>
              <h2 className="font-bold text-zinc-900 tracking-tight text-[16px]">
                Requires your approval
              </h2>
            </div>
            <Button variant="ghost" size="sm" asChild className="text-[13px] text-zinc-500 hover:text-zinc-900 font-medium hover:bg-transparent pr-2">
              <Link href="/approvals" className="flex items-center gap-1.5">
                View all <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </Button>
          </div>
          <div className="divide-y divide-zinc-100 flex-1 px-2">
            {loading ? (
              <LoadingRows n={4} />
            ) : approvals.length === 0 ? (
              <EmptyState
                icon={<CheckCircle className="w-8 h-8 text-zinc-200" />}
                text="No pending approvals"
              />
            ) : (
              approvals.slice(0, 6).map((a) => (
                <Link
                  key={a.id}
                  href={`/approvals?id=${a.id}`}
                  className="flex items-center gap-4 px-4 py-3.5 hover:bg-zinc-50 rounded-xl transition-all duration-200 group"
                >
                  <MerchantAvatar merchant={a.merchant} mcc={a.mcc} size="md" />
                  <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      {a.ai_decision && (
                        <RecommendationBadge decision={a.ai_decision} variant="dot" />
                      )}
                      <p className="text-[14px] font-semibold text-zinc-900 truncate">
                        {a.merchant}
                      </p>
                    </div>
                    <p className="text-[12px] font-medium text-zinc-500 truncate">
                      {a.employee_name ?? a.employee_id}
                      <span className="text-zinc-300 mx-1.5">·</span>
                      {a.department ?? ""}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0 flex flex-col items-end justify-center">
                    <p className="text-[14px] font-bold text-zinc-900 tabular-nums">
                      ${a.amount ? a.amount.toFixed(2) : "0.00"}
                    </p>
                    <p className="text-[11px] text-zinc-400 font-medium mt-0.5">{a.transaction_date ? a.transaction_date.split(" ")[0] : ""}</p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="col-span-2 flex flex-col gap-6">
          {/* Recent violations */}
          <div className="bg-white rounded-[24px] border border-zinc-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] overflow-hidden flex-1">
            <div className="px-6 pt-6 pb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-[18px] h-[18px] text-zinc-400" />
                <h2 className="font-semibold text-zinc-900 tracking-tight text-[16px]">
                  Recent violations
                </h2>
              </div>
              <Button variant="ghost" size="sm" asChild className="text-[13px] text-zinc-500 hover:text-zinc-900 font-medium hover:bg-transparent pr-2">
                <Link href="/violations" className="flex items-center gap-1">
                  View all <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </Button>
            </div>
            <div className="divide-y divide-zinc-100 px-2 pb-2">
              {loading ? (
                <LoadingRows n={3} />
              ) : violations.length === 0 ? (
                <EmptyState
                  icon={<ShieldAlert className="w-8 h-8 text-zinc-200" />}
                  text="No violations found"
                />
              ) : (
                violations.slice(0, 4).map((v, i) => {
                  const title = v.violation_type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
                  return (
                    <Link key={i} href="/violations" className="flex items-center gap-4 px-4 py-3.5 hover:bg-zinc-50 rounded-xl transition-all duration-200 group">
                      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                        <p className="text-[14px] font-semibold text-zinc-900 truncate">
                          {v.employee_name ?? v.employee_id}
                          {v.department && <span className="text-zinc-300 mx-1.5">·</span>}
                          <span className="font-medium text-zinc-500">{v.department}</span>
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0 flex flex-col items-end gap-1.5">
                        <p className="text-[14px] font-bold text-zinc-900 tabular-nums">
                          ${v.amount ? v.amount.toFixed(2) : "0.00"}
                        </p>
                        <SeverityBadge severity={v.severity} />
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </div>

          {/* Quick actions */}
          <div className="bg-white rounded-[24px] border border-zinc-200/60 shadow-sm p-6 flex flex-col">
            <h2 className="font-bold text-zinc-900 tracking-tight text-[16px] mb-5 border-b border-zinc-100 pb-4">
              Quick actions
            </h2>
            <div className="space-y-3">
              <Link href="/chat" className="block w-full">
                <LiquidButton className="w-full justify-start font-semibold text-zinc-700 py-6 px-6">
                  <TrendingUp className="w-[18px] h-[18px] text-zinc-400 mr-2" /> Analyze spending trends
                </LiquidButton>
              </Link>
              <Link href="/violations" className="block w-full">
                <LiquidButton className="w-full justify-start font-semibold text-zinc-700 py-6 px-6">
                  <ShieldAlert className="w-[18px] h-[18px] text-zinc-400 mr-2" /> Run compliance scan
                </LiquidButton>
              </Link>
              <Link href="/reports" className="block w-full">
                <LiquidButton className="w-full justify-start font-semibold text-zinc-700 py-6 px-6">
                  <FileText className="w-[18px] h-[18px] text-zinc-400 mr-2" /> Generate expense report
                </LiquidButton>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Department Spend Chart */}
      {!loading && deptSpend.length > 0 && (
        <div className="bg-white rounded-[24px] border border-zinc-200/60 shadow-sm p-8">
          <h2 className="font-bold text-zinc-900 tracking-tight text-[18px] mb-6">
            Spend by Department
          </h2>
          <div className="w-full h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[...deptSpend].sort((a, b) => b.total_spend - a.total_spend)} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis 
                  dataKey="department" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#71717a', fontSize: 12, fontWeight: 500 }} 
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#71717a', fontSize: 12, fontWeight: 500 }}
                  tickFormatter={(val) => `$${val >= 1000 ? (val / 1000).toFixed(0) + 'k' : val}`}
                />
                <RechartsTooltip 
                  cursor={{ fill: '#f4f4f5' }}
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e4e4e7', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)', padding: '12px' }}
                  formatter={(value) => {
                    const n =
                      typeof value === 'number'
                        ? value
                        : value === undefined || value === null
                          ? NaN
                          : Number(value);
                    if (!Number.isFinite(n)) return ['—', 'Spend'];
                    return [
                      `$${n.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}`,
                      'Spend',
                    ];
                  }}
                  labelStyle={{ fontWeight: 'bold', color: '#18181b', marginBottom: '4px' }}
                />
                <Bar dataKey="total_spend" fill="#8b9286" radius={[4, 4, 0, 0]} maxBarSize={60} />
              </BarChart>
            </ResponsiveContainer>
          </div>
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
    <div className="bg-white rounded-[24px] border border-zinc-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] p-6 flex flex-col gap-3 transition-all duration-300 hover:shadow-md hover:-translate-y-0.5">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-bold text-zinc-500 uppercase tracking-widest">
          {label}
        </span>
        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${color}`}>
          {icon}
        </div>
      </div>
      <div>
        <p className="text-[32px] tracking-tight font-bold text-zinc-900 tabular-nums leading-none">{value}</p>
        <p className="text-[13px] font-medium text-zinc-500 mt-2.5">{sub}</p>
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
  return (
    <Link
      href={href}
      className="flex items-center gap-3.5 px-4 py-4 rounded-2xl text-[14px] font-medium text-zinc-700 hover:text-zinc-900 border border-zinc-200/60 hover:border-zinc-300 hover:bg-zinc-50/50 transition-all duration-200 group shadow-[0_1px_2px_rgba(0,0,0,0.01)]"
    >
      <div className="text-zinc-400 group-hover:text-zinc-600 transition-colors">
        {icon}
      </div>
      <span className="flex-1">{label}</span>
      <ArrowRight className="w-4 h-4 text-zinc-300 group-hover:text-zinc-500 transition-colors" />
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
