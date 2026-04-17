"use client";

import { useEffect, useState } from "react";
import {
  FileText, Sliders, Zap, Receipt, Wallet, Users, Upload, Loader2,
} from "lucide-react";
import { getPolicyDocument, patchPolicyDocument } from "@/lib/api";
import type { PolicyDocument, PolicyProposal } from "@/lib/types";

import PolicySuggestionsPanel from "@/components/PolicySuggestionsPanel";
import PolicyDocumentEditor from "@/components/PolicyDocumentEditor";
import ThresholdsForm from "@/components/ThresholdsForm";
import AutoApprovalRulesForm from "@/components/AutoApprovalRulesForm";
import SubmissionRequirementsForm from "@/components/SubmissionRequirementsForm";
import DepartmentBudgetsTable from "@/components/DepartmentBudgetsTable";
import EmployeeBudgetsTable from "@/components/EmployeeBudgetsTable";
import PolicyUploadModal from "@/components/PolicyUploadModal";
import PolicyProposalBanner from "@/components/PolicyProposalBanner";
import PolicyFieldDiff from "@/components/PolicyFieldDiff";
import ResizableSidebar from "@/components/ResizableSidebar";
import AgentChat from "@/components/chat/AgentChat";

type TabId =
  | "document" | "thresholds" | "auto_approval"
  | "submission" | "department_budgets" | "employee_budgets" | "source";

const TABS: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
  { id: "document", label: "Document", icon: <FileText className="w-3.5 h-3.5" /> },
  { id: "thresholds", label: "Thresholds & Limits", icon: <Sliders className="w-3.5 h-3.5" /> },
  { id: "auto_approval", label: "Auto-Approval Rules", icon: <Zap className="w-3.5 h-3.5" /> },
  { id: "submission", label: "Submission Requirements", icon: <Receipt className="w-3.5 h-3.5" /> },
  { id: "department_budgets", label: "Department Budgets", icon: <Wallet className="w-3.5 h-3.5" /> },
  { id: "employee_budgets", label: "Employee Budgets", icon: <Users className="w-3.5 h-3.5" /> },
  { id: "source", label: "Source PDF", icon: <Upload className="w-3.5 h-3.5" /> },
];

// Map a top-level policy field (sections, thresholds, etc.) to the tab that
// owns it. Used to auto-jump the editor when the chat proposes an edit so
// the diff is visible without the user hunting for the right tab.
const FIELD_TO_TAB: Record<string, TabId> = {
  sections: "document",
  thresholds: "thresholds",
  restrictions: "thresholds",
  approval_thresholds_by_role: "thresholds",
  auto_approval_rules: "auto_approval",
  submission_requirements: "submission",
};

