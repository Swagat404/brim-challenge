"use client";

import { useMemo, useState } from "react";
import { Sparkles, Check, X, Loader2, ChevronDown } from "lucide-react";
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
  const [expanded, setExpanded] = useState(false);

  const fieldNames = useMemo(
    () =>
      proposal.fields
        .map((f) => FIELD_LABELS[f] ?? f)
        .filter((v, i, arr) => arr.indexOf(v) === i),
    [proposal.fields]
  );

  const rationale = proposal.rationale?.trim() ?? "";
  const isLong = rationale.length > 140;

  // Layout choice: actions row sits BELOW the text instead of beside it.
  // The /policy editor lives in a 3-pane layout (suggestions | editor | chat
  // sidebar), so the middle pane can be very narrow when the chat sidebar is
  // wide — putting buttons inline used to squeeze the text into a one-word-
  // per-line column. Stacked layout keeps the banner readable at any width.
  return (
    <div className="bg-zinc-900 text-white rounded-[16px] shadow-lg px-5 py-4 mb-5">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-white/10 ring-1 ring-white/20 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Sparkles className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold tracking-tight leading-snug">
            Sift proposed an edit
          </p>
          <p className="text-[11.5px] text-zinc-400 font-semibold mt-0.5 leading-snug">
            {fieldNames.join(" · ") || "policy"}
          </p>
          {rationale && (
            <div className="mt-2">
              <p
                className={`text-[12.5px] text-zinc-200 font-medium leading-relaxed break-words ${
                  expanded || !isLong ? "" : "line-clamp-3"
                }`}
              >
                {rationale}
              </p>
              {isLong && (
                <button
                  onClick={() => setExpanded((v) => !v)}
                  className="mt-1 text-[11px] font-bold text-zinc-400 hover:text-white flex items-center gap-1"
                >
                  <ChevronDown
                    className={`w-3 h-3 transition-transform ${
                      expanded ? "rotate-180" : ""
                    }`}
                  />
                  {expanded ? "Show less" : "Show more"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 mt-3">
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
          {applying ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Check className="w-3.5 h-3.5" />
          )}
          {applying ? "Applying…" : "Accept & save"}
        </button>
      </div>
    </div>
  );
}
