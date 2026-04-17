"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import type { PolicyDocument, SubmissionRequirementRule } from "@/lib/types";

interface SubmissionRequirementsFormProps {
  doc: PolicyDocument;
  onSave: (patch: Partial<PolicyDocument>) => Promise<void>;
}

const ALL_REQUIREABLE = ["receipt", "memo", "attendees", "business_purpose"] as const;

export default function SubmissionRequirementsForm({ doc, onSave }: SubmissionRequirementsFormProps) {
  const [rules, setRules] = useState<SubmissionRequirementRule[]>(doc.submission_requirements);
  const [saving, setSaving] = useState(false);

  function update(idx: number, patch: Partial<SubmissionRequirementRule>) {
    setRules(rules.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function remove(idx: number) {
    setRules(rules.filter((_, i) => i !== idx));
  }

  function add() {
    setRules([
      ...rules,
      {
        id: `req_${Date.now()}`,
        applies_when: { amount_over: 200 },
        require: ["receipt"],
        rationale: "",
      },
    ]);
  }

  function toggleReq(idx: number, field: string) {
    const r = rules[idx];
    const current = new Set(r.require);
    if (current.has(field)) current.delete(field);
    else current.add(field);
    update(idx, { require: Array.from(current) });
  }

  async function save() {
    setSaving(true);
    try {
      await onSave({ submission_requirements: rules });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-[12.5px] text-zinc-500 font-medium leading-relaxed">
        Rules for what employees must <em>submit</em> (receipt, memo,
        attendees, business purpose) for certain transactions — distinct
        from the dollar limits in the <span className="font-bold text-zinc-700">Thresholds &amp; Limits</span> tab.
        When a rule applies and a required field is missing, Sift defaults
        the recommendation to <span className="font-bold text-zinc-700">review</span> with a citation pointing at the rule.
      </p>

      {rules.map((r, idx) => (
        <div key={r.id} className="bg-white border border-zinc-200/70 rounded-[16px] shadow-sm p-5 space-y-4">
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={r.id}
              onChange={(e) => update(idx, { id: e.target.value })}
              className="flex-1 text-[13px] font-bold text-zinc-900 bg-transparent border-b border-zinc-200 focus:border-zinc-900 outline-none"
            />
            <button onClick={() => remove(idx)} className="p-1.5 text-zinc-400 hover:text-rose-700">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Cond
              label="Applies when amount > ($)"
              value={r.applies_when?.amount_over ?? null}
              onChange={(v) =>
                update(idx, {
                  applies_when: { ...r.applies_when, amount_over: v ?? undefined },
                })
              }
            />
            <McсList
              label="Applies when MCC includes"
              value={r.applies_when?.mcc_in ?? null}
              onChange={(v) =>
                update(idx, {
                  applies_when: { ...r.applies_when, mcc_in: v ?? undefined },
                })
              }
            />
          </div>

          <div>
            <label className="block text-[10.5px] font-bold uppercase tracking-[0.1em] text-zinc-500 mb-2">
              Required fields
            </label>
            <div className="flex flex-wrap gap-2">
              {ALL_REQUIREABLE.map((f) => {
                const active = r.require.includes(f);
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => toggleReq(idx, f)}
                    className={`px-3 py-1.5 rounded-full border text-[12px] font-bold transition-colors ${
                      active
                        ? "bg-zinc-900 text-white border-zinc-900"
                        : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400"
                    }`}
                  >
                    {f.replace("_", " ")}
                  </button>
                );
              })}
            </div>
          </div>

          <textarea
            value={r.rationale ?? ""}
            onChange={(e) => update(idx, { rationale: e.target.value })}
            placeholder="One-sentence rationale (used as the citation when the rule fires)"
            rows={2}
            className="w-full text-[12.5px] font-medium text-zinc-700 leading-relaxed bg-zinc-50/50 rounded-[10px] border border-zinc-200 p-3 focus:border-zinc-900 outline-none"
          />
        </div>
      ))}

      <div className="flex items-center justify-between bg-white rounded-[16px] border border-zinc-200/60 shadow-sm px-5 py-3">
        <button
          onClick={add}
          className="flex items-center gap-1.5 text-[12.5px] font-bold text-zinc-700 hover:text-zinc-900"
        >
          <Plus className="w-3.5 h-3.5" /> Add requirement
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="px-5 py-2 rounded-[10px] bg-zinc-900 hover:bg-black text-white text-[13px] font-bold shadow-sm disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save submission requirements"}
        </button>
      </div>
    </div>
  );
}

function Cond({
  label, value, onChange,
}: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div>
      <label className="block text-[10.5px] font-bold uppercase tracking-[0.1em] text-zinc-500 mb-1.5">{label}</label>
      <input
        type="number"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value ? parseFloat(e.target.value) : null)}
        className="w-full px-3 py-2 text-[13px] tabular-nums bg-white border border-zinc-200 rounded-[8px] outline-none focus:border-zinc-900"
      />
    </div>
  );
}

function McсList({
  label, value, onChange,
}: { label: string; value: number[] | null; onChange: (v: number[] | null) => void }) {
  return (
    <div>
      <label className="block text-[10.5px] font-bold uppercase tracking-[0.1em] text-zinc-500 mb-1.5">{label}</label>
      <input
        type="text"
        value={(value ?? []).join(", ")}
        placeholder="e.g. 5812, 5813"
        onChange={(e) => {
          const raw = e.target.value
            .split(/[,\s]+/)
            .map((s) => parseInt(s, 10))
            .filter((n) => Number.isInteger(n));
          onChange(raw.length ? raw : null);
        }}
        className="w-full px-3 py-2 text-[13px] bg-white border border-zinc-200 rounded-[8px] outline-none focus:border-zinc-900"
      />
    </div>
  );
}
