"use client";

import { useState } from "react";
import { CheckCircle2, AlertCircle, XOctagon, Info } from "lucide-react";
import type { AiDecision } from "@/lib/types";

const STYLES: Record<
  AiDecision,
  { label: string; pill: string; dot: string; iconCls: string; icon: React.ReactNode }
> = {
  approve: {
    label: "Approval recommended",
    pill: "bg-emerald-50/90 text-emerald-800 border-emerald-200/70",
    dot: "bg-emerald-500",
    iconCls: "text-emerald-600",
    icon: <CheckCircle2 className="w-3 h-3" strokeWidth={2.4} />,
  },
  review: {
    label: "Requires review",
    pill: "bg-amber-50/90 text-amber-800 border-amber-200/70",
    dot: "bg-amber-500",
    iconCls: "text-amber-600",
    icon: <AlertCircle className="w-3 h-3" strokeWidth={2.4} />,
  },
  reject: {
    label: "Rejection recommended",
    pill: "bg-rose-50/90 text-rose-800 border-rose-200/70",
    dot: "bg-rose-500",
    iconCls: "text-rose-600",
    icon: <XOctagon className="w-3 h-3" strokeWidth={2.4} />,
  },
};

export interface RecommendationBadgeProps {
  decision: AiDecision;
  citation?: string | null;
  sectionId?: string | null;
  /** "pill" = the full coloured chip; "dot" = a tiny coloured dot for dense lists */
  variant?: "pill" | "dot";
  size?: "sm" | "md";
  /** Hide the (i) info button (useful for very dense lists) */
  hideInfo?: boolean;
}

export default function RecommendationBadge({
  decision,
  citation,
  sectionId,
  variant = "pill",
  size = "md",
  hideInfo = false,
}: RecommendationBadgeProps) {
  const [open, setOpen] = useState(false);
  const style = STYLES[decision];

  if (variant === "dot") {
    return (
      <span
        className="inline-flex items-center gap-1.5"
        title={style.label}
        aria-label={style.label}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
      </span>
    );
  }

  const showInfo = !hideInfo && Boolean(citation);
  const padding = size === "sm" ? "px-2 py-0.5" : "px-2.5 py-1";
  const text = size === "sm" ? "text-[10.5px]" : "text-[11.5px]";

  return (
    <span className="relative inline-flex items-center">
      <span
        className={`inline-flex items-center gap-1.5 ${padding} rounded-full border ${style.pill} ${text} font-semibold tracking-tight`}
      >
        <span className={style.iconCls}>{style.icon}</span>
        {style.label}
      </span>

      {showInfo && (
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o); }}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          aria-label="Show cited policy rule"
          aria-expanded={open}
          className="ml-1 p-0.5 rounded-full text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
        >
          <Info className="w-3.5 h-3.5" />
        </button>
      )}

      {open && citation && (
        <span
          role="tooltip"
          className="absolute top-full left-0 mt-2 w-[300px] z-30 bg-white border border-zinc-200 rounded-[12px] shadow-[0_8px_24px_rgba(0,0,0,0.10)] p-4 text-left"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
        >
          <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-400">
            Cited rule
            {sectionId && (
              <span className="ml-1.5 normal-case tracking-normal text-zinc-500 font-medium">
                · {sectionId}
              </span>
            )}
          </span>
          <span className="block text-[12.5px] text-zinc-700 font-medium leading-relaxed mt-1.5">
            {citation}
          </span>
        </span>
      )}
    </span>
  );
}
