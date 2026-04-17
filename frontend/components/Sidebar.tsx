"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  MessageSquare,
  ShieldAlert,
  CheckCircle,
  FileText,
  Shield,
  Receipt,
} from "lucide-react";
import { getAgentStats } from "@/lib/api";
import {
  Sidebar as BaseSidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";

const navItems = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard, badgeKey: null },
  { label: "Ask Sift", href: "/chat", icon: MessageSquare, badgeKey: null },
  { label: "Approvals", href: "/approvals", icon: CheckCircle, badgeKey: "pending_approvals" as const },
  { label: "Transactions", href: "/expenses", icon: Receipt, badgeKey: null },
  { label: "Violations", href: "/violations", icon: ShieldAlert, badgeKey: "violation_count" as const },
  { label: "Policy", href: "/policy", icon: Shield, badgeKey: null },
  { label: "Reports", href: "/reports", icon: FileText, badgeKey: "draft_reports" as const },
];

type BadgeKey = "pending_approvals" | "violation_count" | "draft_reports";

export default function Sidebar() {
  const path = usePathname();
  const [badges, setBadges] = useState<Record<BadgeKey, number>>({
    pending_approvals: 0,
    violation_count: 0,
    draft_reports: 0,
  });

  useEffect(() => {
    getAgentStats()
      .then((s) =>
        setBadges({
          pending_approvals: s.pending_approvals,
          violation_count: s.violation_count,
          draft_reports: s.draft_reports,
        })
      )
      .catch(() => {});
  }, []);

  return (
    <BaseSidebar collapsible="none">
      <SidebarHeader className="px-8 py-8">
        <div className="flex items-center gap-2">
          <Image
            src="/sift-logo.png"
            alt="Sift"
            width={40}
            height={40}
            priority
            className="w-10 h-10 object-contain -ml-1.5"
          />
          <span className="font-bold text-[18px] tracking-tight text-white">
            sift
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-4 py-2">
        <SidebarGroup>
          <SidebarMenu className="gap-1.5">
            {navItems.map(({ label, href, icon: Icon, badgeKey }) => {
              const active = href === "/" ? path === "/" : path.startsWith(href);
              const count = badgeKey ? badges[badgeKey] : 0;
              return (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton 
                    asChild 
                    isActive={active}
                    className={active ? "w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 bg-white/10 text-white font-medium" : "w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 text-zinc-400 hover:bg-white/5 hover:text-zinc-200"}
                  >
                    <Link href={href} className="flex items-center gap-3 w-full">
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      <span className="text-[14px] flex-1">{label}</span>
                      {count > 0 && (
                        <span className="bg-white/10 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                          {count > 999 ? "999+" : count}
                        </span>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-8 py-8 mt-auto">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#8b9286] flex items-center justify-center text-white text-xs font-bold">
            A
          </div>
          <div>
            <p className="text-[12px] text-white font-medium">Avery Chen</p>
            <p className="text-[11px] text-zinc-500">Finance Manager</p>
          </div>
        </div>
      </SidebarFooter>
    </BaseSidebar>
  );
}
