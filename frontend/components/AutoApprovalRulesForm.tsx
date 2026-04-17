"use client";

import { useState } from "react";
import { Plus, X, Zap } from "lucide-react";
import type { PolicyDocument, AutoApprovalRule } from "@/lib/types";

interface AutoApprovalRulesFormProps {
  doc: PolicyDocument;
  onSave: (patch: Partial<PolicyDocument>) => Promise<void>;
}

export default function AutoApprovalRulesForm({ doc, onSave }: AutoApprovalRulesFormProps) {
  const [enabled, setEnabled] = useState(doc.auto_approval_rules.enabled);
  const [rules, setRules] = useState<AutoApprovalRule[]>(doc.auto_approval_rules.rules);
  const [saving, setSaving] = useState(false);

  function update(idx: number, patch: Partial<AutoApprovalRule>) {
    setRules(rules.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function remove(idx: number) {
    setRules(rules.filter((_, i) => i !== idx));
  }

  function add() {
    setRules([
      ...rules,
      { id: `rule_${Date.now()}`, max_amount: 50, mcc_in: null, mcc_not_in: null, role_in: null, rationale: "" },
    ]);
  }

  async function save() {
    setSaving(true);
    try {
      await onSave({ auto_approval_rules: { enabled, rules } });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Master toggle */}
      <div className="bg-white border border-zinc-200/70 rounded-[20px] shadow-sm p-5 flex items-center gap-4">
        <div className="w-10 h-10 rounded-full bg-emerald-50 ring-1 ring-emerald-200 flex items-center justify-center flex-shrink-0">
          <Zap className="w-5 h-5 text-emerald-600" />
        </div>
        <div className="flex-1">
          <p className="text-[14px] font-bold text-zinc-900 tracking-tight">
            Allow Sift to auto-approve clearly in-policy expenses
          </p>
          <p className="text-[12.5px] text-zinc-500 font-medium mt-0.5 leading-snug">
            When a transaction matches any rule below, Sift records an approval immediately
            without sending it to a reviewer. Reviewers always retain final authority.
          </p>
        </div>
        <button
          role="switch"
          aria-checked={enabled}
          onClick={() => setEnabled(!enabled)}
          className={`relative w-11 h-6 rounded-full transition-colors ${
            enabled ? "bg-emerald-500" : "bg-zinc-200"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
              enabled ? "translate-x-5" : ""
            }`}
          />
        </button>
      </div>

      {/* Rules */}
      <div className="space-y-3">
        {rules.map((r, idx) => (
          <div key={r.id} className="bg-white border border-zinc-200/70 rounded-[16px] shadow-sm p-5 space-y-3">
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
              <SmallNum
                label="Max amount ($)"
                value={r.max_amount ?? null}
                onChange={(v) => update(idx, { max_amount: v })}
              />
              <SmallList
                label="MCC includes (comma-sep)"
                value={r.mcc_in}
                onChange={(v) => update(idx, { mcc_in: v })}
              />
              <SmallList
                label="MCC excludes"
                value={r.mcc_not_in}
                onChange={(v) => update(idx, { mcc_not_in: v })}
              />
              <SmallStrList
                label="Role limited to"
                value={r.role_in}
                onChange={(v) => update(idx, { role_in: v })}
              />
            </div>

            <textarea
              value={r.rationale ?? ""}
              onChange={(e) => update(idx, { rationale: e.target.value })}
              placeholder="Why this auto-approves (used as the citation)"
              rows={2}
              className="w-full text-[12.5px] font-medium text-zinc-700 leading-relaxed bg-zinc-50/50 rounded-[10px] border border-zinc-200 p-3 focus:border-zinc-900 outline-none"
            />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between bg-white rounded-[16px] border border-zinc-200/60 shadow-sm px-5 py-3">
        <button
          onClick={add}
          className="flex items-center gap-1.5 text-[12.5px] font-bold text-zinc-700 hover:text-zinc-900"
        >
          <Plus className="w-3.5 h-3.5" /> Add rule
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="px-5 py-2 rounded-[10px] bg-zinc-900 hover:bg-black text-white text-[13px] font-bold shadow-sm disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save auto-approval rules"}
        </button>
      </div>
    </div>
  );
}

function SmallNum({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
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

function SmallList({ label, value, onChange }: { label: string; value: number[] | null | undefined; onChange: (v: number[] | null) => void }) {
  return (
    <div>
      <label className="block text-[10.5px] font-bold uppercase tracking-[0.1em] text-zinc-500 mb-1.5">{label}</label>
      <input
        type="text"
        value={(value ?? []).join(", ")}
        placeholder="e.g. 5541, 5542"
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

function SmallStrList({ label, value, onChange }: { label: string; value: string[] | null | undefined; onChange: (v: string[] | null) => void }) {
  return (
    <div>
      <label className="block text-[10.5px] font-bold uppercase tracking-[0.1em] text-zinc-500 mb-1.5">{label}</label>
      <input
        type="text"
        value={(value ?? []).join(", ")}
        placeholder="e.g. Long-Haul Driver"
        onChange={(e) => {
          const raw = e.target.value
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          onChange(raw.length ? raw : null);
        }}
        className="w-full px-3 py-2 text-[13px] bg-white border border-zinc-200 rounded-[8px] outline-none focus:border-zinc-900"
      />
    </div>
  );
}
