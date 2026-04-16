import Avatar2 from "@/components/ui/avatar-2";

export default function MerchantAvatar({
  merchant,
  size = "md",
}: {
  merchant: string;
  mcc?: number;
  size?: "sm" | "md" | "lg";
}) {
  const letter = (merchant || "?")[0].toUpperCase();
  
  // Map size to Avatar2 size
  const avatarSize = size === "sm" ? "small" : size === "lg" ? "large" : "medium";

  return (
    <Avatar2
      size={avatarSize}
      variant="neutral"
      title={merchant}
      className="flex-shrink-0 font-jakarta"
    >
      {letter}
    </Avatar2>
  );
}
