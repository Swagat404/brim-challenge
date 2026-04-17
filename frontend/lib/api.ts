import type {
  Violation,
  Approval,
  Report,
  AgentEvent,
  ActivityEvent,
  ActivityRollup,
  AgentStats,
  PolicyDocument,
  PolicySuggestion,
  DepartmentBudget,
  EmployeeBudget,
  TransactionDetail,
} from "./types";

// Empty string = same origin (Next.js rewrite proxies /api/* to FastAPI).
// Set NEXT_PUBLIC_API_URL to override (e.g. for standalone frontend deployment).
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

// ── Violations ────────────────────────────────────────────────────────────────

export async function getViolations(params?: {
  severity?: string;
  employee_id?: string;
  limit?: number;
}): Promise<Violation[]> {
  const qs = new URLSearchParams();
  if (params?.severity) qs.set("severity", params.severity);
  if (params?.employee_id) qs.set("employee_id", params.employee_id);
  if (params?.limit) qs.set("limit", String(params.limit));
  const res = await fetch(`${BASE}/api/violations?${qs}`);
  if (!res.ok) throw new Error(`violations: ${res.status}`);
  const data = await res.json();
  return data.violations ?? data ?? [];
}

export async function getPolicySummary(): Promise<{
  by_severity: Array<{ severity: string; count: number; total_amount: number }>;
  top_offenders: Array<{ employee_name: string; violation_count: number; total_flagged: number }>;
}> {
  const res = await fetch(`${BASE}/api/policy/summary`);
  if (!res.ok) throw new Error(`policy summary: ${res.status}`);
  return res.json();
}

// ── Approvals ─────────────────────────────────────────────────────────────────

export async function getApprovals(params?: {
  status?: string;
  employee_id?: string;
  limit?: number;
}): Promise<Approval[]> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.employee_id) qs.set("employee_id", params.employee_id);
  if (params?.limit) qs.set("limit", String(params.limit));
  const res = await fetch(`${BASE}/api/approvals?${qs}`);
  if (!res.ok) throw new Error(`approvals: ${res.status}`);
  const data = await res.json();
  return data.approvals ?? data ?? [];
}

export async function getApproval(id: number): Promise<{ approval: Approval; transaction: Record<string, unknown> }> {
  const res = await fetch(`${BASE}/api/approvals/${id}`);
  if (!res.ok) throw new Error(`approval ${id}: ${res.status}`);
  return res.json();
}

