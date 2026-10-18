"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Plus, X, Check, Edit2, Trash2, Tag as TagIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { DirectorySearch, DirectorySegments } from "./directory/directory";

interface Tag {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

type TagSegment = "all" | "unused";

const PAGE_SIZE = 1000;
// Fiches encore ouvertes, comme sur la page Collecte.
const OPEN_INTAKE_STATUSES = ["spotted", "needs_info", "ready_to_create", "recheck"];

type TagIdsPage = PromiseLike<{ data: Array<{ tag_ids?: unknown }> | null; error: unknown }>;

/** Parcourt toutes les pages d'une requête et ajoute les identifiants de tags trouvés. */
async function collectTagIds(fetchPage: (from: number, to: number) => TagIdsPage, into: Set<string>) {
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    for (const row of data || []) {
      if (!Array.isArray(row.tag_ids)) continue;
      for (const id of row.tag_ids) if (typeof id === "string") into.add(id);
    }
    if (!data || data.length < PAGE_SIZE) return;
  }
}

/**
 * Tags en service : portés par un événement, un artiste ou un grand événement,
 * ou proposés par une fiche de collecte ouverte ou une demande en attente
 * (leurs tags sont recopiés à la création de l'événement).
 */
async function loadUsedTagIds() {
  const used = new Set<string>();
  await Promise.all([
    ...(["events", "artists", "major_events"] as const).map((table) =>
      collectTagIds(
        (from, to) => supabase.from(table).select("tag_ids").neq("tag_ids", "{}").order("id").range(from, to),
        used,
      ),
    ),
    collectTagIds(
      (from, to) =>
        supabase
          .from("event_opportunities")
          .select("tag_ids:import_payload->eventPrefill->tagIds")
          .in("status", OPEN_INTAKE_STATUSES)
          .order("id")
          .range(from, to),
      used,
    ),
    collectTagIds(
      (from, to) =>
        supabase
          .from("user_requests")
          .select("tag_ids:event_data->tag_ids")
          .eq("status", "pending")
          .order("id")
          .range(from, to),
      used,
    ),
  ]);
  return used;
}

