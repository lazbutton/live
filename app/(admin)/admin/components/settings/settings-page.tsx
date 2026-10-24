"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

import { CategoriesTagsTab } from "./categories-tags-tab";
import { UsersTab } from "./users-tab";
import { NotificationsTab } from "./notifications-tab";
import { SystemTab } from "./system-tab";

const validTabs = ["categories", "users", "notifications", "system"] as const;
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
    return isValidTab(fromQuery) ? fromQuery : "categories";
  });

  React.useEffect(() => {
    const fromQuery = searchParams?.get("tab") || null;
    const next = isValidTab(fromQuery) ? fromQuery : "categories";
    setTab(next);
  }, [searchParams]);

  return (
    <Tabs
      value={tab}
      onValueChange={(next) => {
        const nextTab = next as SettingsTab;
        setTab(nextTab);
        const params = new URLSearchParams(searchParams?.toString() || "");
        if (nextTab === "categories") {
          params.delete("tab");
        } else {
          params.set("tab", nextTab);
        }
        const q = params.toString();
        router.replace(q ? `/admin/settings?${q}` : "/admin/settings");
      }}
      className="w-full"
    >
      <div className="sticky top-12 z-20 -mx-4 bg-background/90 px-4 backdrop-blur-md supports-[backdrop-filter]:bg-background/75 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
        <TabsList
          variant="line"
          className={cn(isMobile && "overflow-x-auto overflow-y-hidden")}
        >
          <TabsTrigger value="categories">Catégories, genres et tags</TabsTrigger>
          <TabsTrigger value="users">Utilisateurs</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="system">Système</TabsTrigger>
        </TabsList>
      </div>

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

