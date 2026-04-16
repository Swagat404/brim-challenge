export default function SeverityBadge({ severity }: { severity: string }) {
  const cls: Record<string, string> = {
    CRITICAL: "bg-zinc-900 text-white",
    HIGH: "bg-zinc-700 text-white",
    MEDIUM: "bg-zinc-500 text-white",
    LOW: "bg-[#8b9286] text-white",
  };
  return (
    <span
      className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-sm ${
        cls[severity] ?? "bg-[#8b9286] text-white"
      }`}
    >
      {severity}
    </span>
  );
}
