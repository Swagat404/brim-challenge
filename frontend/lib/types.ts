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

export interface Approval {
  id: number;
  transaction_rowid: number;
  employee_id: string;
  amount: number;
  merchant: string;
  status: "pending" | "approved" | "rejected";
  requested_at: string;
  decided_at?: string;
  approver_id?: string;
  ai_recommendation?: string;
  ai_reasoning?: string;
  transaction_date?: string;
  employee_name?: string;
  department?: string;
  role?: string;
  mcc?: number;
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
  | "done"
  | "error";

export interface AgentEvent {
  type: AgentEventType;
  text?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  output?: string;
  chart?: ChartData;
  error?: string;
}
