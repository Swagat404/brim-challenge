"use client";

import { useMemo } from "react";
import { Sparkles, Check, X, Loader2 } from "lucide-react";
import type { PolicyProposal } from "@/lib/types";

interface PolicyProposalBannerProps {
  proposal: PolicyProposal;
  applying: boolean;
  onAccept: () => void;
  onReject: () => void;
}

const FIELD_LABELS: Record<string, string> = {
  thresholds: "Thresholds & Limits",
  restrictions: "Restricted MCCs (Thresholds & Limits)",
  approval_thresholds_by_role: "Role caps (Thresholds & Limits)",
  auto_approval_rules: "Auto-Approval Rules",
  submission_requirements: "Submission Requirements",
  sections: "Document",
};

export default function PolicyProposalBanner({
  proposal,
  applying,
  onAccept,
  onReject,
}: PolicyProposalBannerProps) {
  const fieldNames = useMemo(
    () =>
      proposal.fields
        .map((f) => FIELD_LABELS[f] ?? f)
        // de-dupe
        .filter((v, i, arr) => arr.indexOf(v) === i),
    [proposal.fields]
  );

  return (
    <div className="bg-zinc-900 text-white rounded-[16px] shadow-lg px-5 py-4 flex items-center gap-4 mb-5">
      <div className="w-9 h-9 rounded-full bg-white/10 ring-1 ring-white/20 flex items-center justify-center flex-shrink-0">
        <Sparkles className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-bold tracking-tight">
          Sift proposed an edit
          <span className="ml-2 text-zinc-300 font-medium">
            · {fieldNames.join(", ") || "policy"}
          </span>
        </p>
        {proposal.rationale && (
          <p className="text-[12px] text-zinc-300 font-medium leading-snug mt-0.5">
            {proposal.rationale}
          </p>
        )}
      </div>
      <button
        onClick={onReject}
        disabled={applying}
        className="px-3 py-1.5 rounded-[10px] bg-white/10 hover:bg-white/15 text-white text-[12px] font-bold flex items-center gap-1.5 disabled:opacity-50"
      >
        <X className="w-3.5 h-3.5" /> Reject
      </button>
      <button
        onClick={onAccept}
        disabled={applying}
        className="px-3 py-1.5 rounded-[10px] bg-emerald-500 hover:bg-emerald-600 text-white text-[12px] font-bold flex items-center gap-1.5 shadow-sm disabled:opacity-50"
      >
        {applying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
        {applying ? "Applying…" : "Accept & save"}
      </button>
    </div>
  );
}
