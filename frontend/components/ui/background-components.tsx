"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NO_GRADIENT_ROUTES = ["/violations", "/policy"];

export const BackgroundGradient = ({ children, className }: { children: React.ReactNode, className?: string }) => {
  const pathname = usePathname();
  const showGradient = !NO_GRADIENT_ROUTES.some((r) => pathname.startsWith(r));

  return (
    <div className={cn("min-h-screen w-full relative bg-white overflow-x-hidden", className)}>
      {showGradient && (
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            backgroundImage: `
              radial-gradient(
                circle at top right,
                rgba(255, 140, 60, 0.5),
                transparent 70%
              )
            `,
            filter: "blur(80px)",
            backgroundRepeat: "no-repeat",
          }}
        />
      )}
      <div className="relative w-full h-full">
        {children}
      </div>
    </div>
  );
};
