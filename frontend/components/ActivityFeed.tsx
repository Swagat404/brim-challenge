"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2, AlertCircle, ShieldAlert, Sparkles, Zap, FileText,
  Wallet, Receipt, Settings, Upload, Bot,
} from "lucide-react";
import { getActivity } from "@/lib/api";
import type { ActivityEvent, ActivityAction } from "@/lib/types";

// All entries share the same neutral zinc styling — distinction comes
// from the icon shape + actor label, not from color noise.
const ICONS: Record<ActivityAction, React.ReactNode> = {
  recommended:        <Sparkles    className="w-3 h-3 text-zinc-600" />,
  auto_approved:      <Zap         className="w-3 h-3 text-zinc-600" />,
  flagged:            <ShieldAlert className="w-3 h-3 text-zinc-600" />,
  human_decision:     <CheckCircle2 className="w-3 h-3 text-zinc-600" />,
  policy_edit:        <Settings    className="w-3 h-3 text-zinc-600" />,
  suggestion_applied: <Sparkles    className="w-3 h-3 text-zinc-600" />,
  policy_uploaded:    <Upload      className="w-3 h-3 text-zinc-600" />,
  budget_edited:      <Wallet      className="w-3 h-3 text-zinc-600" />,
  receipt_uploaded:   <Receipt     className="w-3 h-3 text-zinc-600" />,
  submission_updated: <FileText    className="w-3 h-3 text-zinc-600" />,
};

function fallbackIcon() {
  return <AlertCircle className="w-3 h-3 text-zinc-600" />;
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

  const dotSize = compact ? 22 : 26; // px — must stay in sync with the connector geometry below

  return (
    <div>
      {title && (
        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.12em] mb-3">
          {title}
        </p>
      )}
      <ol className="relative">
        {events.map((ev, i) => {
          const icon = ICONS[ev.action] ?? fallbackIcon();
          const isLast = i === events.length - 1;
          const value = pickValue(ev);
          return (
            <li
              key={ev.id}
              className="relative flex gap-3 pb-4 last:pb-0"
            >
              {/* Vertical connector line — runs from below this dot to the next dot. */}
              {!isLast && (
                <span
                  aria-hidden
                  className="absolute left-[12px] top-[26px] bottom-0 w-px bg-zinc-200"
                  style={{ left: `${dotSize / 2 - 0.5}px` }}
                />
              )}

              {/* Dot */}
              <div
                className="relative z-10 flex-shrink-0 rounded-full bg-white ring-1 ring-zinc-200 flex items-center justify-center"
                style={{ width: dotSize, height: dotSize, marginTop: 1 }}
              >
                {icon}
              </div>

              {/* Body */}
              <div className="flex-1 min-w-0 pt-[1px]">
                <div className="flex items-baseline gap-1.5 flex-wrap">
                  <span className={`font-bold text-zinc-900 ${compact ? "text-[12px]" : "text-[13px]"} tracking-tight`}>
                    {actorLabel(ev.actor)}
                  </span>
                  <span className="text-[10.5px] text-zinc-400 font-medium">
                    · {relativeTime(ev.occurred_at)}
                  </span>
                </div>
                <p className={`text-zinc-600 font-medium leading-snug mt-0.5 ${compact ? "text-[11.5px]" : "text-[12.5px]"}`}>
                  {ev.message}
                </p>
                {value && (
                  <div
                    className={`inline-block mt-1.5 px-2.5 py-1 rounded-[8px] bg-zinc-100 text-zinc-700 ${
                      compact ? "text-[11px]" : "text-[12px]"
                    } font-medium leading-snug max-w-full break-words`}
                  >
                    {value}
                  </div>
                )}
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

/**
 * If the activity event carries a structured value worth surfacing as a
 * pill (new memo, attendees added, etc.), return it. Otherwise null.
 *
 * This mirrors Ramp's pattern of showing the new value right under the
 * "Updated the memo" line as a discrete chip — much more glanceable than
 * burying the value in prose.
 */
function pickValue(ev: ActivityEvent): string | null {
  const md = ev.metadata as Record<string, unknown> | undefined;
  if (!md) return null;
  // Common shapes — keep this lenient so the UI doesn't crash on schema drift.
  if (typeof md.value === "string" && md.value.trim()) return md.value.trim();
  if (typeof md.new_value === "string" && md.new_value.trim()) return md.new_value.trim();
  if (typeof md.memo === "string" && md.memo.trim()) return md.memo.trim();
  return null;
}

// Re-export the bot icon for callers that want a header glyph
export { Bot };
