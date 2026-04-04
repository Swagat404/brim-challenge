type PolicyStatus = "in_policy" | "review" | "violation";

const BADGE_STYLES: Record<PolicyStatus, string> = {
  in_policy: "bg-green-50 text-green-700 border-green-200",
  review: "bg-yellow-50 text-yellow-700 border-yellow-200",
  violation: "bg-red-50 text-red-700 border-red-200",
};

const BADGE_LABELS: Record<PolicyStatus, string> = {
  in_policy: "In policy",
  review: "Review needed",
  violation: "Violation",
};

export function inferPolicyStatus(opts: {
  recommendation?: string;
  violationType?: string;
  policyFlags?: string[];
}): PolicyStatus {
  if (opts.violationType || (opts.policyFlags && opts.policyFlags.length > 0)) return "violation";
  const r = (opts.recommendation ?? "").toLowerCase();
  if (r.includes("reject") || r.includes("deny")) return "violation";
  if (r.includes("review") || r.includes("flag")) return "review";
  return "in_policy";
}

export default function PolicyBadge({ status }: { status: PolicyStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${BADGE_STYLES[status]}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          status === "in_policy" ? "bg-green-500" : status === "review" ? "bg-yellow-500" : "bg-red-500"
        }`}
      />
      {BADGE_LABELS[status]}
    </span>
  );
}
