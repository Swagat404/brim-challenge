"use client";

import { useEffect, useState, useRef } from "react";
import { getPolicyRules } from "@/lib/api";
import {
  Shield, DollarSign, Percent, Wine, CreditCard, AlertTriangle,
  Truck, Info, Plane, Car, ShoppingCart, UtensilsCrossed, Copy, Hotel, Zap,
} from "lucide-react";

type PolicyRules = Awaited<ReturnType<typeof getPolicyRules>>;

const SECTION_TITLES: Record<string, { title: string; icon: React.ReactNode }> = {
  business_travel: { title: "Business Travel & Entertainment", icon: <Plane className="w-4 h-4" /> },
  tips: { title: "Tips & Gratuities", icon: <Percent className="w-4 h-4" /> },
  transportation: { title: "Transportation", icon: <Truck className="w-4 h-4" /> },
  car_rental: { title: "Car Rental", icon: <Car className="w-4 h-4" /> },
  corporate_cards: { title: "Corporate Credit Cards", icon: <CreditCard className="w-4 h-4" /> },
};

const DETECTION_RULES = [
  {
    type: "SPLIT_TRANSACTION",
    label: "Split Transaction",
    severity: "CRITICAL",
    severityColor: "bg-red-100 text-red-700",
    icon: <Zap className="w-4 h-4 text-red-600" />,
    iconBg: "bg-red-100",
    description: "Multiple charges at the same merchant on the same day where each is below the approval threshold but the total exceeds it.",
    example: "5× charges of $26.25 at same fuel stop totalling $131.25 — ducking the $50 pre-auth gate.",
  },
  {
    type: "PERSONAL_EXPENSE",
    label: "Personal Expense",
    severity: "HIGH",
    severityColor: "bg-orange-100 text-orange-700",
    icon: <ShoppingCart className="w-4 h-4 text-orange-600" />,
    iconBg: "bg-orange-100",
    description: "Charges at grocery stores, pharmacies, hobby shops, or discount retailers — categories with no legitimate fleet or business use.",
    example: "$758 at Shoppers Drug Mart on a corporate card (Kenji Watanabe, Operations).",
  },
  {
    type: "HIGH_MEAL_EXPENSE",
    label: "High Meal Expense",
    severity: "HIGH",
    severityColor: "bg-amber-100 text-amber-700",
    icon: <UtensilsCrossed className="w-4 h-4 text-amber-600" />,
    iconBg: "bg-amber-100",
    description: "Restaurant charges over $200. Claude's Phase 2 enrichment distinguishes a crew dinner on a long-haul stop from a solo luxury dining charge.",
    example: "$520 at STK Toronto (Fiona Walsh, Sales) — luxury steakhouse requires attendee list and business purpose.",
  },
  {
    type: "ALCOHOL_NO_CONTEXT",
    label: "Alcohol Without Context",
    severity: "MEDIUM",
    severityColor: "bg-purple-100 text-purple-700",
    icon: <Wine className="w-4 h-4 text-purple-600" />,
    iconBg: "bg-purple-100",
    description: "Charges at bars or liquor stores. Policy allows alcohol only when dining with a customer — guest names and business purpose are required.",
    example: "Any bar tab or liquor store charge without accompanying client entertainment documentation.",
  },
  {
    type: "DUPLICATE_CHARGE",
    label: "Duplicate Charge",
    severity: "HIGH",
    severityColor: "bg-blue-100 text-blue-700",
    icon: <Copy className="w-4 h-4 text-blue-600" />,
    iconBg: "bg-blue-100",
    description: "Same employee charged the same amount at the same merchant within 7 days — a pattern consistent with double-billing or duplicate submission.",
    example: "$311.05 at Skeans Pneumatic charged twice in 6 days (Sofia Mendes, Operations) — potential vendor double-billing.",
  },
  {
    type: "LUXURY_HOTEL",
    label: "Luxury Hotel",
    severity: "MEDIUM",
    severityColor: "bg-indigo-100 text-indigo-700",
    icon: <Hotel className="w-4 h-4 text-indigo-600" />,
    iconBg: "bg-indigo-100",
    description: "Hotel charges above $400/night. The policy requires pre-approval for premium accommodations; economy alternatives should be used where available.",
    example: "$2,850 at Four Seasons Toronto (Sarah Whitfield, Management) — exceeds guideline by 7×.",
  },
];

