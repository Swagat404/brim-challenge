"use client";

import { useEffect, useRef, useState } from "react";
import {
  Receipt, Upload, Trash2, X, Loader2, ChevronDown, FileText,
} from "lucide-react";
import { uploadReceipt, deleteReceipt, patchSubmission } from "@/lib/api";
import type { TransactionDetail } from "@/lib/types";

interface TransactionSubmissionFormProps {
  detail: TransactionDetail;
  onChange: (next: TransactionDetail) => void;
}

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

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
  const [savingField, setSavingField] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showOcr, setShowOcr] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Re-sync local state ONLY when the user opens a different transaction.
  // Re-syncing on every sub.* change would clobber a field the user is still
  // typing in while another field's PATCH is in flight.
  useEffect(() => {
    setMemo(sub?.memo ?? "");
    setBusinessPurpose(sub?.business_purpose ?? "");
    setGlCode(sub?.gl_code ?? "");
    setAttendees(sub?.attendees ?? []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txnId]);

  async function commit(field: string, patch: Parameters<typeof patchSubmission>[1]) {
    setSavingField(field);
    try {
      const next = await patchSubmission(txnId, patch);
      onChange(next);
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
      // PATCH a no-op so the backend re-runs the recommendation with the
      // (now-missing) receipt, and returns the fresh detail.
      const next = await patchSubmission(txnId, { rerun_recommendation: true });
      onChange(next);
    } finally {
      setUploading(false);
    }
  }

  function addAttendee() {
    const v = attendeeInput.trim();
    if (!v) return;
    if (attendees.includes(v)) return;
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

  return (
    <div className="bg-white border border-zinc-200/70 rounded-[20px] shadow-sm p-5 space-y-5">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.12em]">
          Submission
        </span>
        {savingField && (
          <span className="text-[10px] font-bold text-zinc-400">
            <Loader2 className="w-3 h-3 inline animate-spin mr-1" />
            saving
          </span>
        )}
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
      <Field
        label="Memo"
        helper="Short description Sift uses for context"
        value={memo}
        onChange={setMemo}
        onBlur={() => commit("memo", { memo })}
        rows={2}
      />

      {/* Business purpose */}
      <Field
        label="Business purpose"
        helper="Why this charge happened — required for entertainment + meals"
        value={businessPurpose}
        onChange={setBusinessPurpose}
        onBlur={() => commit("business_purpose", { business_purpose: businessPurpose })}
        rows={2}
      />

      {/* Attendees */}
      <div>
        <label className="block text-[11.5px] font-bold text-zinc-700 mb-2">
          Attendees
          <span className="text-zinc-400 font-medium ml-1.5">(required for meals over the threshold)</span>
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
              <button onClick={() => removeAttendee(a)} className="text-zinc-400 hover:text-rose-700">
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
            className="px-3 py-2 rounded-[8px] bg-zinc-900 text-white text-[12px] font-bold hover:bg-black"
          >
            Add
          </button>
        </div>
      </div>

      {/* GL code (captured but NOT used by AI) */}
      <div>
        <label className="block text-[11.5px] font-bold text-zinc-700 mb-1.5">
          GL code
          <span className="text-zinc-400 font-medium ml-1.5">(captured for accounting, not used by Sift's policy decision)</span>
        </label>
        <input
          type="text"
          value={glCode}
          onChange={(e) => setGlCode(e.target.value)}
          onBlur={() => commit("gl_code", { gl_code: glCode })}
          placeholder="e.g. 6420.OPS"
          className="w-full px-3 py-2 text-[13px] tabular-nums bg-white border border-zinc-200 rounded-[8px] outline-none focus:border-zinc-900"
        />
      </div>
    </div>
  );
}

function Field({
  label, helper, value, onChange, onBlur, rows = 2,
}: {
  label: string; helper?: string; value: string;
  onChange: (s: string) => void; onBlur: () => void; rows?: number;
}) {
  return (
    <div>
      <label className="block text-[11.5px] font-bold text-zinc-700 mb-1.5">
        {label}
        {helper && <span className="text-zinc-400 font-medium ml-1.5">{helper}</span>}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        rows={rows}
        className="w-full px-3 py-2 text-[13px] font-medium text-zinc-700 bg-white border border-zinc-200 rounded-[8px] outline-none focus:border-zinc-900 resize-y leading-relaxed"
      />
    </div>
  );
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

// Re-export the icon barrel for the parent
export { Receipt };
