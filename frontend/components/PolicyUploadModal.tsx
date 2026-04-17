"use client";

import { useState } from "react";
import { Upload, FileText, Loader2, X } from "lucide-react";
import { uploadPolicyPdf, confirmPolicyUpload } from "@/lib/api";
import type { PolicyDocument } from "@/lib/types";

interface PolicyUploadModalProps {
  open: boolean;
  onClose: () => void;
  onApplied: (doc: PolicyDocument) => void;
}

export default function PolicyUploadModal({ open, onClose, onApplied }: PolicyUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [proposal, setProposal] = useState<{
    proposal_id: string;
    filename: string;
    proposed: PolicyDocument;
    diff: Record<string, { before: unknown; after: unknown }>;
  } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function upload() {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const res = await uploadPolicyPdf(file);
      setProposal(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function confirm() {
    if (!proposal) return;
    setConfirming(true);
    try {
      const newDoc = await confirmPolicyUpload(proposal.proposal_id);
      onApplied(newDoc);
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Confirm failed");
    } finally {
      setConfirming(false);
    }
  }

  function reset() {
    setFile(null);
    setProposal(null);
    setError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-6">
      <div className="bg-white rounded-[24px] shadow-xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <div className="px-6 py-5 border-b border-zinc-100 flex items-center gap-3 flex-shrink-0">
          <div className="w-9 h-9 rounded-full bg-zinc-100 flex items-center justify-center">
            <Upload className="w-4 h-4 text-zinc-700" />
          </div>
          <div className="flex-1">
            <h2 className="text-[17px] font-bold tracking-tight text-zinc-900">Upload new policy PDF</h2>
            <p className="text-[12.5px] text-zinc-500 font-medium">
              Sift will extract a structured policy and show you the diff before saving.
            </p>
          </div>
          <button onClick={handleClose} className="p-1.5 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {error && (
            <div className="mb-4 px-4 py-3 bg-rose-50 border border-rose-200 text-rose-800 text-[13px] font-medium rounded-[10px]">
              {error}
            </div>
          )}

          {!proposal ? (
            <div>
              <label className="block bg-zinc-50 border-2 border-dashed border-zinc-200 hover:border-zinc-400 rounded-[16px] p-10 text-center cursor-pointer transition-colors">
                <FileText className="w-10 h-10 text-zinc-400 mx-auto mb-3" />
                <p className="text-[13px] font-bold text-zinc-700 mb-1">
                  {file ? file.name : "Drop PDF here or click to choose"}
                </p>
                <p className="text-[12px] text-zinc-500 font-medium">
                  Sift extracts thresholds, sections, and submission rules automatically.
                </p>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>

              {file && (
                <div className="mt-5 flex justify-end">
                  <button
                    onClick={upload}
                    disabled={uploading}
                    className="px-5 py-2.5 rounded-[12px] bg-zinc-900 hover:bg-black text-white text-[13px] font-bold shadow-sm flex items-center gap-2 disabled:opacity-50"
                  >
                    {uploading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    {uploading ? "Parsing…" : "Parse policy"}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div>
              <div className="mb-4 flex items-center gap-3">
                <FileText className="w-4 h-4 text-zinc-500" />
                <span className="text-[13px] font-bold text-zinc-900">{proposal.filename}</span>
                <span className="text-[12px] text-zinc-500 font-medium">→</span>
                <span className="text-[13px] font-bold text-zinc-900">{proposal.proposed.name}</span>
              </div>

              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.12em] mb-2">
                Changes ({Object.keys(proposal.diff).length})
              </p>
              {Object.keys(proposal.diff).length === 0 ? (
                <p className="text-[12.5px] text-zinc-500 italic">
                  No changes from current policy — confirm anyway to overwrite.
                </p>
              ) : (
                <div className="space-y-2">
                  {Object.entries(proposal.diff).map(([key, change]) => (
                    <div key={key} className="bg-zinc-50 border border-zinc-200/60 rounded-[10px] p-3">
                      <p className="text-[11px] font-bold text-zinc-700 uppercase tracking-wider mb-1.5">{key}</p>
                      <pre className="text-[11px] text-zinc-600 font-mono whitespace-pre-wrap leading-relaxed overflow-auto max-h-32">
{JSON.stringify(change.after, null, 2).slice(0, 800)}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {proposal && (
          <div className="px-6 py-4 border-t border-zinc-100 flex items-center justify-between flex-shrink-0">
            <button
              onClick={reset}
              className="text-[12.5px] font-bold text-zinc-500 hover:text-zinc-900"
            >
              Choose another file
            </button>
            <button
              onClick={confirm}
              disabled={confirming}
              className="px-5 py-2.5 rounded-[12px] bg-zinc-900 hover:bg-black text-white text-[13px] font-bold shadow-sm flex items-center gap-2 disabled:opacity-50"
            >
              {confirming && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {confirming ? "Replacing…" : "Replace policy"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
