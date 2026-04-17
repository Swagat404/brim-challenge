"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import type { PolicyDocument } from "@/lib/types";

interface ThresholdsFormProps {
  doc: PolicyDocument;
  onSave: (patch: Partial<PolicyDocument>) => Promise<void>;
}

export default function ThresholdsForm({ doc, onSave }: ThresholdsFormProps) {
  const [thresholds, setThresholds] = useState({ ...doc.thresholds });
  const [restrictions, setRestrictions] = useState({
    mcc_blocked: [...(doc.restrictions.mcc_blocked || [])],
    mcc_fleet_exempt: [...(doc.restrictions.mcc_fleet_exempt || [])],
  });
  const [roleCaps, setRoleCaps] = useState({ ...(doc.approval_thresholds_by_role || {}) });
  const [newRole, setNewRole] = useState("");
  const [newRoleCap, setNewRoleCap] = useState("");
  const [saving, setSaving] = useState(false);

  function setNum(key: string, raw: string) {
    const v = parseFloat(raw);
    setThresholds({ ...thresholds, [key]: Number.isFinite(v) ? v : 0 });
  }

  function addMcc(field: "mcc_blocked" | "mcc_fleet_exempt", raw: string) {
    const n = parseInt(raw, 10);
    if (!Number.isInteger(n)) return;
    if (restrictions[field].includes(n)) return;
    setRestrictions({ ...restrictions, [field]: [...restrictions[field], n].sort((a, b) => a - b) });
  }

  function removeMcc(field: "mcc_blocked" | "mcc_fleet_exempt", n: number) {
    setRestrictions({ ...restrictions, [field]: restrictions[field].filter((m) => m !== n) });
  }

  function addRoleCap() {
    if (!newRole.trim() || !newRoleCap.trim()) return;
    const v = parseFloat(newRoleCap);
    if (!Number.isFinite(v)) return;
    setRoleCaps({ ...roleCaps, [newRole.trim()]: v });
    setNewRole("");
    setNewRoleCap("");
  }

  function removeRoleCap(role: string) {
    const next = { ...roleCaps };
    delete next[role];
    setRoleCaps(next);
  }

  async function save() {
    setSaving(true);
    try {
      await onSave({
        thresholds,
        restrictions,
        approval_thresholds_by_role: roleCaps,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-[12.5px] text-zinc-500 font-medium leading-relaxed">
        Hard dollar limits and tip caps the policy enforces. These are the
        gates Sift uses when deciding if a transaction needs human review.
        For rules about what employees must <em>submit</em> (receipt,
        attendees, business purpose) see the <span className="font-bold text-zinc-700">Submission Requirements</span> tab.
      </p>

      <Section title="Spending limits">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <NumberField
            label="Pre-authorization threshold"
            sub="Expenses over this need approval before being reimbursed"
            value={thresholds.pre_auth ?? 0}
            onChange={(v) => setNum("pre_auth", v)}
            prefix="$"
          />
          <NumberField
            label="Receipt required above"
            sub="A receipt must accompany any expense over this amount"
            value={thresholds.receipt_required ?? 0}
            onChange={(v) => setNum("receipt_required", v)}
            prefix="$"
          />
          <NumberField
            label="Max meal tip"
            sub="Tips above this percentage are not reimbursed"
            value={thresholds.tip_meal_max_pct ?? 0}
            onChange={(v) => setNum("tip_meal_max_pct", v)}
            suffix="%"
          />
          <NumberField
            label="Max service tip"
            sub="Service / porterage tip cap"
            value={thresholds.tip_service_max_pct ?? 0}
            onChange={(v) => setNum("tip_service_max_pct", v)}
            suffix="%"
          />
        </div>
      </Section>

      <Section title="Restricted MCC categories">
        <p className="text-[12.5px] text-zinc-500 font-medium mb-3">
          Charges with these MCC codes are never reimbursable.
        </p>
        <ChipList
          items={restrictions.mcc_blocked}
          onRemove={(n) => removeMcc("mcc_blocked", n)}
          onAdd={(n) => addMcc("mcc_blocked", n)}
          placeholder="Add MCC (e.g. 7993)"
        />
      </Section>

      <Section title="Fleet-exempt MCC categories">
        <p className="text-[12.5px] text-zinc-500 font-medium mb-3">
          Operationally necessary categories — exempt from the pre-auth threshold (fuel, tires, towing, etc.).
        </p>
        <ChipList
          items={restrictions.mcc_fleet_exempt}
          onRemove={(n) => removeMcc("mcc_fleet_exempt", n)}
          onAdd={(n) => addMcc("mcc_fleet_exempt", n)}
          placeholder="Add MCC (e.g. 5541)"
        />
      </Section>

      <Section title="Approval thresholds by role">
        <p className="text-[12.5px] text-zinc-500 font-medium mb-3">
          Amounts above the role&apos;s threshold need explicit manager approval.
        </p>
        <div className="space-y-2">
          {Object.entries(roleCaps).map(([role, cap]) => (
            <div key={role} className="flex items-center gap-3 bg-zinc-50 rounded-[10px] px-3 py-2 border border-zinc-200/60">
              <span className="flex-1 text-[13px] font-bold text-zinc-800">{role}</span>
              <input
                type="number"
                value={cap}
                onChange={(e) => setRoleCaps({ ...roleCaps, [role]: parseFloat(e.target.value) || 0 })}
                className="w-32 px-2 py-1 text-right text-[13px] font-bold tabular-nums bg-white border border-zinc-200 rounded outline-none focus:border-zinc-900"
              />
              <button onClick={() => removeRoleCap(role)} className="p-1 text-zinc-400 hover:text-rose-700">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <div className="flex items-center gap-2 mt-3">
            <input
              type="text"
              placeholder="Role (e.g. Long-Haul Driver)"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="flex-1 px-3 py-2 text-[13px] bg-white border border-zinc-200 rounded-[10px] outline-none focus:border-zinc-900"
            />
            <input
              type="number"
              placeholder="Cap"
              value={newRoleCap}
              onChange={(e) => setNewRoleCap(e.target.value)}
              className="w-28 px-3 py-2 text-[13px] bg-white border border-zinc-200 rounded-[10px] outline-none focus:border-zinc-900 tabular-nums"
            />
            <button
              onClick={addRoleCap}
              className="p-2 rounded-[10px] bg-zinc-900 text-white hover:bg-black"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </Section>

      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={saving}
          className="px-5 py-2 rounded-[10px] bg-zinc-900 hover:bg-black text-white text-[13px] font-bold shadow-sm disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save thresholds"}
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-zinc-200/70 rounded-[20px] shadow-sm p-6">
      <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.12em] mb-4">{title}</h3>
      {children}
    </div>
  );
}

function NumberField({
  label, sub, value, onChange, prefix, suffix,
}: { label: string; sub: string; value: number; onChange: (v: string) => void; prefix?: string; suffix?: string }) {
  return (
    <div>
      <label className="block text-[12.5px] font-bold text-zinc-700 mb-1">{label}</label>
      <div className="flex items-center gap-1.5 bg-white border border-zinc-200 rounded-[10px] px-3 py-2 focus-within:border-zinc-900">
        {prefix && <span className="text-zinc-400 font-medium text-[14px]">{prefix}</span>}
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 outline-none bg-transparent text-[15px] font-bold tabular-nums text-zinc-900"
        />
        {suffix && <span className="text-zinc-400 font-medium text-[14px]">{suffix}</span>}
      </div>
      <p className="text-[11px] text-zinc-500 font-medium mt-1.5">{sub}</p>
    </div>
  );
}

function ChipList({
  items, onRemove, onAdd, placeholder,
}: { items: number[]; onRemove: (n: number) => void; onAdd: (raw: string) => void; placeholder: string }) {
  const [input, setInput] = useState("");
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3">
        {items.length === 0 && (
          <span className="text-[12px] text-zinc-400 font-medium italic">None</span>
        )}
        {items.map((n) => (
          <span
            key={n}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-zinc-100 border border-zinc-200/80 rounded-full text-[12px] font-bold text-zinc-700"
          >
            MCC {n}
            <button onClick={() => onRemove(n)} className="text-zinc-400 hover:text-rose-700">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          placeholder={placeholder}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              onAdd(input);
              setInput("");
            }
          }}
          className="flex-1 px-3 py-1.5 text-[13px] bg-white border border-zinc-200 rounded-[8px] outline-none focus:border-zinc-900"
        />
        <button
          onClick={() => { onAdd(input); setInput(""); }}
          className="p-1.5 rounded-[8px] bg-zinc-900 text-white hover:bg-black"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
