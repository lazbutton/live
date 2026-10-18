"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronsUpDown, ExternalLink, LogOut } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/lib/supabase/client";
import { AdminLogoMark, AdminWordmark } from "./admin-brand";
import { ADMIN_NAV_GROUPS, formatNavCount, isAdminNavItemActive } from "./admin-nav";
import type { AdminNavCounts } from "./admin-shell";

function useCurrentUserEmail() {
  const [email, setEmail] = React.useState<string | null>(null);

  React.useEffect(() => {
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (mounted) setEmail(data.session?.user?.email ?? null);
    });
    return () => {
      mounted = false;
    };
  }, []);

  return email;
}

function initialsFromEmail(email: string | null) {
  if (!email) return "A";
  const name = email.split("@")[0] ?? "";
  const parts = name.split(/[._-]+/).filter(Boolean);
  const letters = (parts.length > 1 ? parts.slice(0, 2).map((part) => part[0]) : [name[0]])
    .join("")
    .toUpperCase();
  return letters || "A";
}

export function AdminSidebar({ counts }: { counts: AdminNavCounts }) {
  const router = useRouter();
  const pathname = usePathname();
  const email = useCurrentUserEmail();
  const { isMobile, setOpenMobile } = useSidebar();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/admin/login");
  }

  function closeMobileSidebar() {
    if (isMobile) setOpenMobile(false);
  }

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild className="hover:bg-transparent active:bg-transparent">
              <Link href="/admin/dashboard" onClick={closeMobileSidebar}>
                <AdminLogoMark className="size-8" />
                <AdminWordmark />
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {ADMIN_NAV_GROUPS.map((group, groupIndex) => (
          <SidebarGroup key={group.label ?? `group-${groupIndex}`}>
            {group.label ? <SidebarGroupLabel>{group.label}</SidebarGroupLabel> : null}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const count = item.countKey ? formatNavCount(counts[item.countKey]) : null;
                  return (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton
                        asChild
                        isActive={isAdminNavItemActive(pathname, item.url)}
                        tooltip={count ? `${item.title} · ${count}` : item.title}
                      >
                        <Link href={item.url} onClick={closeMobileSidebar}>
                          <item.icon />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                      {count ? (
                        <SidebarMenuBadge aria-label={`${count} en attente`}>{count}</SidebarMenuBadge>
                      ) : null}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <Avatar className="size-8 rounded-md border border-sidebar-border">
                    <AvatarFallback className="rounded-md bg-background text-[11px] font-semibold text-foreground">
                      {initialsFromEmail(email)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="grid min-w-0 flex-1 text-left leading-tight">
                    <span className="truncate text-sm font-medium text-foreground">Administrateur</span>
                    <span className="truncate text-xs text-muted-foreground">{email ?? "Session admin"}</span>
                  </span>
                  <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
                side={isMobile ? "bottom" : "right"}
                align="end"
                sideOffset={8}
              >
                <DropdownMenuLabel className="font-normal">
                  <span className="block text-xs text-muted-foreground">Connecté en tant que</span>
                  <span className="block truncate text-sm font-medium text-foreground">
                    {email ?? "Administrateur"}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <a href="/" target="_blank" rel="noreferrer">
                    <ExternalLink />
                    Voir le site public
                  </a>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void handleLogout()}>
                  <LogOut />
                  Déconnexion
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
