"use client";

import { cn } from "@/lib/utils";

export const BackgroundGradient = ({ children, className }: { children: React.ReactNode, className?: string }) => {
  return (
    <div className={cn("min-h-screen w-full relative bg-zinc-900 overflow-hidden", className)}>
      {/* High-end nature background */}
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          backgroundImage: `url('https://images.unsplash.com/photo-1682687220063-4742bd7fd538?q=80&w=3175&auto=format&fit=crop')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          opacity: 0.4,
        }}
      />
      {/* Subtle dark overlay to keep it clean */}
      <div className="fixed inset-0 pointer-events-none z-0 bg-black/40 backdrop-blur-[4px]" />

      <div className="relative z-10 w-full h-full">
        {children}
      </div>
    </div>
  );
};
