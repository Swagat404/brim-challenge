"use client";

import { useEffect, useState, useMemo } from "react";
import {
  ShieldAlert,
  RefreshCw,
  Loader2,
  TrendingUp,
  Users,
  BookOpen,
  ChevronDown,
  Layers,
  List,
} from "lucide-react";
import { getViolations, getPolicySummary, triggerPolicyScan } from "@/lib/api";
import type { Violation } from "@/lib/types";
import SeverityBadge from "@/components/SeverityBadge";
import AIRecommendationCard from "@/components/AIRecommendationCard";
import PolicyReferenceModal from "@/components/PolicyReferenceModal";

const VIOLATION_LABELS: Record<string, string> = {
  SPLIT_TRANSACTION: "Split transaction",
  PERSONAL_EXPENSE: "Personal expense on corporate card",
  HIGH_MEAL_EXPENSE: "High meal / dining charge",
  ALCOHOL_NO_CONTEXT: "Alcohol without business context",
  DUPLICATE_CHARGE: "Duplicate charge",
  LUXURY_HOTEL: "Luxury hotel charge",
  // legacy keys from old scans
  OVER_THRESHOLD_NO_AUTH: "Over pre-auth threshold",
  HIGH_AMOUNT_SOLO: "High meal amount",
  TIP_EXCESSIVE: "Excessive tip",
};

const VIOLATION_COLORS: Record<string, string> = {
  SPLIT_TRANSACTION: "bg-red-500",
  PERSONAL_EXPENSE: "bg-orange-500",
  HIGH_MEAL_EXPENSE: "bg-amber-500",
  ALCOHOL_NO_CONTEXT: "bg-purple-500",
  DUPLICATE_CHARGE: "bg-blue-500",
  LUXURY_HOTEL: "bg-indigo-500",
  OVER_THRESHOLD_NO_AUTH: "bg-slate-400",
  HIGH_AMOUNT_SOLO: "bg-amber-400",
  TIP_EXCESSIVE: "bg-cyan-500",
};

type ViewMode = "grouped" | "flat";

