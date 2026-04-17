"use client";

import { Receipt, FileText, Users, Briefcase, AlertCircle, CheckCircle2 } from "lucide-react";
import type { TransactionSubmission, MissingRequirement } from "@/lib/types";

const FIELD_ICONS: Record<string, React.ReactNode> = {
  receipt:          <Receipt className="w-2.5 h-2.5" strokeWidth={2.4} />,
  memo:             <FileText className="w-2.5 h-2.5" strokeWidth={2.4} />,
  attendees:        <Users className="w-2.5 h-2.5" strokeWidth={2.4} />,
  business_purpose: <Briefcase className="w-2.5 h-2.5" strokeWidth={2.4} />,
};

const FIELD_LABELS: Record<string, string> = {
  receipt: "Receipt",
  memo: "Memo",
  attendees: "Attendees",
  business_purpose: "Purpose",
};

interface SubmissionStatusBadgesProps {
  submission: TransactionSubmission | null;
  missing: MissingRequirement[];
  /** Compact 1-row version */
  compact?: boolean;
}

export default function SubmissionStatusBadges({
  submission,
  missing,
  compact = false,
}: SubmissionStatusBadgesProps) {
  // Set of all currently missing-but-required fields
  const missingSet = new Set<string>();
  for (const m of missing) for (const f of m.missing) missingSet.add(f);

  function hasField(field: string): boolean {
    if (!submission) return false;
    if (field === "receipt") return Boolean(submission.receipt_url);
    if (field === "attendees") return (submission.attendees ?? []).length > 0;
    if (field === "memo") return Boolean(submission.memo?.trim());
    if (field === "business_purpose") return Boolean(submission.business_purpose?.trim());
    return false;
  }

  const allFields = ["receipt", "memo", "attendees", "business_purpose"];
  const visible = allFields.filter((f) => hasField(f) || missingSet.has(f));

  if (visible.length === 0) return null;

  const padding = compact ? "px-2 py-[3px]" : "px-2.5 py-[3px]";
  const text = compact ? "text-[10px]" : "text-[10.5px]";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {visible.map((f) => {
        const present = hasField(f);
        const requiredMissing = !present && missingSet.has(f);

        // Colour: present=neutral-ok, required-missing=amber, optional-empty=neutral
        const tone = present
          ? "bg-zinc-100 text-zinc-700 border-zinc-200/80"
          : requiredMissing
          ? "bg-amber-50 text-amber-800 border-amber-200/70"
          : "bg-zinc-50 text-zinc-500 border-zinc-200/60";

        const icon = present ? (
          <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" strokeWidth={2.6} />
        ) : requiredMissing ? (
          <AlertCircle className="w-2.5 h-2.5 text-amber-600" strokeWidth={2.6} />
        ) : (
          <span className="text-zinc-400">{FIELD_ICONS[f]}</span>
        );

        return (
          <span
            key={f}
            className={`inline-flex items-center gap-1 ${padding} rounded-full border ${tone} ${text} font-semibold tracking-tight whitespace-nowrap`}
            title={
              requiredMissing
                ? `${FIELD_LABELS[f]} required by policy`
                : present
                ? `${FIELD_LABELS[f]} provided`
                : FIELD_LABELS[f]
            }
          >
            {icon}
            {FIELD_LABELS[f]}
          </span>
        );
      })}
    </div>
  );
}
