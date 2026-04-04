"use client";

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
  Zap,
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
  SidebarMenuBadge,
} from "@/components/ui/sidebar";

const navItems = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard, badgeKey: null },
  { label: "Ask AI", href: "/chat", icon: MessageSquare, badgeKey: null },
  { label: "Approvals", href: "/approvals", icon: CheckCircle, badgeKey: "pending_approvals" as const },
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
      <SidebarHeader className="px-5 py-5 border-b border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-green-500 rounded-lg flex items-center justify-center">
            <Zap className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-semibold text-[15px] tracking-tight">
            Brim Expenses
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {navItems.map(({ label, href, icon: Icon, badgeKey }) => {
              const active = href === "/" ? path === "/" : path.startsWith(href);
              const count = badgeKey ? badges[badgeKey] : 0;
              return (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton asChild isActive={active}>
                    <Link href={href}>
                      <Icon />
                      <span>{label}</span>
                    </Link>
                  </SidebarMenuButton>
                  {count > 0 && (
                    <SidebarMenuBadge
                      className={
                        badgeKey === "violation_count"
                          ? "bg-red-500 text-white"
                          : badgeKey === "pending_approvals"
                          ? "bg-amber-500 text-white"
                          : "bg-sidebar-accent text-sidebar-accent-foreground"
                      }
                    >
                      {count > 999 ? "999+" : count}
                    </SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-5 py-4 border-t border-sidebar-border">
        <p className="text-[11px] text-muted-foreground leading-relaxed">Fleet Operations</p>
        <p className="text-[11px] text-muted-foreground">Brim Financial &copy; 2025</p>
      </SidebarFooter>
    </BaseSidebar>
  );
}