const NAV_SECTIONS = [
  { id: "thresholds", label: "Spending Thresholds" },
  { id: "key-rules", label: "Key Rules" },
  { id: "detection", label: "Violation Detection" },
  { id: "restricted", label: "Restricted Categories" },
  { id: "fleet", label: "Fleet Exemptions" },
  { id: "details", label: "Policy Details" },
  { id: "approval", label: "Approval Thresholds" },
];

export default function PolicyPage() {
  const [rules, setRules] = useState<PolicyRules | null>(null);
  const [error, setError] = useState("");
  const [activeSection, setActiveSection] = useState("thresholds");
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getPolicyRules().then(setRules).catch((e) => setError(e.message));
  }, []);

  function scrollToSection(id: string) {
    setActiveSection(id);
    document.getElementById(`policy-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (error) {
    return (
      <div className="p-8">
        <p className="text-red-500">Failed to load policy: {error}</p>
      </div>
    );
  }

  if (!rules) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 rounded w-1/3" />
          <div className="h-32 bg-slate-200 rounded" />
          <div className="h-32 bg-slate-200 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      {/* Section nav */}
      <div className="w-[190px] flex-shrink-0 bg-white border-r border-slate-200/80 pt-6 px-3">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-3 mb-3">Sections</p>
        <nav className="space-y-0.5">
          {NAV_SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => scrollToSection(s.id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-[11px] font-medium transition-colors ${
                activeSection === s.id
                  ? "bg-green-50 text-green-800"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              {s.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto" ref={contentRef}>
        <div className="p-8 max-w-5xl space-y-10">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
                <Shield className="w-7 h-7 text-emerald-600" />
                Expense Policy
              </h1>
              <p className="text-[15px] font-medium text-slate-500 mt-2">
                Company expense rules parsed from the official policy document
              </p>
            </div>
            <span
              className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest ${
                rules.source === "pdf" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
              }`}
            >
              Source: {rules.source === "pdf" ? "PDF Document" : "Default Rules"}
            </span>
          </div>

          {/* Thresholds */}
          <section id="policy-thresholds" className="space-y-4">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-2">Spending Thresholds</h2>
            <div className="grid grid-cols-4 gap-5">
              <RuleCard
                icon={<DollarSign className="w-5 h-5 text-indigo-600" />}
                title="Pre-Authorization"
                value={`$${rules.pre_auth_threshold.toFixed(0)}`}
                detail="Over this requires manager pre-approval"
              />
              <RuleCard
                icon={<DollarSign className="w-5 h-5 text-indigo-600" />}
                title="Receipt Required"
                value={`$${rules.receipt_required_above.toFixed(0)}`}
                detail="Receipts required above this amount"
              />
              <RuleCard
                icon={<Percent className="w-5 h-5 text-amber-600" />}
                title="Max Meal Tip"
                value={`${rules.tip_meal_max_pct}%`}
                detail="Tips above this are not reimbursed"
              />
              <RuleCard
                icon={<Percent className="w-5 h-5 text-amber-600" />}
                title="Max Service Tip"
                value={`${rules.tip_service_max_pct}%`}
                detail="Service and porterage tip cap"
              />
            </div>
          </section>

          {/* Key Rules */}
          <section id="policy-key-rules" className="space-y-4">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Key Rules</h2>
            <div className="grid grid-cols-2 gap-5">
              <div className="bg-slate-50 rounded-2xl border border-slate-200 p-6">
                <h3 className="font-bold text-slate-900 text-base mb-3 flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-rose-100 flex items-center justify-center">
                    <Wine className="w-4 h-4 text-rose-600" />
                  </div>
                  Alcohol Policy
                </h3>
                <div className="space-y-2 text-[13px] text-slate-600">
                  <p>
                    {rules.alcohol_customer_only
                      ? "Alcohol may only be expensed when dining with a customer."
                      : "Alcohol expenses may be submitted for reimbursement."}
                  </p>
                  <PolicyNote>
                    Names of guests and purpose must be listed with receipts. Entertainment requires pre-approval for groups over 6.
                  </PolicyNote>
                </div>
              </div>

              <div className="bg-slate-50 rounded-2xl border border-slate-200 p-6">
                <h3 className="font-bold text-slate-900 text-base mb-3 flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
                    <CreditCard className="w-4 h-4 text-indigo-600" />
                  </div>
                  Corporate Card Rules
                </h3>
                <div className="space-y-2 text-[13px] text-slate-600">
                  <p>Only the named cardholder may use the corporate card. Personal expenses are prohibited.</p>
                  <PolicyNote>
                    {rules.personal_card_fees_reimbursed
                      ? "Personal card fees are reimbursable when corporate card is unavailable."
                      : "Personal credit card fees are not reimbursed. Use the corporate card whenever possible."}
                  </PolicyNote>
                </div>
              </div>
            </div>
          </section>

          {/* AI Violation Detection Rules */}
          <section id="policy-detection" className="space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Violation Detection Rules</h2>
                <p className="text-[13px] text-slate-500 mt-1">
                  Phase 1 deterministic rules flag candidates; Claude Phase 2 adds business context to each.
                </p>
              </div>
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-700 mt-1 flex-shrink-0">
                AI-Powered
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {DETECTION_RULES.map((rule) => (
                <div key={rule.type} className="bg-white rounded-xl border border-slate-200 p-4 hover:border-slate-300 transition-colors">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${rule.iconBg}`}>
                        {rule.icon}
                      </div>
                      <span className="text-[13px] font-semibold text-slate-800">{rule.label}</span>
                    </div>
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${rule.severityColor}`}>
                      {rule.severity}
                    </span>
                  </div>
                  <p className="text-[12px] text-slate-600 leading-relaxed mb-3">{rule.description}</p>
                  <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
                    <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider mb-1">Real example</p>
                    <p className="text-[12px] text-slate-700 leading-relaxed italic">{rule.example}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="bg-slate-900 rounded-xl p-4 flex items-start gap-3">
              <Zap className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[13px] font-semibold text-white mb-0.5">How Phase 2 AI Enrichment Works</p>
                <p className="text-[12px] text-slate-400 leading-relaxed">
                  After Phase 1 flags candidates, Claude reviews each violation with full company context — employee role, department,
                  merchant type, and industry norms. A $250 restaurant charge from a long-haul driver feeding a crew at a truck stop
                  is classified LOW. The same amount from a solo office manager at a fine dining restaurant is escalated to HIGH with
                  a specific action recommendation.
                </p>
              </div>
            </div>
          </section>

          {/* Restricted Categories */}
          {rules.mcc_restricted.length > 0 && (
            <section id="policy-restricted" className="space-y-4">
              <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Restricted Merchant Categories</h2>
              <div className="bg-rose-50 rounded-2xl border border-rose-200/60 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-full bg-rose-200 flex items-center justify-center">
                    <AlertTriangle className="w-4 h-4 text-rose-700" />
                  </div>
                  <span className="text-[15px] font-bold text-rose-900">
                    {rules.mcc_restricted.length} completely restricted categories
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {rules.mcc_restricted.map((mcc) => (
                    <span key={mcc} className="px-3 py-1.5 bg-white text-rose-700 rounded-lg text-xs font-bold border border-rose-200 shadow-sm">
                      MCC {mcc} <span className="opacity-50 mx-1">|</span> {rules.mcc_descriptions[String(mcc)] || "Restricted"}
                    </span>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* Fleet Exemptions */}
          <section id="policy-fleet" className="space-y-4">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Fleet Operations Exemptions</h2>
            <div className="bg-emerald-50 rounded-2xl border border-emerald-200/60 p-6">
              <div className="flex items-center gap-3 mb-2.5">
                <div className="w-8 h-8 rounded-full bg-emerald-200 flex items-center justify-center">
                  <Truck className="w-4 h-4 text-emerald-800" />
                </div>
                <span className="text-[15px] font-bold text-emerald-900">Fleet Operations Categories</span>
              </div>
              <p className="text-sm text-emerald-800 mb-4 font-medium pl-11">
                Exempt from the <span className="font-bold">${rules.pre_auth_threshold}</span> pre-authorization threshold for operational necessity.
              </p>
              <div className="flex flex-wrap gap-2 mb-5">
                {rules.fleet_mcc_codes.map((mcc) => (
                  <span key={mcc} className="px-3 py-1.5 bg-white text-emerald-800 rounded-lg text-xs font-bold border border-emerald-200 shadow-sm">
                    MCC {mcc} <span className="opacity-50 mx-1">|</span> {rules.mcc_descriptions[String(mcc)] || `Code ${mcc}`}
                  </span>
                ))}
              </div>
              <PolicyNote className="bg-white/60 border-emerald-200 text-emerald-900 rounded-xl">
                Toll booths, fuel purchases, tire replacements, and roadside towing are pre-approved. These transactions skip the standard threshold check but are still monitored for anomalies.
              </PolicyNote>
            </div>
          </section>

          {/* Policy Sections */}
          {rules.policy_sections && Object.keys(rules.policy_sections).length > 0 && (
            <section id="policy-details" className="space-y-4">
              <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Policy Details</h2>
              <div className="space-y-4">
                {Object.entries(rules.policy_sections).map(([key, text]) => {
                  const info = SECTION_TITLES[key] ?? { title: key.replace(/_/g, " "), icon: <Info className="w-4 h-4 pt-1" /> };
                  return (
                    <div key={key} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                      <h3 className="font-bold text-slate-900 text-[15px] mb-3 flex items-center gap-2.5 capitalize">
                        <div className="text-slate-400">{info.icon}</div>
                        {info.title}
                      </h3>
                      <p className="text-[14px] text-slate-600 font-medium leading-relaxed whitespace-pre-line pl-7">{text}</p>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Approval Thresholds */}
          {Object.keys(rules.approval_thresholds).length > 0 && (
            <section id="policy-approval" className="space-y-4">
              <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Approval Thresholds by Role</h2>
              <div className="bg-slate-900 rounded-2xl p-6 shadow-md shadow-slate-900/10 text-white">
                <div className="space-y-2">
                  {Object.entries(rules.approval_thresholds).map(([role, amount]) => (
                    <div key={role} className="flex items-center justify-between py-3 border-b border-white/10 last:border-0 hover:bg-white/5 px-2 rounded-lg transition-colors">
                      <span className="text-[15px] font-medium text-slate-300 capitalize">{role.replace(/_/g, " ")}</span>
                      <span className="text-lg font-bold text-white tabular-nums">${Number(amount).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-5 bg-white/10 border border-white/20 rounded-xl p-4 flex gap-3 items-start">
                  <Info className="w-4 h-4 text-amber-300 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-slate-200 font-medium leading-relaxed">
                    Amounts above the employee&apos;s role threshold require explicit manager approval. CFO approval is required for amounts exceeding all role thresholds.
                  </p>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function PolicyNote({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-amber-100/50 border border-amber-200 shadow-sm rounded-xl p-3.5 mt-5 ${className}`}>
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
        <p className="text-[13px] font-medium text-amber-800 leading-relaxed">{children}</p>
      </div>
    </div>
  );
}

function RuleCard({
  icon,
  title,
  value,
  detail,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 group hover:border-slate-300 transition-colors">
      <div className="flex items-center gap-2 mb-3">
        <div className="p-1.5 bg-slate-50 rounded-lg">{icon}</div>
        <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">{title}</span>
      </div>
      <p className="text-4xl font-extrabold text-slate-900 tabular-nums tracking-tighter mt-1">{value}</p>
      <p className="text-xs mt-3 font-medium text-slate-500">{detail}</p>
    </div>
  );
}
