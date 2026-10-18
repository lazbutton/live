import { supabase } from "@/lib/supabase/client";
import { normalizeSearchValue, parseImportedTags } from "@/lib/events/import-prefill";

import type { TagOption } from "./types";

export { buildEventFormPrefillFromImport } from "@/lib/events/import-prefill";

/**
 * Tags d'un import : seuls les tags existants sont repris. Les suggestions inconnues
 * ne sont créées que si `createMissing` est demandé explicitement (évite d'encombrer
 * la liste avec les mots-clés proposés par l'IA).
 */
export async function resolveTagIdsForImport({
  rawTagNames,
  tags,
  onTagsChanged,
  createMissing = false,
}: {
  rawTagNames: string[];
  tags: TagOption[];
  onTagsChanged?: () => Promise<void> | void;
  createMissing?: boolean;
}) {
  if (!Array.isArray(rawTagNames) || rawTagNames.length === 0) return [];

  const normalizedNames = parseImportedTags(rawTagNames);

  const resolvedIds: string[] = [];
  let shouldNotifyTagsChanged = false;

  for (const tagName of normalizedNames) {
    const existingLocal = tags.find(
      (tag) => normalizeSearchValue(tag.name) === normalizeSearchValue(tagName),
    );
    if (existingLocal) {
      resolvedIds.push(existingLocal.id);
      continue;
    }

    const { data: existingRemote } = await supabase
      .from("tags")
      .select("id, name")
      .ilike("name", tagName)
      .maybeSingle();

    if (existingRemote?.id) {
      resolvedIds.push(existingRemote.id);
      continue;
    }

    if (!createMissing) continue;

    const { data: createdTag, error } = await supabase
      .from("tags")
      .insert([{ name: tagName }])
      .select("id")
      .single();

    if (!error && createdTag?.id) {
      resolvedIds.push(createdTag.id);
      shouldNotifyTagsChanged = true;
    }
  }

  if (shouldNotifyTagsChanged) {
    await onTagsChanged?.();
  }

  return [...new Set(resolvedIds)];
}
