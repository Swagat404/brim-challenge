"use client";

import { useState } from "react";
import { Sparkles, ThumbsUp, ThumbsDown, CheckCircle2, AlertCircle, XOctagon } from "lucide-react";

type RecType = "approve" | "review" | "deny" | "complete";

const STYLES: Record<
  RecType,
  {
    title: string;
    accent: string;
    iconBg: string;
    icon: React.ReactNode;
  }
> = {
  approve: {
    title: "Approve",
    accent: "text-emerald-700",
    iconBg: "bg-emerald-50 ring-emerald-100",
    icon: <CheckCircle2 className="w-4 h-4 text-emerald-600" strokeWidth={2.4} />,
  },
  review: {
    title: "Needs review",
    accent: "text-amber-700",
    iconBg: "bg-amber-50 ring-amber-100",
    icon: <AlertCircle className="w-4 h-4 text-amber-600" strokeWidth={2.4} />,
  },
  deny: {
    title: "Deny",
    accent: "text-rose-700",
    iconBg: "bg-rose-50 ring-rose-100",
    icon: <XOctagon className="w-4 h-4 text-rose-600" strokeWidth={2.4} />,
  },
  complete: {
    title: "Auto-approved",
    accent: "text-zinc-700",
    iconBg: "bg-zinc-100 ring-zinc-200",
    icon: <CheckCircle2 className="w-4 h-4 text-zinc-500" strokeWidth={2.4} />,
  },
};

function inferType(recommendation?: string): RecType {
  const r = (recommendation ?? "").toLowerCase();
  if (r.includes("approve") || r.includes("accept")) return "approve";
  if (r.includes("reject") || r.includes("deny") || r.includes("repay")) return "deny";
  if (r.includes("complete") || r.includes("auto")) return "complete";
  return "review";
}

/**
 * Strips a leading verdict word ("Approve.", "Deny + request repayment.")
 * from the reasoning so we don't repeat it next to the title.
 */
function stripLeadingVerdict(reasoning: string): string {
  return reasoning
    .replace(/^\s*(approve|deny|review|reject|hold|approve with [\w\s]+?|deny \+ [\w\s]+?)\.\s+/i, "")
    .trim();
}

export default function AIRecommendationCard({
  recommendation,
  reasoning,
  type: explicitType,
  compact = false,
}: {
  recommendation?: string;
  reasoning?: string;
  type?: RecType;
  compact?: boolean;
}) {
  const [vote, setVote] = useState<"up" | "down" | null>(null);
  const recType = explicitType ?? inferType(recommendation);
  const style = STYLES[recType];
  const body = reasoning ? stripLeadingVerdict(reasoning) : "";

  return (
    <div
      className={`bg-white rounded-[20px] border border-zinc-200/70 shadow-sm ${
        compact ? "px-4 py-3.5" : "px-5 py-5"
      }`}
    >
      <div className="flex items-start gap-4">
        <div
          className={`${style.iconBg} ring-1 rounded-full flex items-center justify-center flex-shrink-0 ${
            compact ? "w-8 h-8" : "w-10 h-10"
          }`}
        >
          {style.icon}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <Sparkles className="w-3 h-3 text-zinc-400" />
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.12em]">
              AI recommendation
            </span>
          </div>
          <p
            className={`font-bold tracking-tight ${style.accent} leading-tight ${
              compact ? "text-[14px]" : "text-[18px]"
            }`}
          >
            {style.title}
          </p>
          {body && (
            <p
              className={`mt-2.5 text-zinc-600 font-medium leading-relaxed ${
                compact ? "text-[12.5px]" : "text-[14px]"
              }`}
            >
              {body}
            </p>
          )}
        </div>

        {!compact && (
          <div className="flex items-center gap-1 flex-shrink-0 -mr-1">
            <button
              onClick={() => setVote(vote === "up" ? null : "up")}
              aria-label="Helpful"
              className={`p-1.5 rounded-lg transition-colors ${
                vote === "up"
                  ? "bg-emerald-50 text-emerald-700"
                  : "text-zinc-300 hover:text-zinc-500 hover:bg-zinc-50"
              }`}
            >
              <ThumbsUp className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setVote(vote === "down" ? null : "down")}
              aria-label="Not helpful"
              className={`p-1.5 rounded-lg transition-colors ${
                vote === "down"
                  ? "bg-rose-50 text-rose-700"
                  : "text-zinc-300 hover:text-zinc-500 hover:bg-zinc-50"
              }`}
            >
              <ThumbsDown className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