export async function decideApproval(
  id: number,
  decision: "approved" | "rejected",
  approver_id = "manager01",
  notes?: string
): Promise<void> {
  const res = await fetch(`${BASE}/api/approvals/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision, approver_id, notes }),
  });
  if (!res.ok) throw new Error(`decide approval: ${res.status}`);
}

// ── Reports ───────────────────────────────────────────────────────────────────

export async function getReports(params?: {
  employee_id?: string;
  status?: string;
}): Promise<Report[]> {
  const qs = new URLSearchParams();
  if (params?.employee_id) qs.set("employee_id", params.employee_id);
  if (params?.status) qs.set("status", params.status);
  const res = await fetch(`${BASE}/api/reports?${qs}`);
  if (!res.ok) throw new Error(`reports: ${res.status}`);
  const data = await res.json();
  return data.reports ?? data ?? [];
}

export async function getReport(id: number): Promise<{ report: Report; transactions: unknown[] }> {
  const res = await fetch(`${BASE}/api/reports/${id}`);
  if (!res.ok) throw new Error(`report ${id}: ${res.status}`);
  return res.json();
}

export async function updateReportStatus(id: number, status: string): Promise<void> {
  const res = await fetch(`${BASE}/api/reports/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(`update report status: ${res.status}`);
}

// ── Chat (SSE streaming) ──────────────────────────────────────────────────────

export type ChatPersona = "analytics" | "policy_editor";

export async function* streamChat(
  message: string,
  sessionId: string,
  persona: ChatPersona = "analytics"
): AsyncGenerator<AgentEvent> {
  const res = await fetch(`${BASE}/api/chat?persona=${persona}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, session_id: sessionId, persona }),
  });

  if (!res.ok) {
    yield { type: "error", error: `HTTP ${res.status}` };
    return;
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const raw = line.slice(6).trim();
        if (!raw || raw === "[DONE]") continue;
        try {
          yield JSON.parse(raw) as AgentEvent;
        } catch {
          // skip malformed line
        }
      }
    }
  }
}

// ── Policy Scan ──────────────────────────────────────────────────────────────

export async function triggerPolicyScan(): Promise<{
  summary: string;
  violation_count: number;
  error: string | null;
}> {
  const res = await fetch(`${BASE}/api/policy/scan`, { method: "POST" });
  if (!res.ok) throw new Error(`policy scan: ${res.status}`);
  return res.json();
}

// ── Policy Rules ─────────────────────────────────────────────────────────────

export async function getPolicyRules(): Promise<{
  pre_auth_threshold: number;
  receipt_required_above: number;
  tip_service_max_pct: number;
  tip_meal_max_pct: number;
  alcohol_customer_only: boolean;
  personal_card_fees_reimbursed: boolean;
  mcc_restricted: number[];
  approval_thresholds: Record<string, number>;
  source: string;
  fleet_mcc_codes: number[];
  mcc_descriptions: Record<string, string>;
  policy_sections: Record<string, string>;
}> {
  const res = await fetch(`${BASE}/api/policy/rules`);
  if (!res.ok) throw new Error(`policy rules: ${res.status}`);
  return res.json();
}

// ── Department Analytics ─────────────────────────────────────────────────────

export async function getDepartmentSpend(): Promise<
  Array<{ department: string; total_spend: number; txn_count: number }>
> {
  const res = await fetch(`${BASE}/api/analytics/department-spend`);
  if (!res.ok) throw new Error(`dept spend: ${res.status}`);
  const data = await res.json();
  return data.departments ?? [];
}

// ── Agent Stats ──────────────────────────────────────────────────────────────

export async function getAgentStats(): Promise<AgentStats> {
  const res = await fetch(`${BASE}/api/analytics/agent-stats`);
  if (!res.ok) throw new Error(`agent stats: ${res.status}`);
  return res.json();
}

// ── Activity ─────────────────────────────────────────────────────────────────

export async function getActivity(params?: {
  transaction_rowid?: number;
  limit?: number;
}): Promise<ActivityEvent[]> {
  const qs = new URLSearchParams();
  if (params?.transaction_rowid) qs.set("transaction_rowid", String(params.transaction_rowid));
  if (params?.limit) qs.set("limit", String(params.limit));
  const res = await fetch(`${BASE}/api/activity?${qs}`);
  if (!res.ok) throw new Error(`activity: ${res.status}`);
  const data = await res.json();
  return data.events ?? [];
}

export async function getActivityRollup(window_days = 90): Promise<ActivityRollup> {
  const res = await fetch(`${BASE}/api/activity/rollup?window_days=${window_days}`);
  if (!res.ok) throw new Error(`activity rollup: ${res.status}`);
  return res.json();
}

// ── Policy Document ──────────────────────────────────────────────────────────

export async function getPolicyDocument(): Promise<PolicyDocument> {
  const res = await fetch(`${BASE}/api/policy/document`);
  if (!res.ok) throw new Error(`policy document: ${res.status}`);
  const data = await res.json();
  return data.document;
}

export async function patchPolicyDocument(patch: Partial<PolicyDocument>): Promise<PolicyDocument> {
  const res = await fetch(`${BASE}/api/policy/document`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`patch policy document: ${res.status}`);
  const data = await res.json();
  return data.document;
}

export async function uploadPolicyPdf(file: File): Promise<{
  proposal_id: string;
  filename: string;
  proposed: PolicyDocument;
  diff: Record<string, { before: unknown; after: unknown }>;
}> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${BASE}/api/policy/document/upload`, {
    method: "POST",
    body: fd,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`upload policy: ${res.status} ${text}`);
  }
  return res.json();
}

export async function confirmPolicyUpload(proposal_id: string): Promise<PolicyDocument> {
  const res = await fetch(`${BASE}/api/policy/document/upload/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ proposal_id }),
  });
  if (!res.ok) throw new Error(`confirm upload: ${res.status}`);
  const data = await res.json();
  return data.document;
}

// ── Policy Suggestions ───────────────────────────────────────────────────────

export async function getPolicySuggestions(includeResolved = false): Promise<PolicySuggestion[]> {
  const res = await fetch(`${BASE}/api/policy/suggestions?include_resolved=${includeResolved ? 1 : 0}`);
  if (!res.ok) throw new Error(`suggestions: ${res.status}`);
  const data = await res.json();
  return data.suggestions ?? [];
}

export async function generatePolicySuggestions(focus?: string): Promise<PolicySuggestion[]> {
  const qs = focus ? `?focus=${encodeURIComponent(focus)}` : "";
  const res = await fetch(`${BASE}/api/policy/suggestions/generate${qs}`, { method: "POST" });
  if (!res.ok) throw new Error(`generate suggestions: ${res.status}`);
  const data = await res.json();
  return data.suggestions ?? [];
}

export async function resolveSuggestion(id: number, action: "apply" | "dismiss"): Promise<void> {
  const res = await fetch(`${BASE}/api/policy/suggestions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
  if (!res.ok) throw new Error(`resolve suggestion: ${res.status}`);
}

// ── Budgets ──────────────────────────────────────────────────────────────────

export async function getDepartmentBudgets(): Promise<DepartmentBudget[]> {
  const res = await fetch(`${BASE}/api/budgets/departments`);
  if (!res.ok) throw new Error(`dept budgets: ${res.status}`);
  const data = await res.json();
  return data.departments ?? [];
}

export async function setDepartmentBudget(department: string, monthly_cap: number): Promise<void> {
  const res = await fetch(`${BASE}/api/budgets/departments/${encodeURIComponent(department)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ monthly_cap }),
  });
  if (!res.ok) throw new Error(`set dept budget: ${res.status}`);
}

export async function removeDepartmentBudget(department: string): Promise<void> {
  const res = await fetch(`${BASE}/api/budgets/departments/${encodeURIComponent(department)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`remove dept budget: ${res.status}`);
}

export async function getEmployeeBudgets(department?: string): Promise<EmployeeBudget[]> {
  const qs = department ? `?department=${encodeURIComponent(department)}` : "";
  const res = await fetch(`${BASE}/api/budgets/employees${qs}`);
  if (!res.ok) throw new Error(`employee budgets: ${res.status}`);
  const data = await res.json();
  return data.employees ?? [];
}

export async function setEmployeeBudget(employee_id: string, monthly_budget: number): Promise<void> {
  const res = await fetch(`${BASE}/api/budgets/employees/${encodeURIComponent(employee_id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ monthly_budget }),
  });
  if (!res.ok) throw new Error(`set emp budget: ${res.status}`);
}

// ── Transaction submissions ──────────────────────────────────────────────────

export async function getTransactionDetail(rowid: number): Promise<TransactionDetail> {
  const res = await fetch(`${BASE}/api/transactions/${rowid}`);
  if (!res.ok) throw new Error(`txn ${rowid}: ${res.status}`);
  return res.json();
}

export async function uploadReceipt(rowid: number, file: File): Promise<TransactionDetail> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${BASE}/api/transactions/${rowid}/receipt`, {
    method: "POST",
    body: fd,
  });
  if (!res.ok) throw new Error(`upload receipt: ${res.status}`);
  return res.json();
}

export async function deleteReceipt(rowid: number): Promise<void> {
  const res = await fetch(`${BASE}/api/transactions/${rowid}/receipt`, { method: "DELETE" });
  if (!res.ok) throw new Error(`delete receipt: ${res.status}`);
}

export async function patchSubmission(
  rowid: number,
  patch: {
    memo?: string;
    business_purpose?: string;
    attendees?: string[];
    gl_code?: string;
    rerun_recommendation?: boolean;
  }
): Promise<TransactionDetail> {
  const res = await fetch(`${BASE}/api/transactions/${rowid}/submission`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`patch submission: ${res.status}`);
  return res.json();
}

// ── Health ────────────────────────────────────────────────────────────────────

export async function getHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/health`, { cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}