export function TagsManagement() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [filteredTags, setFilteredTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [segment, setSegment] = useState<TagSegment>("all");
  const [usedTagIds, setUsedTagIds] = useState<Set<string> | null>(null);
  const [usageUnavailable, setUsageUnavailable] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [newTagValue, setNewTagValue] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    loadTags();
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadUsedTagIds()
      .then((ids) => {
        if (!cancelled) setUsedTagIds(ids);
      })
      .catch((error) => {
        console.error("Utilisation des tags indisponible:", error);
        if (!cancelled) setUsageUnavailable(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const query = searchQuery.trim() ? searchQuery.toLowerCase() : "";
    setFilteredTags(
      tags.filter(
        (tag) =>
          // Tant que l'utilisation n'est pas connue, aucun tag n'est présenté comme inutilisé.
          (segment === "all" || (usedTagIds !== null && !usedTagIds.has(tag.id))) &&
          (!query || tag.name.toLowerCase().includes(query)),
      ),
    );
  }, [tags, searchQuery, segment, usedTagIds]);

  const unusedCount = usedTagIds ? tags.filter((tag) => !usedTagIds.has(tag.id)).length : undefined;

  async function loadTags() {
    try {
      const { data, error } = await supabase
        .from("tags")
        .select("*")
        .order("name", { ascending: true });

      if (error) throw error;
      setTags(data || []);
    } catch (error) {
      console.error("Erreur lors du chargement des tags:", error);
    } finally {
      setLoading(false);
    }
  }

  async function createTag(name: string) {
    if (!name.trim()) return;

    try {
      const { error } = await supabase.from("tags").insert({ name: name.trim() });

      if (error) {
        if (error.code === "23505") {
          alert(`Un tag "${name.trim()}" existe déjà.`);
        } else {
          throw error;
        }
        return;
      }

      await loadTags();
      setNewTagValue("");
      setIsCreating(false);
    } catch (error: any) {
      console.error("Erreur:", error);
      alert(`Erreur: ${error.message || "Erreur inconnue"}`);
    }
  }

  async function updateTag(id: string, name: string) {
    if (!name.trim()) {
      setEditingId(null);
      return;
    }

    try {
      const { error } = await supabase
        .from("tags")
        .update({ name: name.trim() })
        .eq("id", id);

      if (error) {
        if (error.code === "23505") {
          alert(`Un tag "${name.trim()}" existe déjà.`);
        } else {
          throw error;
        }
        return;
      }

      await loadTags();
      setEditingId(null);
      setEditValue("");
    } catch (error: any) {
      console.error("Erreur:", error);
      alert(`Erreur: ${error.message || "Erreur inconnue"}`);
    }
  }

  async function deleteTag(id: string) {
    if (!confirm("Supprimer ce tag ?")) return;

    try {
      const { error } = await supabase.from("tags").delete().eq("id", id);
      if (error) throw error;
      await loadTags();
    } catch (error) {
      console.error("Erreur:", error);
      alert("Erreur lors de la suppression");
    }
  }

  function startEdit(tag: Tag) {
    setEditingId(tag.id);
    setEditValue(tag.name);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditValue("");
  }

  function highlightMatch(text: string, query: string) {
    if (!query.trim()) return text;
    const parts = text.split(new RegExp(`(${query})`, "gi"));
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <mark key={i} className="bg-warning/40 rounded px-0.5">
          {part}
        </mark>
      ) : (
        part
      )
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* En-tête compact */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <TagIcon className="h-5 w-5 text-muted-foreground" />
          <div>
            <h2 className="text-xl font-semibold">Tags</h2>
            <p className="text-sm text-muted-foreground">
              {filteredTags.length} tag{filteredTags.length > 1 ? "s" : ""}
              {(searchQuery || segment !== "all") && ` sur ${tags.length}`}
            </p>
          </div>
        </div>
        <Button
          onClick={() => setIsCreating(true)}
          size="sm"
          className="h-9"
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Ajouter
        </Button>
      </div>

      {/* Filtres, recherche et création inline */}
      <div className="space-y-3">
        <DirectorySegments
          value={segment}
          onValueChange={setSegment}
          items={[
            { value: "all", label: "Tous", count: tags.length },
            { value: "unused", label: "Inutilisés", count: unusedCount, attention: true },
          ]}
        />
        {segment === "unused" ? (
          <p className="text-sm text-muted-foreground">
            Tags absents des événements, des artistes et des grands événements, et qu&apos;aucune fiche de
            collecte ni demande en cours ne propose.
          </p>
        ) : null}
        <DirectorySearch value={searchQuery} onChange={setSearchQuery} placeholder="Rechercher un tag…" />

        {/* Création inline */}
        {isCreating && (
          <div className="flex items-center gap-2 p-3 border rounded-lg bg-muted/30 animate-in fade-in slide-in-from-top-2">
            <Input
              placeholder="Nom du tag"
              value={newTagValue}
              onChange={(e) => setNewTagValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  createTag(newTagValue);
                } else if (e.key === "Escape") {
                  setIsCreating(false);
                  setNewTagValue("");
                }
              }}
              autoFocus
              className="h-9"
            />
            <Button
              onClick={() => createTag(newTagValue)}
              size="sm"
              className="h-9"
            >
              <Check className="h-4 w-4" />
            </Button>
            <Button
              onClick={() => {
                setIsCreating(false);
                setNewTagValue("");
              }}
              size="sm"
              variant="ghost"
              className="h-9"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Grille de tags moderne */}
      {filteredTags.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {tags.length === 0 ? (
            <div className="space-y-2">
              <TagIcon className="h-12 w-12 mx-auto opacity-20" />
              <p>Aucun tag. Cliquez sur "Ajouter" pour commencer.</p>
            </div>
          ) : searchQuery ? (
            <p>Aucun résultat pour "{searchQuery}"</p>
          ) : usageUnavailable ? (
            <p>Impossible de vérifier l&apos;utilisation des tags.</p>
          ) : usedTagIds === null ? (
            <p>Vérification de l&apos;utilisation des tags…</p>
          ) : (
            <p>Aucun tag inutilisé.</p>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {filteredTags.map((tag) => (
            <div
              key={tag.id}
              className={cn(
                "group relative inline-flex cursor-pointer items-center gap-2 rounded-md border bg-card px-2.5 py-1 text-sm transition-colors hover:bg-accent",
                editingId === tag.id && "ring-2 ring-primary"
              )}
              onDoubleClick={() => startEdit(tag)}
              title="Double-cliquer pour modifier"
            >
              {editingId === tag.id ? (
                <>
                  <Input
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        updateTag(tag.id, editValue);
                      } else if (e.key === "Escape") {
                        cancelEdit();
                      }
                    }}
                    className="h-7 px-2 text-sm border-0 focus-visible:ring-0"
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                  <Button
                    onClick={() => updateTag(tag.id, editValue)}
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 hover:bg-success/10"
                  >
                    <Check className="h-3.5 w-3.5 text-success" />
                  </Button>
                  <Button
                    onClick={cancelEdit}
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 hover:bg-destructive/10"
                  >
                    <X className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="text-sm font-medium">
                    {searchQuery ? highlightMatch(tag.name, searchQuery) : tag.name}
                  </span>
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 hover:bg-accent"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Edit2 className="h-3 w-3" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-48 p-2" align="start">
                        <div className="space-y-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start"
                            onClick={() => startEdit(tag)}
                          >
                            <Edit2 className="h-3.5 w-3.5 mr-2" />
                            Modifier
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start text-destructive hover:text-destructive"
                            onClick={() => deleteTag(tag.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-2" />
                            Supprimer
                          </Button>
                        </div>
                      </PopoverContent>
                    </Popover>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => deleteTag(tag.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
