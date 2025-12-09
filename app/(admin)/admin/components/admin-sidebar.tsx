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
import { Shield, Calendar, MapPin, Users, Tag, Hash, FileText, LayoutDashboard, LogOut, MessageSquare, Share2 } from "lucide-react";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const menuItems = [
  {
    title: "Dashboard",
    icon: LayoutDashboard,
    url: "/admin/dashboard",
  },
  {
    title: "Événements",
    icon: Calendar,
    url: "/admin/events",
  },
  {
    title: "Lieux",
    icon: MapPin,
    url: "/admin/locations",
  },
  {
    title: "Organisateurs",
    icon: Users,
    url: "/admin/organizers",
  },
  {
    title: "Catégories",
    icon: Tag,
    url: "/admin/categories",
  },
  {
    title: "Tags",
    icon: Hash,
    url: "/admin/tags",
  },
  {
    title: "Demandes",
    icon: FileText,
    url: "/admin/requests",
  },
  {
    title: "Feedback",
    icon: MessageSquare,
    url: "/admin/feedback",
  },
  {
    title: "Partage réseaux",
    icon: Share2,
    url: "/admin/share",
  },
];

export function AdminSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const menuItemsRefs = React.useRef<(HTMLAnchorElement | null)[]>([]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/admin/login");
  }

  // Navigation au clavier avec les flèches haut/bas
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Vérifier si on est dans la sidebar (ou si aucun input n'est focus)
      const activeElement = document.activeElement;
      const isInputFocused = activeElement?.tagName === 'INPUT' || 
                             activeElement?.tagName === 'TEXTAREA' || 
                             activeElement?.getAttribute('contenteditable') === 'true';
      
      if (isInputFocused) return; // Ne pas interférer si on est dans un input

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
                    isActive={pathname === item.url || (item.url !== "/admin/dashboard" && pathname?.startsWith(item.url))}
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
                    <AvatarFallback className="rounded-lg">A</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">Admin</span>
                    <span className="truncate text-xs">Administrateur</span>
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
                      <AvatarFallback className="rounded-lg">A</AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-semibold">Admin</span>
                      <span className="truncate text-xs">Administrateur</span>
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

