"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

import { LocationsTab } from "./locations-tab";
import { OrganizersTab } from "./organizers-tab";
import { CategoriesTagsTab } from "./categories-tags-tab";
import { UsersTab } from "./users-tab";
import { NotificationsTab } from "./notifications-tab";
import { SystemTab } from "./system-tab";

const validTabs = ["locations", "organizers", "categories", "users", "notifications", "system"] as const;
type SettingsTab = (typeof validTabs)[number];

function isValidTab(v: string | null): v is SettingsTab {
  return Boolean(v && (validTabs as readonly string[]).includes(v));
}

export function SettingsPage() {
  const isMobile = useIsMobile();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [tab, setTab] = React.useState<SettingsTab>(() => {
    const fromQuery = searchParams?.get("tab") || null;
    return isValidTab(fromQuery) ? fromQuery : "locations";
  });

  React.useEffect(() => {
    const fromQuery = searchParams?.get("tab") || null;
    const next = isValidTab(fromQuery) ? fromQuery : "locations";
    setTab(next);
  }, [searchParams]);

  return (
    <Tabs
      value={tab}
      onValueChange={(next) => {
        const nextTab = next as SettingsTab;
        setTab(nextTab);
        const params = new URLSearchParams(searchParams?.toString() || "");
        if (nextTab === "locations") {
          params.delete("tab");
        } else {
          params.set("tab", nextTab);
        }
        const q = params.toString();
        router.replace(q ? `/admin/settings?${q}` : "/admin/settings");
      }}
      className="w-full"
    >
      <div className="sticky top-14 md:top-16 z-10 -mx-3 md:-mx-4 lg:-mx-6 xl:-mx-8 px-3 md:px-4 lg:px-6 xl:px-8 pb-3 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/70 border-b border-border/40">
        <TabsList
          className={cn(
            "w-full justify-start",
            isMobile && "overflow-x-auto whitespace-nowrap",
          )}
        >
          <TabsTrigger value="locations">Lieux</TabsTrigger>
          <TabsTrigger value="organizers">Organisateurs</TabsTrigger>
          <TabsTrigger value="categories">Catégories & Tags</TabsTrigger>
          <TabsTrigger value="users">Utilisateurs</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="system">Système</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="locations" className="mt-6">
        <LocationsTab />
      </TabsContent>
      <TabsContent value="organizers" className="mt-6">
        <OrganizersTab />
      </TabsContent>
      <TabsContent value="categories" className="mt-6">
        <CategoriesTagsTab />
      </TabsContent>
      <TabsContent value="users" className="mt-6">
        <UsersTab />
      </TabsContent>
      <TabsContent value="notifications" className="mt-6">
        <NotificationsTab />
      </TabsContent>
      <TabsContent value="system" className="mt-6">
        <SystemTab />
      </TabsContent>
    </Tabs>
  );
}

