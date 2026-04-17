"use client";

import { useEffect, useState } from "react";
import { Zap, X } from "lucide-react";
import { getActivityRollup } from "@/lib/api";
import type { ActivityRollup } from "@/lib/types";

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const days = Math.round((Date.now() - then) / (1000 * 60 * 60 * 24));
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

interface AutoApprovalBannerProps {
  windowDays?: number;
  /** Persist dismissal in sessionStorage. */
  storageKey?: string;
}

export default function AutoApprovalBanner({
  windowDays = 90,
  storageKey = "sift_auto_approval_banner_dismissed",
}: AutoApprovalBannerProps) {
  const [data, setData] = useState<ActivityRollup | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && sessionStorage.getItem(storageKey) === "1") {
      setDismissed(true);
    }
    getActivityRollup(windowDays).then(setData).catch(() => setData(null));
  }, [windowDays, storageKey]);

  if (dismissed || !data || data.count === 0) return null;

  function dismiss() {
    if (typeof window !== "undefined") sessionStorage.setItem(storageKey, "1");
    setDismissed(true);
  }

  return (
    <div className="bg-white border border-zinc-200/70 rounded-[20px] shadow-sm px-5 py-4 flex items-center gap-4">
      <div className="w-10 h-10 rounded-full bg-emerald-50 ring-1 ring-emerald-200 flex items-center justify-center flex-shrink-0">
        <Zap className="w-5 h-5 text-emerald-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-semibold text-zinc-900 leading-tight">
          {data.count.toLocaleString()} transactions were automatically approved by Sift
        </p>
        <p className="text-[12.5px] text-zinc-500 font-medium mt-0.5">
          {fmtDate(data.last_at)}
          <span className="text-zinc-300 mx-1.5">·</span>
          Purchases totalling <span className="font-bold text-zinc-700">{fmtMoney(data.total_amount)}</span> were in policy
        </p>
      </div>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors flex-shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