export default function PolicyPage() {
  const [doc, setDoc] = useState<PolicyDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabId>("document");
  const [chatOpen, setChatOpen] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  // The chat-proposed edit currently awaiting Accept / Reject
  const [proposal, setProposal] = useState<PolicyProposal | null>(null);
  const [applying, setApplying] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setDoc(await getPolicyDocument());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function savePatch(patch: Partial<PolicyDocument>) {
    const updated = await patchPolicyDocument(patch);
    setDoc(updated);
    setRefreshKey((k) => k + 1);
  }

  // When chat proposes an edit: auto-jump to the affected tab + show the diff
  function handleProposal(p: PolicyProposal) {
    setProposal(p);
    const firstField = p.fields?.[0];
    if (firstField && FIELD_TO_TAB[firstField]) {
      setTab(FIELD_TO_TAB[firstField]);
    }
  }

  async function acceptProposal() {
    if (!proposal) return;
    setApplying(true);
    try {
      await savePatch(proposal.edit);
      setProposal(null);
    } finally {
      setApplying(false);
    }
  }

  function rejectProposal() {
    setProposal(null);
  }

  // Per-tab diff fields — only show diffs that belong to the currently-open tab
  const tabDiffEntries = (() => {
    if (!proposal) return [];
    return Object.entries(proposal.diff).filter(
      ([field]) => FIELD_TO_TAB[field] === tab
    );
  })();

  return (
    <div className="flex h-full bg-transparent">
      {/* ───────────────── Left rail: Sift suggestions ───────────────── */}
      <aside className="w-[280px] flex-shrink-0 bg-white/70 backdrop-blur-xl border-r border-zinc-200/40 flex flex-col">
        <PolicySuggestionsPanel
          key={`sugg-${refreshKey}`}
          onChange={() => { setRefreshKey((k) => k + 1); load(); }}
        />
      </aside>

      {/* ───────────────── Centre: editor ───────────────── */}
      <main className="flex-1 overflow-hidden flex flex-col min-w-0">
        <header className="px-8 py-6 border-b border-zinc-100 bg-white/70 backdrop-blur-xl flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-[24px] font-bold tracking-tight text-zinc-900 leading-none mb-1.5">
                Policy editor
              </h1>
              <p className="text-[13px] font-medium text-zinc-500">
                {loading
                  ? "Loading…"
                  : doc
                  ? `${doc.name} · ${doc.sections.length} section${doc.sections.length === 1 ? "" : "s"}`
                  : "No policy loaded"}
              </p>
            </div>
            <button
              onClick={() => setChatOpen((o) => !o)}
              className="text-[12px] font-bold text-zinc-500 hover:text-zinc-900 transition-colors"
            >
              {chatOpen ? "Hide assistant" : "Show assistant"}
            </button>
          </div>

          <nav className="flex gap-1 mt-5 -mb-1 overflow-x-auto scrollbar-hide">
            {TABS.map((t) => {
              // Show a tiny dot on tabs that have a pending diff
              const hasPending =
                proposal !== null &&
                proposal.fields.some((f) => FIELD_TO_TAB[f] === t.id);
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-[12.5px] font-bold whitespace-nowrap transition-all ${
                    tab === t.id
                      ? "bg-zinc-900 text-white shadow-sm"
                      : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                  }`}
                >
                  {t.icon}
                  {t.label}
                  {hasPending && (
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        tab === t.id ? "bg-emerald-300" : "bg-emerald-500"
                      }`}
                      aria-label="Pending edit"
                    />
                  )}
                </button>
              );
            })}
          </nav>
        </header>

        <div className="flex-1 overflow-y-auto px-8 py-6">
          {loading || !doc ? (
            <div className="flex items-center justify-center py-24 text-zinc-400">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : (
            <div key={`${tab}-${refreshKey}`}>
              {/* Pending-edit banner */}
              {proposal && (
                <PolicyProposalBanner
                  proposal={proposal}
                  applying={applying}
                  onAccept={acceptProposal}
                  onReject={rejectProposal}
                />
              )}

              {/* Inline diffs for this tab's fields */}
              {tabDiffEntries.length > 0 && (
                <div className="space-y-3 mb-5">
                  {tabDiffEntries.map(([field, change]) => (
                    <PolicyFieldDiff
                      key={field}
                      field={field}
                      before={change.before}
                      after={change.after}
                    />
                  ))}
                </div>
              )}

              {tab === "document" && <PolicyDocumentEditor doc={doc} onSave={savePatch} />}
              {tab === "thresholds" && <ThresholdsForm doc={doc} onSave={savePatch} />}
              {tab === "auto_approval" && <AutoApprovalRulesForm doc={doc} onSave={savePatch} />}
              {tab === "submission" && <SubmissionRequirementsForm doc={doc} onSave={savePatch} />}
              {tab === "department_budgets" && <DepartmentBudgetsTable />}
              {tab === "employee_budgets" && <EmployeeBudgetsTable />}
              {tab === "source" && (
                <SourceTab onUploadClick={() => setUploadOpen(true)} />
              )}
            </div>
          )}
        </div>
      </main>

      {/* ───────────────── Right rail: AgentChat (resizable) ───────────────── */}
      {chatOpen && (
        <ResizableSidebar
          handle="left"
          defaultWidth={400}
          minWidth={320}
          maxWidth={720}
          storageKey="sift_policy_chat_width"
          className="border-l border-zinc-200/40 hidden xl:block"
        >
          <AgentChat
            persona="policy_editor"
            layout="sidebar"
            onTurnComplete={() => { setRefreshKey((k) => k + 1); load(); }}
            onPolicyProposal={handleProposal}
          />
        </ResizableSidebar>
      )}

      <PolicyUploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onApplied={(d) => { setDoc(d); setRefreshKey((k) => k + 1); }}
      />
    </div>
  );
}

function SourceTab({ onUploadClick }: { onUploadClick: () => void }) {
  return (
    <div className="bg-white border border-zinc-200/70 rounded-[20px] shadow-sm p-8 text-center">
      <div className="w-12 h-12 rounded-full bg-zinc-100 flex items-center justify-center mx-auto mb-4">
        <Upload className="w-5 h-5 text-zinc-700" />
      </div>
      <h3 className="text-[16px] font-bold tracking-tight text-zinc-900 mb-2">
        Replace the policy with a new PDF
      </h3>
      <p className="text-[13px] text-zinc-500 font-medium max-w-md mx-auto leading-relaxed mb-5">
        Sift will use Claude to extract the new policy into structured rules and show you
        a diff against the current one. Nothing is overwritten until you confirm.
      </p>
      <button
        onClick={onUploadClick}
        className="px-5 py-2.5 rounded-[12px] bg-zinc-900 hover:bg-black text-white text-[13px] font-bold shadow-sm"
      >
        Upload new policy PDF
      </button>
    </div>
  );
}
