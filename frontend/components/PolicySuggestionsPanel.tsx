"use client";

import { useEffect, useState } from "react";
import {
  Lightbulb, AlertTriangle, MessageSquareWarning, Layers, Loader2, RefreshCw, Check, X,
} from "lucide-react";
import { getPolicySuggestions, generatePolicySuggestions, resolveSuggestion } from "@/lib/api";
import type { PolicySuggestion, SuggestionCategory } from "@/lib/types";

const CATEGORY_META: Record<SuggestionCategory, { label: string; icon: React.ReactNode; bg: string; ring: string }> = {
  needs_detail: {
    label: "Needs more detail",
    icon: <Lightbulb className="w-3.5 h-3.5 text-amber-700" />,
    bg: "bg-amber-50", ring: "ring-amber-200",
  },
  conflicting: {
    label: "Conflicting rules",
    icon: <AlertTriangle className="w-3.5 h-3.5 text-rose-700" />,
    bg: "bg-rose-50", ring: "ring-rose-200",
  },
  unintended_manual: {
    label: "Unintended manual reviews",
    icon: <MessageSquareWarning className="w-3.5 h-3.5 text-blue-700" />,
    bg: "bg-blue-50", ring: "ring-blue-200",
  },
  missing_coverage: {
    label: "Missing coverage",
    icon: <Layers className="w-3.5 h-3.5 text-zinc-700" />,
    bg: "bg-zinc-100", ring: "ring-zinc-200",
  },
};

interface PolicySuggestionsPanelProps {
  onChange?: () => void;
}

export default function PolicySuggestionsPanel({ onChange }: PolicySuggestionsPanelProps) {
  const [suggestions, setSuggestions] = useState<PolicySuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [resolving, setResolving] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    try {
      const rows = await getPolicySuggestions();
      setSuggestions(rows);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function generate() {
    setGenerating(true);
    try {
      await generatePolicySuggestions();
      await load();
    } finally {
      setGenerating(false);
    }
  }

  async function resolve(id: number, action: "apply" | "dismiss") {
    setResolving(id);
    try {
      await resolveSuggestion(id, action);
      await load();
      onChange?.();
    } finally {
      setResolving(null);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-4 border-b border-zinc-100 flex-shrink-0">
        <div className="flex items-center justify-between mb-1">
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.12em]">
            Sift suggestions
          </p>
          <button
            onClick={generate}
            disabled={generating}
            className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors disabled:opacity-50"
            aria-label="Regenerate"
            title="Scan policy + activity for new suggestions"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${generating ? "animate-spin" : ""}`} />
          </button>
        </div>
        <p className="text-[12.5px] font-medium text-zinc-700 leading-snug">
          {loading
            ? "Loading…"
            : suggestions.length === 0
            ? generating
              ? "Scanning…"
              : "No open suggestions"
            : `Sift found ${suggestions.length} gap${suggestions.length === 1 ? "" : "s"} in your policy.`}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 min-h-0">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-zinc-400">
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
        ) : suggestions.length === 0 ? (
          <button
            onClick={generate}
            disabled={generating}
            className="w-full text-center px-4 py-6 rounded-[16px] border border-dashed border-zinc-200 text-[12px] font-semibold text-zinc-500 hover:border-zinc-300 hover:bg-zinc-50 transition-colors disabled:opacity-50"
          >
            {generating ? "Scanning policy…" : "Generate suggestions"}
          </button>
        ) : (
          suggestions.map((s) => {
            const meta = CATEGORY_META[s.category];
            const isResolving = resolving === s.id;
            const canApply = s.suggested_edit !== null && s.suggested_edit !== undefined;
            return (
              <div
                key={s.id}
                className="bg-white border border-zinc-200/70 rounded-[16px] p-4 shadow-sm"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className={`w-6 h-6 rounded-full ${meta.bg} ring-1 ${meta.ring} flex items-center justify-center`}>
                    {meta.icon}
                  </span>
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.1em]">
                    {meta.label}
                  </span>
                </div>
                <p className="text-[13px] font-bold text-zinc-900 tracking-tight leading-snug mb-1.5">
                  {s.title}
                </p>
                <p className="text-[12px] text-zinc-600 font-medium leading-relaxed">
                  {s.body}
                </p>
                <div className="flex gap-2 mt-3">
                  {canApply && (
                    <button
                      onClick={() => resolve(s.id, "apply")}
                      disabled={isResolving}
                      className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded-[10px] bg-zinc-900 text-white text-[11px] font-bold hover:bg-black transition-colors disabled:opacity-50"
                    >
                      <Check className="w-3 h-3" /> Apply
                    </button>
                  )}
                  <button
                    onClick={() => resolve(s.id, "dismiss")}
                    disabled={isResolving}
                    className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded-[10px] border border-zinc-200 text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 text-[11px] font-bold transition-colors disabled:opacity-50"
                  >
                    <X className="w-3 h-3" /> Dismiss
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
