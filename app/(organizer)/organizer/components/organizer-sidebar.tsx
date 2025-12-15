"use client";

import * as React from "react";
import Link from "next/link";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { Calendar, LayoutDashboard, User, LogOut, Users, Bell, Code } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useEffect, useState } from "react";
import { getUserOrganizers, OrganizerInfo } from "@/lib/auth";
import { getActiveOrganizer } from "@/lib/auth-helpers";

const menuItems = [
  {
    title: "Dashboard",
    icon: LayoutDashboard,
    url: "/organizer/dashboard",
  },
  {
    title: "Mes événements",
    icon: Calendar,
    url: "/organizer/events",
  },
  {
    title: "Mon profil",
    icon: User,
    url: "/organizer/profile",
  },
];

// Note: L'item "Gérer l'équipe" est ajouté dynamiquement dans le composant
// car il nécessite de vérifier si l'utilisateur est propriétaire

export function OrganizerSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const menuItemsRefs = React.useRef<(HTMLAnchorElement | null)[]>([]);
  const [organizers, setOrganizers] = useState<OrganizerInfo[]>([]);
  const [activeOrganizer, setActiveOrganizer] = useState<OrganizerInfo | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [canManageScraping, setCanManageScraping] = useState(false);
  const [loadingOrganizers, setLoadingOrganizers] = useState(true);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);

  useEffect(() => {
    async function loadOrganizers() {
      try {
        const orgs = await getUserOrganizers();
        setOrganizers(orgs);
        
        // Vérifier si l'utilisateur est propriétaire d'au moins un organisateur
        const hasOwnerRole = orgs.some(org => org.role === "owner");
        setIsOwner(hasOwnerRole);
        
        // Vérifier si l'utilisateur peut gérer le scraping (owner ou editor)
        const canManage = orgs.some(org => org.role === "owner" || org.role === "editor");
        setCanManageScraping(canManage);
        
        if (orgs.length > 0) {
          const active = await getActiveOrganizer();
          setActiveOrganizer(active);
        }
      } catch (error) {
        console.error("Erreur lors du chargement des organisateurs:", error);
      } finally {
        setLoadingOrganizers(false);
      }
    }
    loadOrganizers();
    loadNotificationsCount();
  }, []);

  // Recharger le nombre de notifications quand on change de page
  useEffect(() => {
    loadNotificationsCount();
  }, [pathname]);

  // Recharger le nombre de notifications toutes les 30 secondes
  useEffect(() => {
    const interval = setInterval(() => {
      loadNotificationsCount();
    }, 30000); // 30 secondes

    return () => clearInterval(interval);
  }, []);

  async function loadNotificationsCount() {
    try {
      const response = await fetch("/api/organizer/notifications?unreadOnly=true");
      if (response.ok) {
        const { notifications } = await response.json();
        setUnreadNotificationsCount(notifications?.length || 0);
      }
    } catch (error) {
      console.error("Erreur lors du chargement des notifications:", error);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/admin/login");
  }

  // Navigation au clavier avec les flèches haut/bas
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement;
      const isInputFocused = activeElement?.tagName === 'INPUT' || 
                             activeElement?.tagName === 'TEXTAREA' || 
                             activeElement?.getAttribute('contenteditable') === 'true';
      
      if (isInputFocused) return;

      const currentIndex = menuItemsRefs.current.findIndex(
        (ref) => ref === activeElement || ref?.contains(activeElement as Node)
      );

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIndex = currentIndex < menuItemsRefs.current.length - 1 
          ? currentIndex + 1 
          : 0;
        const nextItem = menuItemsRefs.current[nextIndex];
        if (nextItem) {
          nextItem.focus();
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIndex = currentIndex > 0 
          ? currentIndex - 1 
          : menuItemsRefs.current.length - 1;
        const prevItem = menuItemsRefs.current[prevIndex];
        if (prevItem) {
          prevItem.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const organizerName = activeOrganizer?.organizer?.name || "Organisateur";
  const organizerInitials = organizerName
    .split(" ")
    .slice(0, 2)
    .map(n => n[0])
    .join("")
    .toUpperCase();

  return (
    <Sidebar collapsible="icon" variant="floating" className="h-screen">
      <SidebarRail />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item, index) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.url || (item.url !== "/organizer/dashboard" && pathname?.startsWith(item.url))}
                  >
                    <Link 
                      href={item.url} 
                      className="cursor-pointer focus:outline-none"
                      ref={(el) => {
                        menuItemsRefs.current[index] = el;
                      }}
                      tabIndex={0}
                    >
                      <item.icon className="size-4" />
                      <span className="flex-1">{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              {/* Afficher le bouton si l'utilisateur est propriétaire (même pendant le chargement initial pour éviter le flash) */}
              {(isOwner || loadingOrganizers) && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === "/organizer/team"}
                    className={loadingOrganizers ? "opacity-50 pointer-events-none" : ""}
                  >
                    <Link 
                      href="/organizer/team"
                      className="cursor-pointer focus:outline-none"
                      tabIndex={0}
                      onClick={(e) => {
                        if (loadingOrganizers || !isOwner) {
                          e.preventDefault();
                        }
                      }}
                    >
                      <Users className="size-4" />
                      <span className="flex-1">Gérer l'équipe</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {/* Afficher le bouton de scraping si l'utilisateur est propriétaire ou éditeur */}
              {(canManageScraping || loadingOrganizers) && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === "/organizer/scraping"}
                    className={loadingOrganizers ? "opacity-50 pointer-events-none" : ""}
                  >
                    <Link 
                      href="/organizer/scraping"
                      className="cursor-pointer focus:outline-none"
                      tabIndex={0}
                      onClick={(e) => {
                        if (loadingOrganizers) {
                          e.preventDefault();
                        }
                      }}
                    >
                      <Code className="size-4" />
                      <span className="flex-1">Configuration scraping</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === "/organizer/notifications"}
                >
                  <Link 
                    href="/organizer/notifications"
                    className="cursor-pointer focus:outline-none relative"
                    tabIndex={0}
                  >
                    <Bell className="size-4" />
                    <span className="flex-1">Notifications</span>
                    {unreadNotificationsCount > 0 && (
                      <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                        {unreadNotificationsCount > 99 ? "99+" : unreadNotificationsCount}
                      </span>
                    )}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" className="cursor-pointer">
                  <Avatar className="size-8 rounded-lg">
                    {activeOrganizer?.organizer?.logo_url ? (
                      <AvatarImage src={activeOrganizer.organizer.logo_url} alt={organizerName} />
                    ) : null}
                    <AvatarFallback className="rounded-lg">{organizerInitials}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">{organizerName}</span>
                    <span className="truncate text-xs">Organisateur</span>
                  </div>
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                side="bottom"
                align="end"
                sideOffset={4}
              >
                <DropdownMenuLabel className="p-0 font-normal">
                  <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                    <Avatar className="size-8 rounded-lg">
                      {activeOrganizer?.organizer?.logo_url ? (
                        <AvatarImage src={activeOrganizer.organizer.logo_url} alt={organizerName} />
                      ) : null}
                      <AvatarFallback className="rounded-lg">{organizerInitials}</AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-semibold">{organizerName}</span>
                      <span className="truncate text-xs">Organisateur</span>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="cursor-pointer"
                  onClick={handleLogout}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Déconnexion
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

