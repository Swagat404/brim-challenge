import type { Violation, Approval, Report, AgentEvent } from "./types";

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

export async function* streamChat(
  message: string,
  sessionId: string
): AsyncGenerator<AgentEvent> {
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, session_id: sessionId }),
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

export async function getAgentStats(): Promise<{
  total_transactions: number;
  total_spend: number;
  employee_count: number;
  in_policy_count: number;
  violation_count: number;
  pending_approvals: number;
  draft_reports: number;
  compliance_rate: number;
}> {
  const res = await fetch(`${BASE}/api/analytics/agent-stats`);
  if (!res.ok) throw new Error(`agent stats: ${res.status}`);
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
