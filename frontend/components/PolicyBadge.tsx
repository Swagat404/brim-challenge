type PolicyStatus = "in_policy" | "review" | "violation";

const BADGE_STYLES: Record<PolicyStatus, string> = {
  in_policy: "bg-zinc-50 text-zinc-700 border-zinc-200/60",
  review: "bg-zinc-50 text-zinc-700 border-zinc-200/60",
  violation: "bg-zinc-50 text-zinc-700 border-zinc-200/60",
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
          status === "in_policy" ? "bg-[#8b9286]" : status === "review" ? "bg-zinc-500" : "bg-zinc-800"
        }`}
      />
      {BADGE_LABELS[status]}
    </span>
  );
}
