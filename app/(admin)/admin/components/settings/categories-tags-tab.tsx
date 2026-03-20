"use client";

import { Separator } from "@/components/ui/separator";
import { CategoriesManagement } from "../categories-management";
import { TagsManagement } from "../tags-management";

export function CategoriesTagsTab() {
  return (
    <div className="space-y-8">
      <CategoriesManagement />
      <Separator />
      <TagsManagement />
    </div>
  );
}

