const MCC_CATEGORIES: Record<number, { color: string; label: string }> = {
  5541: { color: "#16a34a", label: "Fuel" },
  5542: { color: "#16a34a", label: "Fuel" },
  5983: { color: "#16a34a", label: "Fuel" },
  7511: { color: "#0891b2", label: "Repair" },
  7538: { color: "#0891b2", label: "Repair" },
  5013: { color: "#6366f1", label: "Parts" },
  5533: { color: "#6366f1", label: "Parts" },
  5812: { color: "#ea580c", label: "Dining" },
  5813: { color: "#ea580c", label: "Dining" },
  5814: { color: "#ea580c", label: "Fast Food" },
  7011: { color: "#8b5cf6", label: "Hotel" },
  3500: { color: "#8b5cf6", label: "Hotel" },
  4121: { color: "#0284c7", label: "Transport" },
  4131: { color: "#0284c7", label: "Transport" },
  5411: { color: "#d97706", label: "Retail" },
  5912: { color: "#dc2626", label: "Pharmacy" },
  5921: { color: "#dc2626", label: "Alcohol" },
};

function getCategoryInfo(mcc?: number, merchant?: string) {
  if (mcc && MCC_CATEGORIES[mcc]) return MCC_CATEGORIES[mcc];
  const m = (merchant ?? "").toLowerCase();
  if (m.includes("fuel") || m.includes("petro") || m.includes("shell") || m.includes("esso"))
    return { color: "#16a34a", label: "Fuel" };
  if (m.includes("hotel") || m.includes("inn") || m.includes("suites"))
    return { color: "#8b5cf6", label: "Hotel" };
  if (m.includes("restaurant") || m.includes("grill") || m.includes("diner"))
    return { color: "#ea580c", label: "Dining" };
  return { color: "#64748b", label: "Other" };
}

export default function MerchantAvatar({
  merchant,
  mcc,
  size = "md",
}: {
  merchant: string;
  mcc?: number;
  size?: "sm" | "md" | "lg";
}) {
  const { color } = getCategoryInfo(mcc, merchant);
  const letter = (merchant || "?")[0].toUpperCase();
  const dims = size === "sm" ? "w-7 h-7 text-xs" : size === "lg" ? "w-11 h-11 text-base" : "w-9 h-9 text-sm";

  return (
    <div
      className={`${dims} rounded-full flex items-center justify-center font-semibold text-white flex-shrink-0`}
      style={{ backgroundColor: color }}
      title={merchant}
    >
      {letter}
    </div>
  );
}
