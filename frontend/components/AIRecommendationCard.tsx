"use client";

import { useState } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import RecommendationBadge from "@/components/RecommendationBadge";
import type { AiDecision } from "@/lib/types";

/**
 * Sift's recommendation card.
 *
 * Driven entirely by the structured `decision` enum from the backend
 * (approve | review | reject). Free-text heuristic parsing is gone — the
 * three-state column is the source of truth.
 */

interface AIRecommendationCardProps {
  decision: AiDecision;
  reasoning?: string;
  /** Cited policy snippet — drives the (i) tooltip on the badge */
  citation?: string | null;
  citedSectionId?: string | null;
  /** Compact mode for embedding in narrow surfaces */
  compact?: boolean;
}

export default function AIRecommendationCard({
  decision,
  reasoning,
  citation,
  citedSectionId,
  compact = false,
}: AIRecommendationCardProps) {
  const [vote, setVote] = useState<"up" | "down" | null>(null);

  return (
    <div
      className={`bg-white rounded-[20px] border border-zinc-200/70 shadow-sm ${
        compact ? "px-4 py-3.5" : "px-5 py-5"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.12em]">
              Sift recommendation
            </span>
            <RecommendationBadge
              decision={decision}
              citation={citation}
              sectionId={citedSectionId}
              size={compact ? "sm" : "md"}
            />
          </div>
          {reasoning && (
            <p
              className={`text-zinc-700 font-medium leading-relaxed ${
                compact ? "text-[12.5px]" : "text-[14px]"
              }`}
            >
              {reasoning}
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
