"use client";

import { useState } from "react";
import { CheckCircle2, AlertCircle, XOctagon, Info } from "lucide-react";
import type { AiDecision } from "@/lib/types";

const STYLES: Record<
  AiDecision,
  {
    label: string;
    pillCls: string;
    iconBg: string;
    icon: React.ReactNode;
  }
> = {
  approve: {
    label: "Approval recommended",
    pillCls: "bg-emerald-50 text-emerald-800 border-emerald-200/80",
    iconBg: "bg-emerald-500",
    icon: <CheckCircle2 className="w-3 h-3 text-white" strokeWidth={2.6} />,
  },
  review: {
    label: "Requires review",
    pillCls: "bg-amber-50 text-amber-800 border-amber-200/80",
    iconBg: "bg-amber-500",
    icon: <AlertCircle className="w-3 h-3 text-white" strokeWidth={2.6} />,
  },
  reject: {
    label: "Rejection recommended",
    pillCls: "bg-rose-50 text-rose-800 border-rose-200/80",
    iconBg: "bg-rose-500",
    icon: <XOctagon className="w-3 h-3 text-white" strokeWidth={2.6} />,
  },
};

export interface RecommendationBadgeProps {
  decision: AiDecision;
  /** Short snippet of the policy text the AI cited */
  citation?: string | null;
  /** Section ID — shown in the popover so the admin can locate it */
  sectionId?: string | null;
  /** Render size */
  size?: "sm" | "md";
  /** Hide the (i) info button (e.g. for compact list rows) */
  hideInfo?: boolean;
}

export default function RecommendationBadge({
  decision,
  citation,
  sectionId,
  size = "md",
  hideInfo = false,
}: RecommendationBadgeProps) {
  const [open, setOpen] = useState(false);
  const style = STYLES[decision];
  const showInfo = !hideInfo && Boolean(citation);

  const padding = size === "sm" ? "px-2 py-0.5" : "px-2.5 py-1";
  const text = size === "sm" ? "text-[10.5px]" : "text-[11.5px]";

  return (
    <span className="relative inline-flex items-center">
      <span
        className={`inline-flex items-center gap-1.5 ${padding} rounded-full border ${style.pillCls} ${text} font-bold tracking-tight`}
      >
        <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center ${style.iconBg}`}>
          {style.icon}
        </span>
        {style.label}
      </span>

      {showInfo && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpen((o) => !o);
          }}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          aria-label="Show cited policy rule"
          aria-expanded={open}
          className="ml-1.5 p-1 rounded-full text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
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
