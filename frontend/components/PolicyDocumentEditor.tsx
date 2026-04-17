"use client";

import { useState } from "react";
import { Plus, X, Edit3, Lock, Trash2 } from "lucide-react";
import type { PolicyDocument, PolicySection, PolicyHiddenNote } from "@/lib/types";

interface PolicyDocumentEditorProps {
  doc: PolicyDocument;
  onSave: (patch: Partial<PolicyDocument>) => Promise<void>;
}

export default function PolicyDocumentEditor({ doc, onSave }: PolicyDocumentEditorProps) {
  const [sections, setSections] = useState<PolicySection[]>(doc.sections);
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function updateSection(idx: number, patch: Partial<PolicySection>) {
    setSections((s) => s.map((sec, i) => (i === idx ? { ...sec, ...patch } : sec)));
  }

  function addHiddenNote(idx: number) {
    const note: PolicyHiddenNote = {
      id: `hn_${Date.now()}`,
      body: "",
      applies_to: {},
    };
    updateSection(idx, { hidden_notes: [...(sections[idx].hidden_notes || []), note] });
  }

  function updateHiddenNote(secIdx: number, noteIdx: number, body: string) {
    const notes = (sections[secIdx].hidden_notes || []).map((n, i) =>
      i === noteIdx ? { ...n, body } : n
    );
    updateSection(secIdx, { hidden_notes: notes });
  }

  function removeHiddenNote(secIdx: number, noteIdx: number) {
    const notes = (sections[secIdx].hidden_notes || []).filter((_, i) => i !== noteIdx);
    updateSection(secIdx, { hidden_notes: notes });
  }

  function removeSection(idx: number) {
    setSections((s) => s.filter((_, i) => i !== idx));
  }

  function addSection() {
    const sec: PolicySection = {
      id: `section_${Date.now()}`,
      title: "New Section",
      body: "",
      hidden_notes: [],
    };
    setSections([...sections, sec]);
    setEditing(sec.id);
  }

  async function save() {
    setSaving(true);
    try {
      await onSave({ sections });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      {sections.map((sec, idx) => {
        const isEditing = editing === sec.id;
        return (
          <div key={sec.id} className="bg-white border border-zinc-200/70 rounded-[20px] shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-zinc-100 flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                {isEditing ? (
                  <input
                    type="text"
                    value={sec.title}
                    onChange={(e) => updateSection(idx, { title: e.target.value })}
                    className="w-full text-[18px] font-bold tracking-tight text-zinc-900 bg-transparent border-b border-zinc-200 focus:border-zinc-900 outline-none"
                  />
                ) : (
                  <h3 className="text-[18px] font-bold tracking-tight text-zinc-900 truncate">{sec.title}</h3>
                )}
                <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-[0.12em] mt-1">
                  {sec.id}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setEditing(isEditing ? null : sec.id)}
                  className="p-2 rounded-lg text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => removeSection(idx)}
                  className="p-2 rounded-lg text-zinc-400 hover:text-rose-700 hover:bg-rose-50 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="px-6 py-5">
              {isEditing ? (
                <textarea
                  value={sec.body}
                  onChange={(e) => updateSection(idx, { body: e.target.value })}
                  rows={6}
                  className="w-full text-[14px] font-medium text-zinc-700 leading-relaxed bg-zinc-50/50 rounded-[12px] border border-zinc-200 p-4 focus:border-zinc-900 outline-none resize-y"
                />
              ) : (
                <p className="text-[14px] font-medium text-zinc-700 leading-relaxed whitespace-pre-line">
                  {sec.body || (
                    <span className="text-zinc-400 italic">No body — click edit to add policy text.</span>
                  )}
                </p>
              )}

              {/* Hidden notes */}
              <div className="mt-5 space-y-2.5">
                {(sec.hidden_notes || []).map((note, ni) => (
                  <div
                    key={note.id}
                    className="flex items-start gap-3 bg-zinc-50 border border-zinc-200/80 rounded-[12px] p-3"
                  >
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-zinc-200 text-zinc-700 mt-0.5">
                      <Lock className="w-2.5 h-2.5" /> Hidden
                    </span>
                    <textarea
                      value={note.body}
                      onChange={(e) => updateHiddenNote(idx, ni, e.target.value)}
                      placeholder="Hidden note (admin + agent only)"
                      rows={2}
                      className="flex-1 text-[12.5px] font-medium text-zinc-700 bg-transparent outline-none resize-y leading-relaxed"
                    />
                    <button
                      onClick={() => removeHiddenNote(idx, ni)}
                      className="p-1 text-zinc-400 hover:text-rose-700"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => addHiddenNote(idx)}
                  className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-500 hover:text-zinc-900 transition-colors"
                >
                  <Plus className="w-3 h-3" /> Add hidden note
                </button>
              </div>
            </div>
          </div>
        );
      })}

      <div className="flex items-center justify-between bg-white rounded-[16px] border border-zinc-200/60 shadow-sm px-5 py-3">
        <button
          onClick={addSection}
          className="flex items-center gap-1.5 text-[12.5px] font-bold text-zinc-700 hover:text-zinc-900"
        >
          <Plus className="w-3.5 h-3.5" /> Add section
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2 rounded-[10px] bg-zinc-900 hover:bg-black text-white text-[13px] font-bold shadow-sm disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save policy"}
        </button>
      </div>
    </div>
  );
}
