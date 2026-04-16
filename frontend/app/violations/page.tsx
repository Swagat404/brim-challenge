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
import Avatar2 from "@/components/ui/avatar-2";

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
  SPLIT_TRANSACTION: "bg-zinc-900",
  PERSONAL_EXPENSE: "bg-zinc-700",
  HIGH_MEAL_EXPENSE: "bg-zinc-500",
  ALCOHOL_NO_CONTEXT: "bg-[#8b9286]",
  DUPLICATE_CHARGE: "bg-zinc-400",
  LUXURY_HOTEL: "bg-zinc-300",
  OVER_THRESHOLD_NO_AUTH: "bg-zinc-800",
  HIGH_AMOUNT_SOLO: "bg-zinc-600",
  TIP_EXCESSIVE: "bg-[#7a8075]",
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
    <div className="p-10 max-w-7xl mx-auto space-y-10 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 pt-4">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="font-bold text-zinc-900 text-[24px] tracking-tight leading-none mb-1.5">
              Compliance Scan
            </h1>
            <p className="text-[14px] font-medium text-zinc-500">
              AI-powered compliance scan with deterministic rules + context enrichment
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex bg-zinc-100/80 rounded-xl p-1 shadow-inner">
            <button
              onClick={() => setViewMode("grouped")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold transition-all duration-200 ${
                viewMode === "grouped" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
              }`}
            >
              <Layers className="w-4 h-4" />
              Grouped
            </button>
            <button
              onClick={() => setViewMode("flat")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold transition-all duration-200 ${
                viewMode === "flat" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
              }`}
            >
              <List className="w-4 h-4" />
              List
            </button>
          </div>

          <button
            onClick={rescan}
            disabled={scanning || loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#8b9286] text-white rounded-xl text-[14px] font-semibold hover:bg-[#7a8075] transition-all duration-200 shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${scanning ? "animate-spin" : ""}`} />
            {scanning ? "Scanning..." : "Rescan"}
          </button>
        </div>
      </div>

      {/* Severity filter cards */}
      <div className="grid grid-cols-4 gap-6">
        {(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map((s) => {
          const row = summary?.by_severity.find((r) => r.severity === s);
          const count = row?.count ?? 0;
          const cls: Record<string, string> = {
            CRITICAL: "border-zinc-200 bg-white text-zinc-900 hover:border-zinc-300",
            HIGH: "border-zinc-200 bg-white text-zinc-900 hover:border-zinc-300",
            MEDIUM: "border-zinc-200 bg-white text-zinc-900 hover:border-zinc-300",
            LOW: "border-zinc-200 bg-white text-zinc-900 hover:border-zinc-300",
          };
          return (
            <button
              key={s}
              onClick={() => setSeverity(severity === s ? "all" : s)}
              className={`bg-white rounded-[24px] border shadow-[0_2px_10px_rgba(0,0,0,0.02)] p-6 text-left transition-all duration-300 ${cls[s]} ${
                severity === s ? "ring-2 ring-offset-2 ring-[#8b9286]/50 shadow-md transform -translate-y-0.5" : "hover:shadow-md hover:-translate-y-0.5"
              }`}
            >
              <div className="flex items-center justify-between mb-4">
                <p className="text-[12px] font-bold uppercase tracking-widest text-zinc-500">{s}</p>
                <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center">
                  <ShieldAlert className="w-4 h-4 text-zinc-700" strokeWidth={2.5} />
                </div>
              </div>
              <p className="text-[40px] font-bold tabular-nums tracking-tight leading-none">{loading ? "..." : count}</p>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Violations list */}
        <div className="col-span-2 space-y-6">
          {loading ? (
            <div className="bg-white rounded-[24px] border border-zinc-100 shadow-sm flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
            </div>
          ) : violations.length === 0 ? (
            <div className="bg-white rounded-[24px] border border-zinc-100 shadow-sm flex flex-col items-center py-20 gap-3 text-zinc-400">
              <ShieldAlert className="w-10 h-10 opacity-50" />
              <p className="text-[15px] font-medium">No violations found</p>
              <p className="text-[13px]">Run a scan to check for policy violations</p>
            </div>
          ) : viewMode === "grouped" ? (
            grouped.map((group) => {
              const isCollapsed = collapsedGroups.has(group.type);
              return (
                <div key={group.type} className="bg-white rounded-[24px] border border-zinc-200/60 shadow-sm overflow-hidden mb-6">
                  {/* Group header */}
                  <button
                    onClick={() => toggleGroup(group.type)}
                    className="w-full flex items-center gap-4 px-6 py-5 hover:bg-zinc-50 transition-colors bg-white select-none"
                  >
                    <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center">
                      <span className={`w-3 h-3 rounded-full flex-shrink-0 ${group.color}`} />
                    </div>
                    <div className="flex-1 text-left flex items-baseline gap-3">
                      <span className="text-[16px] font-bold text-zinc-900 tracking-tight">{group.label}</span>
                      <span className="text-[13px] font-medium text-zinc-400">
                        {group.items.length} violation{group.items.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <span className="text-[16px] font-bold text-zinc-900 tabular-nums mr-4">
                      ${group.totalAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })} CAD
                    </span>
                    <ChevronDown className={`w-5 h-5 text-zinc-400 transition-transform ${isCollapsed ? "-rotate-90" : ""}`} />
                  </button>

                  {/* Group items */}
                  {!isCollapsed && (
                    <div className="border-t border-zinc-100 divide-y divide-zinc-50">
                      {group.items.map((v, i) => {
                        const itemKey = `${group.type}-${i}`;
                        const isOpen = expandedItem === itemKey;
                        return (
                          <div key={i}>
                            <button
                              onClick={() => setExpandedItem(isOpen ? null : itemKey)}
                              className={`w-full text-left px-8 py-5 hover:bg-zinc-50 transition-colors ${isOpen ? "bg-zinc-50" : ""}`}
                            >
                              <div className="flex items-center gap-4">
                                <EmployeeAvatar name={v.employee_name ?? v.employee_id} />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-3 mb-1">
                                    <span className="text-[14px] font-bold tracking-tight text-zinc-900 truncate">
                                      {v.employee_name ?? v.employee_id}
                                    </span>
                                    <SeverityBadge severity={v.severity} />
                                  </div>
                                  <p className="text-[13px] font-medium text-zinc-500 truncate">
                                    {v.description.length > 80 ? v.description.slice(0, 80) + "..." : v.description}
                                  </p>
                                </div>
                                <div className="text-right flex-shrink-0">
                                  <p className="text-[15px] font-bold text-zinc-900 tabular-nums">
                                    ${(v.amount ?? 0).toFixed(2)}
                                  </p>
                                  {v.department && (
                                    <p className="text-[12px] font-medium text-zinc-400 mt-1">{v.department}</p>
                                  )}
                                </div>
                              </div>
                            </button>
                            {isOpen && (
                              <div className="px-8 pb-6 bg-zinc-50 border-t border-zinc-100/50">
                                <div className="mt-5">
                                  <AIRecommendationCard type="deny" reasoning={v.description} />
                                </div>
                              <div className="flex items-center justify-between mt-4">
                                <p className="text-[12px] font-medium text-zinc-500">
                                  Detected: {v.detected_at?.slice(0, 19).replace("T", " ")}
                                </p>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setShowPolicyRef(true); }}
                                  className="text-[12px] font-bold text-zinc-600 hover:text-zinc-900 flex items-center gap-1.5 transition-colors"
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
            <div className="bg-white rounded-[24px] border border-zinc-200/60 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between">
                <span className="text-[14px] font-bold text-zinc-900 tracking-tight">
                  {violations.length} violations
                  {severity !== "all" && (
                    <span className="ml-2 text-[12px] font-medium text-zinc-500">
                      filtered: {severity}
                      <button onClick={() => setSeverity("all")} className="ml-2 text-zinc-900 hover:text-black font-semibold transition-colors">
                        Clear
                      </button>
                    </span>
                  )}
                </span>
              </div>
              <div className="divide-y divide-zinc-100">
                {violations.map((v, i) => {
                  const itemKey = `flat-${i}`;
                  const isOpen = expandedItem === itemKey;
                  return (
                    <div key={i}>
                      <button
                        onClick={() => setExpandedItem(isOpen ? null : itemKey)}
                        className={`w-full text-left px-6 py-5 hover:bg-zinc-50 transition-colors ${isOpen ? "bg-zinc-50" : ""}`}
                      >
                        <div className="flex items-start gap-4">
                          <EmployeeAvatar name={v.employee_name ?? v.employee_id} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 mb-2">
                              <SeverityBadge severity={v.severity} />
                              <span className="text-[12px] font-medium text-zinc-500">
                                {VIOLATION_LABELS[v.violation_type] ?? v.violation_type.replace(/_/g, " ")}
                              </span>
                            </div>
                            <p className="text-[14px] font-semibold tracking-tight text-zinc-900 leading-snug">
                              {v.description.length > 95 ? v.description.slice(0, 95) + "..." : v.description}
                            </p>
                            <div className="flex items-center gap-3 mt-2 text-[12px] text-zinc-400 font-medium">
                              <span className="text-zinc-600">
                                {v.employee_name ?? v.employee_id}
                              </span>
                              {v.department && <span>· {v.department}</span>}
                              {(v.amount ?? 0) > 0 && (
                                <span className="text-zinc-600 tabular-nums">
                                  · ${(v.amount ?? 0).toFixed(2)} CAD
                                </span>
                              )}
                            </div>
                          </div>
                          <ChevronDown className={`w-4 h-4 text-zinc-400 flex-shrink-0 mt-1 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                        </div>
                      </button>
                      {isOpen && (
                        <div className="px-6 pb-5 bg-zinc-50 border-t border-zinc-100/50">
                          <div className="mt-4">
                            <AIRecommendationCard type="deny" reasoning={v.description} />
                          </div>
                              <div className="flex items-center justify-between mt-4">
                                <p className="text-[12px] font-medium text-zinc-500">
                                  Detected: {v.detected_at?.slice(0, 19).replace("T", " ")}
                                </p>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setShowPolicyRef(true); }}
                                  className="text-[12px] font-bold text-zinc-600 hover:text-zinc-900 flex items-center gap-1.5 transition-colors"
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
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div className="space-y-6">
          {summary && (
            <>
              {/* By type breakdown */}
              {!loading && grouped.length > 0 && (
                <div className="bg-white rounded-[24px] border border-zinc-200/60 shadow-sm p-6">
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-8 h-8 rounded-full bg-zinc-50 flex items-center justify-center">
                      <Layers className="w-4 h-4 text-zinc-400" />
                    </div>
                    <span className="text-[15px] font-bold text-zinc-900 tracking-tight">By Type</span>
                  </div>
                  <div className="space-y-4">
                    {grouped.map((g) => (
                      <div key={g.type} className="flex items-center gap-3">
                        <span className={`w-3 h-3 rounded-full flex-shrink-0 ${g.color}`} />
                        <span className="text-[13px] font-medium text-zinc-600 flex-1 truncate">{g.label}</span>
                        <span className="text-[13px] font-bold text-zinc-900 tabular-nums">{g.items.length}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {summary.top_offenders.length > 0 && (
                <div className="bg-white rounded-[24px] border border-zinc-200/60 shadow-sm p-6">
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-8 h-8 rounded-full bg-zinc-50 flex items-center justify-center">
                      <Users className="w-4 h-4 text-zinc-400" />
                    </div>
                    <span className="text-[15px] font-bold text-zinc-900 tracking-tight">Top offenders</span>
                  </div>
                  <div className="space-y-4">
                    {summary.top_offenders.slice(0, 5).map((o, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <EmployeeAvatar name={o.employee_name} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-bold text-zinc-900 truncate">{o.employee_name}</p>
                          <p className="text-[11px] font-medium text-zinc-500 mt-0.5">{o.violation_count} violations</p>
                        </div>
                        <p className="text-[13px] font-bold text-zinc-900 tabular-nums flex-shrink-0">
                          ${o.total_flagged.toLocaleString(undefined, { maximumFractionDigits: 0 })}
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
  return (
    <Avatar2
      size="medium"
      variant="neutral"
      title={name}
      className="flex-shrink-0 font-jakarta"
    >
      {initials}
    </Avatar2>
  );
}
