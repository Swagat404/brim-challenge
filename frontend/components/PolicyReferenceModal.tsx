"use client";

import { useEffect, useState } from "react";
import { X, BookOpen } from "lucide-react";
import { getPolicyRules } from "@/lib/api";

type PolicyRules = Awaited<ReturnType<typeof getPolicyRules>>;

const SECTION_TITLES: Record<string, string> = {
  business_travel: "Business Travel & Entertainment",
  tips: "Tips & Gratuities",
  transportation: "Transportation",
  car_rental: "Car Rental",
  corporate_cards: "Corporate Credit Cards",
};

export default function PolicyReferenceModal({
  open,
  onClose,
  highlightMcc,
  highlightAmount,
}: {
  open: boolean;
  onClose: () => void;
  highlightMcc?: number;
  highlightAmount?: number;
}) {
  const [rules, setRules] = useState<PolicyRules | null>(null);

  useEffect(() => {
    if (open && !rules) {
      getPolicyRules().then(setRules).catch(() => {});
    }
  }, [open, rules]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-slate-600" />
            <h2 className="text-lg font-semibold text-slate-900">Policy reference</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {!rules ? (
            <p className="text-sm text-slate-500">Loading policy...</p>
          ) : (
            <>
              {/* Key thresholds */}
              <section>
                <h3 className="text-sm font-semibold text-slate-900 mb-3">Spending Thresholds</h3>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2 text-sm text-slate-700">
                  <p>Pre-authorization required above <strong>${rules.pre_auth_threshold}</strong></p>
                  <p>Receipt required above <strong>${rules.receipt_required_above}</strong></p>
                  <p>Tips capped at <strong>{rules.tip_meal_max_pct}%</strong> for meals, <strong>{rules.tip_service_max_pct}%</strong> for services</p>
                  {rules.alcohol_customer_only && (
                    <p>Alcohol purchases only permitted when dining with a <strong>customer</strong></p>
                  )}
                </div>
                {highlightAmount !== undefined && highlightAmount > rules.pre_auth_threshold && (
                  <div className="mt-2 bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-xs text-yellow-800">
                    This transaction (${highlightAmount.toFixed(2)}) exceeds the ${rules.pre_auth_threshold} pre-auth threshold.
                  </div>
                )}
              </section>

              {/* Approval thresholds */}
              {Object.keys(rules.approval_thresholds).length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold text-slate-900 mb-3">Approval Thresholds</h3>
                  <div className="space-y-1.5">
                    {Object.entries(rules.approval_thresholds).map(([role, amt]) => (
                      <div key={role} className="flex justify-between text-sm">
                        <span className="text-slate-600 capitalize">{role.replace(/_/g, " ")}</span>
                        <span className="font-medium text-slate-900">${Number(amt).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Policy sections */}
              {Object.entries(rules.policy_sections).map(([key, text]) => (
                <section key={key}>
                  <h3 className="text-sm font-semibold text-slate-900 mb-2">
                    {SECTION_TITLES[key] ?? key.replace(/_/g, " ")}
                  </h3>
                  <div className="text-sm text-slate-600 leading-relaxed whitespace-pre-line bg-slate-50 border border-slate-200 rounded-lg p-4">
                    {text}
                  </div>
                </section>
              ))}

              {/* Fleet note */}
              {rules.fleet_mcc_codes.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold text-slate-900 mb-2">Fleet Operations</h3>
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                    <p className="text-xs text-slate-500 italic mb-2">Hidden notes</p>
                    <p className="text-sm text-slate-700">
                      Fleet MCC codes (fuel, permits, tires, towing, truck washes) are pre-approved for
                      high-cost transactions. These are excluded from the standard pre-auth threshold.
                    </p>
                    {highlightMcc !== undefined && rules.fleet_mcc_codes.includes(highlightMcc) && (
                      <p className="mt-2 text-xs text-green-700 font-medium">
                        MCC {highlightMcc} ({rules.mcc_descriptions[String(highlightMcc)] ?? "Fleet"}) is a recognized fleet category.
                      </p>
                    )}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
