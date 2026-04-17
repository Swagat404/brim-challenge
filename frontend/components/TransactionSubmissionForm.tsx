"use client";

import { useEffect, useRef, useState } from "react";
import {
  Receipt, Upload, Trash2, X, Loader2, ChevronDown, FileText, Check,
} from "lucide-react";
import { uploadReceipt, deleteReceipt, patchSubmission } from "@/lib/api";
import type { TransactionDetail } from "@/lib/types";

interface TransactionSubmissionFormProps {
  detail: TransactionDetail;
  onChange: (next: TransactionDetail) => void;
}

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

type FieldKey = "memo" | "business_purpose" | "gl_code" | "attendees";

export default function TransactionSubmissionForm({
  detail,
  onChange,
}: TransactionSubmissionFormProps) {
  const txnId = detail.transaction.rowid;
  const sub = detail.submission;
  const [memo, setMemo] = useState(sub?.memo ?? "");
  const [businessPurpose, setBusinessPurpose] = useState(sub?.business_purpose ?? "");
  const [glCode, setGlCode] = useState(sub?.gl_code ?? "");
  const [attendeeInput, setAttendeeInput] = useState("");
  const [attendees, setAttendees] = useState<string[]>(sub?.attendees ?? []);
  const [savingField, setSavingField] = useState<FieldKey | null>(null);
  const [savedAt, setSavedAt] = useState<Record<FieldKey, number>>({
    memo: 0, business_purpose: 0, gl_code: 0, attendees: 0,
  });
  const [uploading, setUploading] = useState(false);
  const [showOcr, setShowOcr] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Re-sync local state ONLY when the user opens a different transaction.
  // Editing one field while another field saves must not clobber the first.
  useEffect(() => {
    setMemo(sub?.memo ?? "");
    setBusinessPurpose(sub?.business_purpose ?? "");
    setGlCode(sub?.gl_code ?? "");
    setAttendees(sub?.attendees ?? []);
    setSavedAt({ memo: 0, business_purpose: 0, gl_code: 0, attendees: 0 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txnId]);

  async function commit(field: FieldKey, patch: Parameters<typeof patchSubmission>[1]) {
    setSavingField(field);
    try {
      const next = await patchSubmission(txnId, patch);
      onChange(next);
      setSavedAt((s) => ({ ...s, [field]: Date.now() }));
    } finally {
      setSavingField(null);
    }
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    try {
      const next = await uploadReceipt(txnId, f);
      onChange(next);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function onDeleteReceipt() {
    setUploading(true);
    try {
      await deleteReceipt(txnId);
      const next = await patchSubmission(txnId, { rerun_recommendation: true });
      onChange(next);
    } finally {
      setUploading(false);
    }
  }

  function addAttendee() {
    const v = attendeeInput.trim();
    if (!v || attendees.includes(v)) return;
    const next = [...attendees, v];
    setAttendees(next);
    setAttendeeInput("");
    void commit("attendees", { attendees: next });
  }

  function removeAttendee(name: string) {
    const next = attendees.filter((a) => a !== name);
    setAttendees(next);
    void commit("attendees", { attendees: next });
  }

  // Per-field "dirty" detection: have we changed the field since the
  // last server-known value? Save button only enables when dirty.
  const memoDirty = memo !== (sub?.memo ?? "");
  const purposeDirty = businessPurpose !== (sub?.business_purpose ?? "");
  const glDirty = glCode !== (sub?.gl_code ?? "");

  return (
    <div className="bg-white border border-zinc-200/70 rounded-[20px] shadow-sm p-5 space-y-5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.12em]">
          Submission
        </span>
        <span className="text-[10.5px] text-zinc-400 font-medium">
          Save updates the submission and re-runs Sift's recommendation.
        </span>
      </div>

      {/* Receipt */}
      <div>
        <label className="block text-[11.5px] font-bold text-zinc-700 mb-2">Receipt</label>
        {sub?.receipt_url ? (
          <div className="bg-zinc-50 border border-zinc-200/80 rounded-[12px] p-3 flex items-center gap-3">
            <ReceiptThumbnail url={`${BASE}${sub.receipt_url}`} />
            <div className="flex-1 min-w-0">
              <p className="text-[12.5px] font-bold text-zinc-800 truncate">
                {sub.receipt_url.split("/").pop()}
              </p>
              {sub.receipt_ocr_text && (
                <button
                  type="button"
                  onClick={() => setShowOcr(!showOcr)}
                  className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-zinc-500 hover:text-zinc-900"
                >
                  <ChevronDown className={`w-3 h-3 transition-transform ${showOcr ? "rotate-180" : ""}`} />
                  Receipt extracted ({sub.receipt_ocr_text.length} chars)
                </button>
              )}
            </div>
            <button
              onClick={onDeleteReceipt}
              disabled={uploading}
              className="p-2 text-zinc-400 hover:text-rose-700 hover:bg-rose-50 rounded-lg disabled:opacity-50"
              aria-label="Remove receipt"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <label className="block bg-zinc-50/80 border-2 border-dashed border-zinc-200 hover:border-zinc-400 rounded-[12px] p-5 text-center cursor-pointer transition-colors">
            <Upload className="w-5 h-5 text-zinc-400 mx-auto mb-1.5" />
            <p className="text-[12px] font-bold text-zinc-700">
              {uploading ? "Uploading & OCR'ing…" : "Drop receipt or click to choose"}
            </p>
            <p className="text-[11px] text-zinc-500 font-medium mt-0.5">
              PNG, JPG, WEBP. Sift will read the text.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onUpload}
              disabled={uploading}
            />
          </label>
        )}
        {showOcr && sub?.receipt_ocr_text && (
          <pre className="mt-2 text-[11px] font-mono whitespace-pre-wrap leading-relaxed bg-zinc-50 border border-zinc-100 rounded-[10px] p-3 text-zinc-600 max-h-40 overflow-y-auto">
            {sub.receipt_ocr_text}
          </pre>
        )}
      </div>

      {/* Memo */}
      <SaveableField
        label="Memo"
        helper="Short description Sift uses for context"
        value={memo}
        onChange={setMemo}
        rows={2}
        dirty={memoDirty}
        saving={savingField === "memo"}
        savedAt={savedAt.memo}
        onSave={() => commit("memo", { memo })}
      />

      {/* Business purpose */}
      <SaveableField
        label="Business purpose"
        helper="Why this charge happened — required for entertainment + meals"
        value={businessPurpose}
        onChange={setBusinessPurpose}
        rows={2}
        dirty={purposeDirty}
        saving={savingField === "business_purpose"}
        savedAt={savedAt.business_purpose}
        onSave={() => commit("business_purpose", { business_purpose: businessPurpose })}
      />

      {/* Attendees */}
      <div>
        <label className="block text-[11.5px] font-bold text-zinc-700 mb-2">
          Attendees
          <span className="text-zinc-400 font-medium ml-1.5">required for meals over the threshold</span>
        </label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {attendees.length === 0 && (
            <span className="text-[12px] text-zinc-400 italic font-medium">No attendees added</span>
          )}
          {attendees.map((a) => (
            <span
              key={a}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-zinc-100 border border-zinc-200/80 rounded-full text-[12px] font-bold text-zinc-700"
            >
              {a}
              <button
                onClick={() => removeAttendee(a)}
                className="text-zinc-400 hover:text-rose-700"
                aria-label={`Remove ${a}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={attendeeInput}
            onChange={(e) => setAttendeeInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addAttendee(); } }}
            placeholder="Name or Name <email>"
            className="flex-1 px-3 py-2 text-[12.5px] bg-white border border-zinc-200 rounded-[8px] outline-none focus:border-zinc-900"
          />
          <button
            onClick={addAttendee}
            disabled={!attendeeInput.trim() || savingField === "attendees"}
            className="px-3 py-2 rounded-[8px] bg-zinc-900 text-white text-[12px] font-bold hover:bg-black disabled:opacity-50"
          >
            {savingField === "attendees" ? "Adding…" : "Add"}
          </button>
        </div>
      </div>

      {/* GL code */}
      <SaveableField
        label="GL code"
        helper="Captured for accounting; not used by Sift's policy decision"
        value={glCode}
        onChange={setGlCode}
        rows={1}
        placeholder="e.g. 6420.OPS"
        dirty={glDirty}
        saving={savingField === "gl_code"}
        savedAt={savedAt.gl_code}
        onSave={() => commit("gl_code", { gl_code: glCode })}
      />
    </div>
  );
}

function SaveableField({
  label, helper, value, onChange, onSave, rows = 2, placeholder,
  dirty, saving, savedAt,
}: {
  label: string; helper?: string; value: string;
  onChange: (s: string) => void; onSave: () => void;
  rows?: number; placeholder?: string;
  dirty: boolean; saving: boolean; savedAt: number;
}) {
  // Show "Saved" indicator for 2.5s after a successful save.
  const recentlySaved = savedAt > 0 && Date.now() - savedAt < 2500;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-[11.5px] font-bold text-zinc-700">
          {label}
          {helper && <span className="text-zinc-400 font-medium ml-1.5">{helper}</span>}
        </label>
        <SaveIndicator saving={saving} dirty={dirty} recentlySaved={recentlySaved} />
      </div>
      {rows > 1 ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          placeholder={placeholder}
          className="w-full px-3 py-2 text-[13px] font-medium text-zinc-800 bg-white border border-zinc-200 rounded-[8px] outline-none focus:border-zinc-900 resize-y leading-relaxed"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2 text-[13px] font-medium text-zinc-800 bg-white border border-zinc-200 rounded-[8px] outline-none focus:border-zinc-900"
        />
      )}
      {dirty && (
        <div className="mt-2 flex justify-end">
          <button
            onClick={onSave}
            disabled={saving}
            className="px-3 py-1 rounded-[8px] bg-zinc-900 text-white text-[11.5px] font-bold hover:bg-black disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      )}
    </div>
  );
}

function SaveIndicator({
  saving, dirty, recentlySaved,
}: { saving: boolean; dirty: boolean; recentlySaved: boolean }) {
  if (saving) {
    return (
      <span className="inline-flex items-center gap-1 text-[10.5px] text-zinc-400 font-medium">
        <Loader2 className="w-3 h-3 animate-spin" /> Saving
      </span>
    );
  }
  if (dirty) {
    return (
      <span className="text-[10.5px] text-amber-600 font-bold uppercase tracking-wider">
        unsaved
      </span>
    );
  }
  if (recentlySaved) {
    return (
      <span className="inline-flex items-center gap-1 text-[10.5px] text-emerald-600 font-bold">
        <Check className="w-3 h-3" /> Saved
      </span>
    );
  }
  return null;
}

function ReceiptThumbnail({ url }: { url: string }) {
  const isImage = /\.(png|jpe?g|gif|webp)$/i.test(url);
  if (!isImage) {
    return (
      <div className="w-12 h-12 rounded-lg bg-white border border-zinc-200 flex items-center justify-center flex-shrink-0">
        <FileText className="w-5 h-5 text-zinc-500" />
      </div>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="flex-shrink-0">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="Receipt"
        className="w-12 h-12 rounded-lg object-cover border border-zinc-200 bg-white"
      />
    </a>
  );
}

export { Receipt };