export default function ViolationsPage() {
  const [violations, setViolations] = useState<Violation[]>([]);
  const [summary, setSummary] = useState<{
    by_severity: Array<{ severity: string; count: number; total_amount: number }>;
    top_offenders: Array<{ employee_name: string; violation_count: number; total_flagged: number }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [severity, setSeverity] = useState<string>("all");
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>("grouped");
  const [showPolicyRef, setShowPolicyRef] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [v, s] = await Promise.all([
        getViolations({ severity: severity === "all" ? undefined : severity, limit: 200 }),
        getPolicySummary().catch(() => null),
      ]);
      setViolations(v);
      setSummary(s);
    } finally {
      setLoading(false);
    }
  }

  async function rescan() {
    setScanning(true);
    try {
      const result = await triggerPolicyScan();
      if (result.error) console.warn("Scan warning:", result.error);
    } catch (e) {
      console.error("Scan failed:", e);
    } finally {
      await load();
      setScanning(false);
    }
  }

  useEffect(() => { load(); }, [severity]); // eslint-disable-line

  const totalViolations = summary
    ? summary.by_severity.reduce((s, r) => s + r.count, 0)
    : violations.length;

  const grouped = useMemo(() => {
    const groups: Record<string, Violation[]> = {};
    for (const v of violations) {
      const key = v.violation_type || "OTHER";
      if (!groups[key]) groups[key] = [];
      groups[key].push(v);
    }
    return Object.entries(groups)
      .map(([type, items]) => ({
        type,
        label: VIOLATION_LABELS[type] ?? type.replace(/_/g, " "),
        color: VIOLATION_COLORS[type] ?? "bg-slate-500",
        items,
        totalAmount: items.reduce((s, v) => s + (v.amount ?? 0), 0),
      }))
      .sort((a, b) => b.items.length - a.items.length);
  }, [violations]);

  function toggleGroup(type: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 pb-16">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 flex items-center gap-3">
            <ShieldAlert className="w-7 h-7 text-rose-600" />
            Policy Violations
          </h1>
          <p className="text-[15px] font-medium text-slate-500 mt-2">
            AI-powered compliance scan with deterministic rules + context enrichment
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex bg-slate-100 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode("grouped")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium transition-colors ${
                viewMode === "grouped" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Layers className="w-3 h-3" />
              Grouped
            </button>
            <button
              onClick={() => setViewMode("flat")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium transition-colors ${
                viewMode === "flat" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <List className="w-3 h-3" />
              List
            </button>
          </div>

          <button
            onClick={rescan}
            disabled={scanning || loading}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200/80 rounded-lg text-[13px] font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${scanning ? "animate-spin" : ""}`} />
            {scanning ? "Scanning..." : "Rescan"}
          </button>
        </div>
      </div>

      {/* Severity filter cards */}
      <div className="grid grid-cols-4 gap-5">
        {(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map((s) => {
          const row = summary?.by_severity.find((r) => r.severity === s);
          const count = row?.count ?? 0;
          const cls: Record<string, string> = {
            CRITICAL: "border-rose-200/80 bg-gradient-to-br from-rose-100/60 to-white text-rose-900",
            HIGH: "border-orange-200/80 bg-gradient-to-br from-orange-100/60 to-white text-[#8a3c14]",
            MEDIUM: "border-amber-200/80 bg-gradient-to-br from-amber-100/60 to-white text-[#7d4814]",
            LOW: "border-emerald-200/80 bg-gradient-to-br from-emerald-100/60 to-white text-[#0f5c40]",
          };
          return (
            <button
              key={s}
              onClick={() => setSeverity(severity === s ? "all" : s)}
              className={`border-2 rounded-[20px] p-6 text-left transition-all duration-200 ${cls[s]} ${
                severity === s ? "ring-2 ring-offset-2 ring-current/30 scale-[1.02] shadow-sm" : "hover:border-current/40 hover:scale-[1.01]"
              }`}
            >
              <p className="text-5xl font-black tabular-nums tracking-tighter mb-1">{loading ? "..." : count}</p>
              <p className="text-xs font-bold uppercase tracking-wider opacity-80">{s}</p>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-5">
        {/* Violations list */}
        <div className="col-span-2 space-y-3">
          {loading ? (
            <div className="bg-white rounded-xl border border-slate-200/80 flex items-center justify-center py-16">
              <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
            </div>
          ) : violations.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200/80 flex flex-col items-center py-16 gap-2 text-slate-400">
              <ShieldAlert className="w-8 h-8" />
              <p className="text-sm">No violations found</p>
              <p className="text-[11px]">Run a scan to check for policy violations</p>
            </div>
          ) : viewMode === "grouped" ? (
            grouped.map((group) => {
              const isCollapsed = collapsedGroups.has(group.type);
              return (
                <div key={group.type} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-5">
                  {/* Group header */}
                  <button
                    onClick={() => toggleGroup(group.type)}
                    className="w-full flex items-center gap-3 px-6 py-4 hover:bg-slate-50/80 transition-colors bg-white select-none"
                  >
                    <span className={`w-3 h-3 rounded-full flex-shrink-0 ${group.color}`} />
                    <div className="flex-1 text-left flex items-baseline gap-3">
                      <span className="text-[15px] font-bold text-slate-900">{group.label}</span>
                      <span className="text-[13px] font-semibold text-slate-400">
                        {group.items.length} violation{group.items.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <span className="text-[15px] font-extrabold text-slate-900 tabular-nums mr-3">
                      ${group.totalAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })} CAD
                    </span>
                    <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${isCollapsed ? "-rotate-90" : ""}`} />
                  </button>

                  {/* Group items */}
                  {!isCollapsed && (
                    <div className="border-t border-slate-200 divide-y divide-slate-100">
                      {group.items.map((v, i) => {
                        const itemKey = `${group.type}-${i}`;
                        const isOpen = expandedItem === itemKey;
                        return (
                          <div key={i}>
                            <button
                              onClick={() => setExpandedItem(isOpen ? null : itemKey)}
                              className={`w-full text-left px-6 py-4 hover:bg-slate-50/80 transition-colors ${isOpen ? "bg-slate-50/80" : ""}`}
                            >
                              <div className="flex items-center gap-3.5">
                                <EmployeeAvatar name={v.employee_name ?? v.employee_id} />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2.5 mb-0.5">
                                    <span className="text-[14px] font-bold text-slate-900 truncate">
                                      {v.employee_name ?? v.employee_id}
                                    </span>
                                    <SeverityBadge severity={v.severity} />
                                  </div>
                                  <p className="text-[13px] font-medium text-slate-500 truncate mt-1">
                                    {v.description.length > 80 ? v.description.slice(0, 80) + "..." : v.description}
                                  </p>
                                </div>
                                <div className="text-right flex-shrink-0">
                                  <p className="text-[16px] font-extrabold text-slate-900 tabular-nums">
                                    ${(v.amount ?? 0).toFixed(2)}
                                  </p>
                                  {v.department && (
                                    <p className="text-xs font-semibold text-slate-400 mt-0.5">{v.department}</p>
                                  )}
                                </div>
                              </div>
                            </button>
                            {isOpen && (
                              <div className="px-6 pb-5 bg-slate-50/80 border-t border-slate-100">
                                <div className="mt-4">
                                  <AIRecommendationCard type="deny" reasoning={v.description} />
                                </div>
                                <div className="flex items-center gap-5 mt-3">
                                  <p className="text-xs font-semibold text-slate-400">
                                    Detected: {v.detected_at?.slice(0, 19).replace("T", " ")}
                                  </p>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setShowPolicyRef(true); }}
                                    className="text-xs font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1.5 transition-colors"
                                  >
                                    <BookOpen className="w-3.5 h-3.5" />
                                    Review Policy
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            /* Flat list view */
            <div className="bg-white rounded-xl border border-slate-200/80 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100">
                <span className="text-[13px] font-semibold text-slate-800">
                  {violations.length} violations
                  {severity !== "all" && (
                    <span className="ml-2 text-[11px] font-normal text-slate-500">
                      filtered: {severity}
                      <button onClick={() => setSeverity("all")} className="ml-2 text-green-600 hover:underline font-medium">
                        Clear
                      </button>
                    </span>
                  )}
                </span>
              </div>
              <div className="divide-y divide-slate-50">
                {violations.map((v, i) => {
                  const itemKey = `flat-${i}`;
                  const isOpen = expandedItem === itemKey;
                  return (
                    <div key={i}>
                      <button
                        onClick={() => setExpandedItem(isOpen ? null : itemKey)}
                        className={`w-full text-left px-4 py-3 hover:bg-slate-50/50 transition-colors ${isOpen ? "bg-slate-50/50" : ""}`}
                      >
                        <div className="flex items-start gap-2.5">
                          <EmployeeAvatar name={v.employee_name ?? v.employee_id} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <SeverityBadge severity={v.severity} />
                              <span className="text-[11px] text-slate-500">
                                {VIOLATION_LABELS[v.violation_type] ?? v.violation_type.replace(/_/g, " ")}
                              </span>
                            </div>
                            <p className="text-[13px] text-slate-800 leading-snug">
                              {v.description.length > 95 ? v.description.slice(0, 95) + "..." : v.description}
                            </p>
                            <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-400">
                              <span className="font-medium text-slate-600">
                                {v.employee_name ?? v.employee_id}
                              </span>
                              {v.department && <span>· {v.department}</span>}
                              {(v.amount ?? 0) > 0 && (
                                <span className="font-medium text-slate-600 tabular-nums">
                                  · ${(v.amount ?? 0).toFixed(2)} CAD
                                </span>
                              )}
                            </div>
                          </div>
                          <ChevronDown className={`w-3.5 h-3.5 text-slate-300 flex-shrink-0 mt-1 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                        </div>
                      </button>
                      {isOpen && (
                        <div className="px-4 pb-3 bg-slate-50/50 border-t border-slate-100">
                          <div className="mt-3">
                            <AIRecommendationCard type="deny" reasoning={v.description} />
                          </div>
                          <div className="flex items-center gap-4 mt-2.5">
                            <p className="text-[11px] text-slate-400">
                              Detected: {v.detected_at?.slice(0, 19).replace("T", " ")}
                            </p>
                            <button
                              onClick={(e) => { e.stopPropagation(); setShowPolicyRef(true); }}
                              className="text-[11px] text-slate-500 hover:text-slate-700 flex items-center gap-1 transition-colors"
                            >
                              <BookOpen className="w-3 h-3" />
                              Policy reference
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div className="space-y-6">
          {summary && (
            <>
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <div className="flex items-center gap-2.5 mb-3">
                  <TrendingUp className="w-4 h-4 text-slate-400" />
                  <span className="text-[15px] font-bold text-slate-900">Summary</span>
                </div>
                <p className="text-6xl font-black tracking-tighter text-slate-900 tabular-nums leading-none">{totalViolations}</p>
                <p className="text-[13px] font-medium text-slate-500 mt-2">total violations</p>
                <div className="mt-5 space-y-2.5">
                  {summary.by_severity
                    .sort((a, b) => {
                      const order = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
                      return order.indexOf(a.severity) - order.indexOf(b.severity);
                    })
                    .map((row) => (
                      <div key={row.severity} className="flex items-center justify-between text-[11px]">
                        <SeverityBadge severity={row.severity} />
                        <span className="font-semibold text-slate-700 tabular-nums">{row.count}</span>
                      </div>
                    ))}
                </div>
              </div>

              {/* By type breakdown */}
              {!loading && grouped.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                  <div className="flex items-center gap-2.5 mb-4">
                    <Layers className="w-4 h-4 text-slate-400" />
                    <span className="text-[15px] font-bold text-slate-900">By Type</span>
                  </div>
                  <div className="space-y-3">
                    {grouped.map((g) => (
                      <div key={g.type} className="flex items-center gap-3">
                        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${g.color}`} />
                        <span className="text-[13px] font-medium text-slate-700 flex-1 truncate">{g.label}</span>
                        <span className="text-[13px] font-bold text-slate-900 tabular-nums">{g.items.length}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {summary.top_offenders.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                  <div className="flex items-center gap-2.5 mb-4">
                    <Users className="w-4 h-4 text-slate-400" />
                    <span className="text-[15px] font-bold text-slate-900">Top offenders</span>
                  </div>
                  <div className="space-y-4">
                    {summary.top_offenders.slice(0, 5).map((o, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <EmployeeAvatar name={o.employee_name} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-bold text-slate-900 truncate">{o.employee_name}</p>
                          <p className="text-xs font-semibold text-slate-400">
                            {o.violation_count} violation{o.violation_count !== 1 ? "s" : ""}
                          </p>
                        </div>
                        <p className="text-[14px] font-extrabold text-slate-900 tabular-nums">
                          ${(o.total_flagged ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <PolicyReferenceModal open={showPolicyRef} onClose={() => setShowPolicyRef(false)} />
    </div>
  );
}

function EmployeeAvatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const colors = ["#6366f1", "#0891b2", "#16a34a", "#ea580c", "#dc2626", "#8b5cf6", "#0284c7"];
  const idx = name.split("").reduce((s, c) => s + c.charCodeAt(0), 0) % colors.length;
  return (
    <div
      className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
      style={{ backgroundColor: colors[idx] }}
    >
      {initials}
    </div>
  );
}
