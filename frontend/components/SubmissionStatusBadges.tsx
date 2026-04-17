"use client";

import { Receipt, FileText, Users, Briefcase, AlertCircle, CheckCircle2 } from "lucide-react";
import type { TransactionSubmission, MissingRequirement } from "@/lib/types";

const FIELD_ICONS: Record<string, React.ReactNode> = {
  receipt:          <Receipt className="w-3 h-3" />,
  memo:             <FileText className="w-3 h-3" />,
  attendees:        <Users className="w-3 h-3" />,
  business_purpose: <Briefcase className="w-3 h-3" />,
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
  // Build a flat set of all missing field names
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
  const required = new Set<string>(missingSet);
  // Include any field that has a value, plus any required-and-missing field
  const visible = allFields.filter((f) => hasField(f) || required.has(f));

  if (visible.length === 0 && !compact) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {visible.map((f) => {
        const present = hasField(f);
        const isRequiredMissing = !present && missingSet.has(f);
        const tone = present
          ? "bg-emerald-50 text-emerald-700 border-emerald-200/80"
          : isRequiredMissing
          ? "bg-amber-50 text-amber-700 border-amber-200/80"
          : "bg-zinc-50 text-zinc-500 border-zinc-200/60";
        return (
          <span
            key={f}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10.5px] font-bold ${tone}`}
            title={isRequiredMissing ? "Required by policy" : present ? "Provided" : ""}
          >
            {present ? (
              <CheckCircle2 className="w-2.5 h-2.5" />
            ) : isRequiredMissing ? (
              <AlertCircle className="w-2.5 h-2.5" />
            ) : (
              FIELD_ICONS[f]
            )}
            {FIELD_LABELS[f]}
            {!present && isRequiredMissing && " needed"}
          </span>
        );
      })}
    </div>
  );
}
