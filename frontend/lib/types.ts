export interface Violation {
  id?: number;
  employee_id: string;
  employee_name?: string;
  department?: string;
  violation_type: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  description: string;
  amount: number;
  detected_at: string;
}

export type AiDecision = "approve" | "review" | "reject";

export interface AgentStats {
  total_transactions: number;
  total_spend: number;
  spend_90_days: number;
  employee_count: number;
  in_policy_count: number;
  violation_count: number;
  pending_approvals: number;
  draft_reports: number;
  compliance_rate: number;
  data_window: { start: string; end: string };
}

export interface Approval {
  id: number;
  transaction_rowid: number;
  employee_id: string;
  amount: number;
  merchant: string;
  status: "pending" | "approved" | "rejected";
  requested_at: string;
  decided_at?: string;
  resolved_at?: string;
  approver_id?: string;
  ai_decision?: AiDecision;
  ai_reasoning?: string;
  policy_citation?: string;
  cited_section_id?: string;
  transaction_date?: string;
  employee_name?: string;
  department?: string;
  role?: string;
  mcc?: number;
}

// ── Activity ─────────────────────────────────────────────────────────────────

export type ActivityAction =
  | "recommended"
  | "auto_approved"
  | "flagged"
  | "human_decision"
  | "policy_edit"
  | "suggestion_applied"
  | "policy_uploaded"
  | "budget_edited"
  | "receipt_uploaded"
  | "submission_updated";

export interface ActivityEvent {
  id: number;
  occurred_at: string;
  actor: string;
  action: ActivityAction;
  transaction_rowid?: number | null;
  approval_id?: number | null;
  message: string;
  metadata?: Record<string, unknown> | null;
}

export interface ActivityRollup {
  count: number;
  total_amount: number;
  last_at: string | null;
  window_days: number;
}

// ── Policy Document ──────────────────────────────────────────────────────────

export interface PolicyHiddenNote {
  id: string;
  body: string;
  applies_to?: Record<string, string>;
}

export interface PolicySection {
  id: string;
  title: string;
  body: string;
  hidden_notes?: PolicyHiddenNote[];
}

export interface AutoApprovalRule {
  id: string;
  max_amount?: number | null;
  mcc_in?: number[] | null;
  mcc_not_in?: number[] | null;
  role_in?: string[] | null;
  rationale?: string;
}

export interface SubmissionRequirementRule {
  id: string;
  applies_when: { amount_over?: number; amount_under?: number; mcc_in?: number[] };
  require: string[];
  rationale?: string;
}

export interface PolicyDocument {
  name: string;
  effective_date?: string;
  thresholds: Record<string, number>;
  restrictions: { mcc_blocked?: number[]; mcc_fleet_exempt?: number[] };
  approval_thresholds_by_role?: Record<string, number>;
  auto_approval_rules: { enabled: boolean; rules: AutoApprovalRule[] };
  submission_requirements: SubmissionRequirementRule[];
  sections: PolicySection[];
}

// ── Policy Suggestions ───────────────────────────────────────────────────────

export type SuggestionCategory =
  | "needs_detail"
  | "conflicting"
  | "unintended_manual"
  | "missing_coverage";

export interface PolicySuggestion {
  id: number;
  category: SuggestionCategory;
  title: string;
  body: string;
  suggested_edit?: Record<string, unknown> | null;
  status: "open" | "applied" | "dismissed";
  created_at: string;
}

// ── Budgets ──────────────────────────────────────────────────────────────────

export interface DepartmentBudget {
  department: string;
  monthly_cap: number;
  mtd_spend: number;
  pct_used: number | null;
  has_cap: boolean;
  active_employees: number;
  updated_at?: string | null;
  updated_by?: string | null;
}

export interface EmployeeBudget {
  id: string;
  name: string;
  department: string;
  role: string;
  monthly_budget: number;
}

// ── Transaction submissions ──────────────────────────────────────────────────

export interface TransactionSubmission {
  transaction_rowid: number;
  receipt_url?: string | null;
  receipt_ocr_text?: string | null;
  memo?: string | null;
  business_purpose?: string | null;
  attendees?: string[];
  attendees_json?: string | null;
  gl_code?: string | null;
  submitted_at?: string;
  submitted_by?: string;
}

export interface MissingRequirement {
  requirement_id: string;
  missing: string[];
  rationale: string;
}

export interface TransactionDetail {
  transaction: Record<string, unknown> & { rowid: number };
  submission: TransactionSubmission | null;
  approval: Approval | null;
  missing_required_fields: MissingRequirement[];
}

export interface Report {
  id: number;
  employee_id: string;
  employee_name?: string;
  period_start?: string;
  period_end?: string;
  total_amount: number;
  status: "draft" | "submitted" | "approved" | "rejected";
  summary?: string;
  created_at: string;
}

export interface ChartData {
  type: "bar" | "line" | "pie" | "table";
  data: Array<{ name: string; value: number }>;
  xKey: string;
  yKey: string;
  yLabel: string;
  title: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  chart?: ChartData;
  isStreaming?: boolean;
  toolProgress?: string[];
}

// SSE event types from backend (lowercase, matching EventType enum)
export type AgentEventType =
  | "text_delta"
  | "tool_start"
  | "tool_result"
  | "chart"
  | "policy_proposal"
  | "done"
  | "error";

export interface PolicyProposal {
  fields: string[];
  edit: Partial<PolicyDocument>;
  diff: Record<string, { before: unknown; after: unknown }>;
  rationale?: string;
}

export interface AgentEvent {
  type: AgentEventType;
  text?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  output?: string;
  chart?: ChartData;
  proposal?: PolicyProposal;
  error?: string;
}
