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
    severityColor: "bg-zinc-100 text-zinc-700",
    icon: <Zap className="w-4 h-4 text-zinc-600" />,
    iconBg: "bg-zinc-100",
    description: "Multiple charges at the same merchant on the same day where each is below the approval threshold but the total exceeds it.",
    example: "5× charges of $26.25 at same fuel stop totalling $131.25 — ducking the $50 pre-auth gate.",
  },
  {
    type: "PERSONAL_EXPENSE",
    label: "Personal Expense",
    severity: "HIGH",
    severityColor: "bg-zinc-100 text-zinc-700",
    icon: <ShoppingCart className="w-4 h-4 text-zinc-600" />,
    iconBg: "bg-zinc-100",
    description: "Charges at grocery stores, pharmacies, hobby shops, or discount retailers — categories with no legitimate fleet or business use.",
    example: "$758 at Shoppers Drug Mart on a corporate card (Kenji Watanabe, Operations).",
  },
  {
    type: "HIGH_MEAL_EXPENSE",
    label: "High Meal Expense",
    severity: "HIGH",
    severityColor: "bg-zinc-100 text-zinc-700",
    icon: <UtensilsCrossed className="w-4 h-4 text-zinc-600" />,
    iconBg: "bg-zinc-100",
    description: "Restaurant charges over $200. Claude's Phase 2 enrichment distinguishes a crew dinner on a long-haul stop from a solo luxury dining charge.",
    example: "$520 at STK Toronto (Fiona Walsh, Sales) — luxury steakhouse requires attendee list and business purpose.",
  },
  {
    type: "ALCOHOL_NO_CONTEXT",
    label: "Alcohol Without Context",
    severity: "MEDIUM",
    severityColor: "bg-zinc-100 text-zinc-700",
    icon: <Wine className="w-4 h-4 text-zinc-600" />,
    iconBg: "bg-zinc-100",
    description: "Charges at bars or liquor stores. Policy allows alcohol only when dining with a customer — guest names and business purpose are required.",
    example: "Any bar tab or liquor store charge without accompanying client entertainment documentation.",
  },
  {
    type: "DUPLICATE_CHARGE",
    label: "Duplicate Charge",
    severity: "HIGH",
    severityColor: "bg-zinc-100 text-zinc-700",
    icon: <Copy className="w-4 h-4 text-zinc-600" />,
    iconBg: "bg-zinc-100",
    description: "Same employee charged the same amount at the same merchant within 7 days — a pattern consistent with double-billing or duplicate submission.",
    example: "$311.05 at Skeans Pneumatic charged twice in 6 days (Sofia Mendes, Operations) — potential vendor double-billing.",
  },
  {
    type: "LUXURY_HOTEL",
    label: "Luxury Hotel",
    severity: "MEDIUM",
    severityColor: "bg-zinc-100 text-zinc-700",
    icon: <Hotel className="w-4 h-4 text-zinc-600" />,
    iconBg: "bg-zinc-100",
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
    <div className="flex h-full bg-transparent">
      {/* Section nav */}
      <div className="w-[220px] flex-shrink-0 bg-white/70 backdrop-blur-xl border-r border-zinc-200/40 pt-8 px-4 flex flex-col">
        <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider px-4 mb-4">Sections</p>
        <nav className="space-y-2">
          {NAV_SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => scrollToSection(s.id)}
              className={`w-full text-left px-5 py-3 rounded-[16px] text-[13px] font-bold transition-all duration-200 ${
                activeSection === s.id
                  ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200/60"
                  : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900"
              }`}
            >
              {s.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto" ref={contentRef}>
        <div className="p-10 max-w-5xl space-y-12 pb-20">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-[24px] font-bold text-zinc-900 tracking-tight leading-none mb-1.5">
                  Expense Policy
                </h1>
                <p className="text-[14px] font-medium text-zinc-500">
                  Company expense rules parsed from the official policy document
                </p>
              </div>
            </div>
            <span
              className={`px-4 py-2 rounded-xl text-[11px] font-bold uppercase tracking-wider border shadow-sm ${
                rules.source === "pdf" ? "bg-white text-zinc-700 border-zinc-200/60" : "bg-amber-50 text-amber-700 border-amber-200/60"
              }`}
            >
              Source: {rules.source === "pdf" ? "PDF Document" : "Default Rules"}
            </span>
          </div>

          {/* Thresholds */}
          <section id="policy-thresholds" className="space-y-6">
            <h2 className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider mt-2">Spending Thresholds</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <RuleCard
                icon={<DollarSign className="w-4 h-4 text-zinc-700" />}
                title="Pre-Authorization"
                value={`$${rules.pre_auth_threshold.toFixed(0)}`}
                detail="Over this requires manager pre-approval"
              />
              <RuleCard
                icon={<DollarSign className="w-4 h-4 text-zinc-700" />}
                title="Receipt Required"
                value={`$${rules.receipt_required_above.toFixed(0)}`}
                detail="Receipts required above this amount"
              />
              <RuleCard
                icon={<Percent className="w-4 h-4 text-zinc-700" />}
                title="Max Meal Tip"
                value={`${rules.tip_meal_max_pct}%`}
                detail="Tips above this are not reimbursed"
              />
              <RuleCard
                icon={<Percent className="w-4 h-4 text-zinc-700" />}
                title="Max Service Tip"
                value={`${rules.tip_service_max_pct}%`}
                detail="Service and porterage tip cap"
              />
            </div>
          </section>

          {/* Key Rules */}
          <section id="policy-key-rules" className="space-y-6">
            <h2 className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Key Rules</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-[24px] border border-zinc-200/60 p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-full bg-zinc-50 flex items-center justify-center">
                    <Wine className="w-5 h-5 text-zinc-600" />
                  </div>
                  <h3 className="font-bold text-zinc-900 text-[16px] tracking-tight">Alcohol Policy</h3>
                </div>
                <div className="space-y-4 text-[14px] text-zinc-600 font-medium leading-relaxed">
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

              <div className="bg-white rounded-[24px] border border-zinc-200/60 p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-full bg-zinc-50 flex items-center justify-center">
                    <CreditCard className="w-5 h-5 text-zinc-600" />
                  </div>
                  <h3 className="font-bold text-zinc-900 text-[16px] tracking-tight">Corporate Card Rules</h3>
                </div>
                <div className="space-y-4 text-[14px] text-zinc-600 font-medium leading-relaxed">
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
          <section id="policy-detection" className="space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Violation Detection Rules</h2>
                <p className="text-[14px] font-medium text-zinc-500 mt-2">
                  Phase 1 deterministic rules flag candidates; Claude Phase 2 adds business context to each.
                </p>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-xl bg-zinc-900 text-white mt-1 flex-shrink-0 shadow-sm">
                AI-Powered
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {DETECTION_RULES.map((rule) => (
                <div key={rule.type} className="bg-white rounded-[24px] border border-zinc-200/60 p-6 hover:shadow-md transition-all duration-200 shadow-sm">
                  <div className="flex items-start justify-between mb-5">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${rule.iconBg.replace('bg-', 'bg-').replace('100', '50')}`}>
                        {rule.icon}
                      </div>
                      <span className="text-[15px] font-bold text-zinc-900 tracking-tight">{rule.label}</span>
                    </div>
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md mt-1 ${rule.severityColor}`}>
                      {rule.severity}
                    </span>
                  </div>
                  <p className="text-[14px] font-medium text-zinc-600 leading-relaxed mb-5">{rule.description}</p>
                  <div className="bg-zinc-50/80 rounded-[16px] p-5 border border-zinc-100/80">
                    <p className="text-[11px] text-zinc-400 font-bold uppercase tracking-wider mb-2">Real example</p>
                    <p className="text-[13px] text-zinc-700 font-medium leading-relaxed italic">{rule.example}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="bg-zinc-900 rounded-2xl p-6 flex items-start gap-4 shadow-sm">
              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                <Zap className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-[14px] font-bold text-white mb-1.5">How Phase 2 AI Enrichment Works</p>
                <p className="text-[13px] font-medium text-zinc-400 leading-relaxed">
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
            <section id="policy-restricted" className="space-y-6">
              <h2 className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Restricted Merchant Categories</h2>
              <div className="bg-rose-50/50 rounded-2xl border border-rose-100 p-6 shadow-sm">
                <div className="flex items-center gap-4 mb-5">
                  <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center">
                    <AlertTriangle className="w-5 h-5 text-rose-600" />
                  </div>
                  <span className="text-[18px] font-bold text-rose-900 tracking-tight">
                    {rules.mcc_restricted.length} completely restricted categories
                  </span>
                </div>
                <div className="flex flex-wrap gap-3">
                  {rules.mcc_restricted.map((mcc) => (
                    <span key={mcc} className="px-4 py-2 bg-white text-rose-700 rounded-xl text-[13px] font-bold border border-rose-200/60 shadow-sm">
                      MCC {mcc} <span className="opacity-30 mx-2">|</span> {rules.mcc_descriptions[String(mcc)] || "Restricted"}
                    </span>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* Fleet Exemptions */}
          <section id="policy-fleet" className="space-y-6">
            <h2 className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Fleet Operations Exemptions</h2>
            <div className="bg-emerald-50/50 rounded-2xl border border-emerald-100 p-6 shadow-sm">
              <div className="flex items-center gap-4 mb-3">
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                  <Truck className="w-5 h-5 text-emerald-600" />
                </div>
                <span className="text-[18px] font-bold text-emerald-900 tracking-tight">Fleet Operations Categories</span>
              </div>
              <p className="text-[14px] text-emerald-800 mb-5 font-medium pl-14">
                Exempt from the <span className="font-bold">${rules.pre_auth_threshold}</span> pre-authorization threshold for operational necessity.
              </p>
              <div className="flex flex-wrap gap-3 mb-6 pl-14">
                {rules.fleet_mcc_codes.map((mcc) => (
                  <span key={mcc} className="px-4 py-2 bg-white text-emerald-700 rounded-xl text-[13px] font-bold border border-emerald-200/60 shadow-sm">
                    MCC {mcc} <span className="opacity-30 mx-2">|</span> {rules.mcc_descriptions[String(mcc)] || `Code ${mcc}`}
                  </span>
                ))}
              </div>
              <PolicyNote className="bg-white/80 border-emerald-200/60 text-emerald-900 rounded-xl ml-14">
                Toll booths, fuel purchases, tire replacements, and roadside towing are pre-approved. These transactions skip the standard threshold check but are still monitored for anomalies.
              </PolicyNote>
            </div>
          </section>

          {/* Policy Sections */}
          {rules.policy_sections && Object.keys(rules.policy_sections).length > 0 && (
            <section id="policy-details" className="space-y-6">
              <h2 className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Policy Details</h2>
              <div className="space-y-6">
                {Object.entries(rules.policy_sections).map(([key, text]) => {
                  const info = SECTION_TITLES[key] ?? { title: key.replace(/_/g, " "), icon: <Info className="w-4 h-4 pt-1" /> };
                  return (
                    <div key={key} className="bg-white rounded-2xl border border-zinc-200/60 shadow-sm p-6">
                      <h3 className="font-bold text-zinc-900 text-[16px] mb-4 flex items-center gap-3 capitalize">
                        <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center">
                          <div className="text-zinc-600">{info.icon}</div>
                        </div>
                        {info.title}
                      </h3>
                      <p className="text-[13px] text-zinc-600 font-medium leading-relaxed whitespace-pre-line pl-11">{text}</p>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Approval Thresholds */}
          {Object.keys(rules.approval_thresholds).length > 0 && (
            <section id="policy-approval" className="space-y-6">
              <h2 className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Approval Thresholds by Role</h2>
              <div className="bg-zinc-900 rounded-[24px] p-10 shadow-sm text-white">
                <div className="space-y-4">
                  {Object.entries(rules.approval_thresholds).map(([role, amount]) => (
                    <div key={role} className="flex items-center justify-between py-5 border-b border-white/10 last:border-0 hover:bg-white/5 px-6 rounded-2xl transition-colors cursor-default">
                      <span className="capitalize text-[15px] font-bold tracking-tight">{role.replace(/_/g, " ")}</span>
                      <span className="tabular-nums text-[16px] font-black text-zinc-300">
                        ${Number(amount).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-8 bg-white/10 border border-white/20 rounded-[16px] p-6 flex gap-4 items-start shadow-sm">
                  <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                    <Info className="w-5 h-5 text-zinc-100" />
                  </div>
                  <p className="text-[14px] text-zinc-200 font-medium leading-relaxed">
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
    <div className={`bg-zinc-50 border border-zinc-200/60 shadow-sm rounded-[16px] p-5 mt-6 ${className}`}>
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-zinc-500 mt-0.5 flex-shrink-0" />
        <p className="text-[14px] font-medium text-zinc-600 leading-relaxed">{children}</p>
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
    <div className="bg-white rounded-[24px] border border-zinc-200/60 shadow-sm p-6 group hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 bg-zinc-50 rounded-full flex items-center justify-center border border-zinc-100">{icon}</div>
        <span className="text-[12px] font-bold text-zinc-500 uppercase tracking-wider">{title}</span>
      </div>
      <p className="text-[36px] font-bold text-zinc-900 tabular-nums tracking-tight leading-none">{value}</p>
      <p className="text-[13px] mt-4 font-medium text-zinc-500">{detail}</p>
    </div>
  );
}
