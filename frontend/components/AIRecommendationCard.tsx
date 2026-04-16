"use client";

import { useState } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";

type RecType = "approve" | "review" | "deny" | "complete";

const STYLES: Record<RecType, { bg: string; border: string; accent: string; title: string; titleColor: string }> = {
  approve: {
    bg: "bg-green-50",
    border: "border-green-200",
    accent: "border-l-green-600",
    title: "Approval recommended",
    titleColor: "text-green-800",
  },
  review: {
    bg: "bg-yellow-50",
    border: "border-yellow-200",
    accent: "border-l-yellow-500",
    title: "Requires review",
    titleColor: "text-yellow-800",
  },
  deny: {
    bg: "bg-red-50/30",
    border: "border-red-200/40",
    accent: "border-l-red-700",
    title: "Request repayment",
    titleColor: "text-red-900",
  },
  complete: {
    bg: "bg-slate-50",
    border: "border-slate-200",
    accent: "border-l-slate-400",
    title: "Transaction complete",
    titleColor: "text-slate-700",
  },
};

function inferType(recommendation?: string): RecType {
  const r = (recommendation ?? "").toLowerCase();
  if (r.includes("approve") || r.includes("accept")) return "approve";
  if (r.includes("reject") || r.includes("deny") || r.includes("repay")) return "deny";
  if (r.includes("complete") || r.includes("auto")) return "complete";
  return "review";
}

function parseReasoning(reasoning?: string): string[] {
  if (!reasoning) return [];
  return reasoning
    .split(/[.;]\s+/)
    .map((s) => s.trim().replace(/^[-•]\s*/, ""))
    .filter((s) => s.length > 5);
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
  const bullets = parseReasoning(reasoning);

  return (
    <div
      className={`${style.bg} ${style.border} ${style.accent} border border-l-[4px] rounded-xl ${
        compact ? "px-4 py-3" : "px-5 py-4 shadow-sm"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className={`${compact ? "text-[13px]" : "text-[16px]"} font-bold tracking-tight ${style.titleColor}`}>
            {style.title}
          </p>
          {bullets.length > 0 && (
            <ul className={`mt-3 space-y-2.5 ${compact ? "text-[12px]" : "text-[14px]"} font-medium text-zinc-600`}>
              {bullets.slice(0, compact ? 2 : 4).map((b, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="mt-2 flex-shrink-0 w-1 h-1 rounded-full bg-zinc-300"></span>
                  <span className="leading-relaxed text-zinc-600">{b}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {!compact && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={() => setVote(vote === "up" ? null : "up")}
              className={`p-1.5 rounded-md transition-colors ${
                vote === "up" ? "bg-green-100 text-green-700" : "text-zinc-300 hover:text-zinc-500 hover:bg-zinc-100/50"
              }`}
            >
              <ThumbsUp className="w-4 h-4" />
            </button>
            <button
              onClick={() => setVote(vote === "down" ? null : "down")}
              className={`p-1.5 rounded-md transition-colors ${
                vote === "down" ? "bg-red-100 text-red-700" : "text-zinc-300 hover:text-zinc-500 hover:bg-zinc-100/50"
              }`}
            >
              <ThumbsDown className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
