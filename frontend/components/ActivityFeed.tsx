"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2, AlertCircle, ShieldAlert, Sparkles, Zap, FileText,
  Wallet, Receipt, Settings, Upload, Bot,
} from "lucide-react";
import { getActivity } from "@/lib/api";
import type { ActivityEvent, ActivityAction } from "@/lib/types";

const ICONS: Record<ActivityAction, { icon: React.ReactNode; bg: string; ring: string }> = {
  recommended:        { icon: <Sparkles className="w-3.5 h-3.5 text-zinc-700" />,    bg: "bg-zinc-100",   ring: "ring-zinc-200" },
  auto_approved:      { icon: <Zap className="w-3.5 h-3.5 text-emerald-700" />,      bg: "bg-emerald-50", ring: "ring-emerald-200" },
  flagged:            { icon: <ShieldAlert className="w-3.5 h-3.5 text-amber-700" />,bg: "bg-amber-50",   ring: "ring-amber-200" },
  human_decision:     { icon: <CheckCircle2 className="w-3.5 h-3.5 text-zinc-700" />,bg: "bg-zinc-100",   ring: "ring-zinc-200" },
  policy_edit:        { icon: <Settings className="w-3.5 h-3.5 text-blue-700" />,    bg: "bg-blue-50",    ring: "ring-blue-200" },
  suggestion_applied: { icon: <Sparkles className="w-3.5 h-3.5 text-blue-700" />,    bg: "bg-blue-50",    ring: "ring-blue-200" },
  policy_uploaded:    { icon: <Upload className="w-3.5 h-3.5 text-blue-700" />,      bg: "bg-blue-50",    ring: "ring-blue-200" },
  budget_edited:      { icon: <Wallet className="w-3.5 h-3.5 text-zinc-700" />,      bg: "bg-zinc-100",   ring: "ring-zinc-200" },
  receipt_uploaded:   { icon: <Receipt className="w-3.5 h-3.5 text-zinc-700" />,     bg: "bg-zinc-100",   ring: "ring-zinc-200" },
  submission_updated: { icon: <FileText className="w-3.5 h-3.5 text-zinc-700" />,    bg: "bg-zinc-100",   ring: "ring-zinc-200" },
};

function fallbackIcon() {
  return { icon: <AlertCircle className="w-3.5 h-3.5 text-zinc-700" />, bg: "bg-zinc-100", ring: "ring-zinc-200" };
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

interface ActivityFeedProps {
  /** If set, scopes to one transaction (for the approval detail view). */
  transactionRowid?: number;
  /** Max events to show. */
  limit?: number;
  /** Compact display for narrow surfaces. */
  compact?: boolean;
  /** Header label override. */
  title?: string;
  /** Bumping this re-fetches without unmounting. */
  refreshKey?: number;
}

export default function ActivityFeed({
  transactionRowid,
  limit = 30,
  compact = false,
  title,
  refreshKey = 0,
}: ActivityFeedProps) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getActivity({ transaction_rowid: transactionRowid, limit })
      .then((rows) => { if (!cancelled) setEvents(rows); })
      .catch(() => { if (!cancelled) setEvents([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [transactionRowid, limit, refreshKey]);

  if (loading) {
    return (
      <div className="text-[12px] text-zinc-400 font-medium px-1 py-2">
        Loading activity…
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="text-[12px] text-zinc-400 font-medium px-1 py-2">
        No activity yet.
      </div>
    );
  }

  return (
    <div>
      {title && (
        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.12em] mb-3">
          {title}
        </p>
      )}
      <ol className="space-y-3">
        {events.map((ev) => {
          const ic = ICONS[ev.action] ?? fallbackIcon();
          return (
            <li key={ev.id} className="flex items-start gap-3">
              <div className={`flex-shrink-0 ${ic.bg} ring-1 ${ic.ring} rounded-full ${compact ? "w-7 h-7" : "w-8 h-8"} flex items-center justify-center`}>
                {ic.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`font-semibold text-zinc-800 ${compact ? "text-[12px]" : "text-[13px]"}`}>
                    {actorLabel(ev.actor)}
                  </span>
                  <span className="text-[11px] text-zinc-400 font-medium">
                    · {relativeTime(ev.occurred_at)}
                  </span>
                </div>
                <p className={`text-zinc-600 font-medium leading-snug mt-0.5 ${compact ? "text-[11.5px]" : "text-[12.5px]"}`}>
                  {ev.message}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function actorLabel(actor: string): string {
  if (actor === "agent") return "Sift";
  if (actor === "admin") return "Admin";
  if (actor === "system") return "System";
  return actor;
}

// Re-export the bot icon for callers that want a header glyph
export { Bot };
