"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Check, Edit2, Plus, Shapes, Trash2, X } from "lucide-react";

import { supabase } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

/*
 * Les genres (event_genres) : une liste fermée par catégorie, que l'équipe éditoriale ajuste
 * (../live/docs/chantiers/pour-toi.md, « Des fiches plus riches »). Le nom est celui d'une puce (« Rap et
 * hip-hop ») ; la phrase sert aux textes de l'app (« Ajouter le jazz à Pour toi »). Un genre porté par des
 * événements se désactive plutôt que de se supprimer : ils le gardent, il n'est plus proposé.
 */

type Genre = Tables<"event_genres">;
type Category = Pick<Tables<"categories">, "id" | "name" | "display_order" | "is_active">;
type Draft = { name: string; phrase: string };

const PAGE_SIZE = 1000;

/** Nombre d'événements qui portent chaque genre. */
async function loadGenreUsage() {
  const usage = new Map<string, number>();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("events")
      .select("genre_ids")
      .filter("genre_ids", "neq", "{}")
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    for (const row of data || []) {
      for (const id of row.genre_ids || []) usage.set(id, (usage.get(id) || 0) + 1);
    }
    if (!data || data.length < PAGE_SIZE) return usage;
  }
}

function GenreDraftFields({
  draft,
  onChange,
  onSubmit,
  onCancel,
}: {
  draft: Draft;
  onChange: (draft: Draft) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Enter") onSubmit();
    else if (event.key === "Escape") onCancel();
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={draft.name}
        onChange={(event) => onChange({ ...draft, name: event.target.value })}
        onKeyDown={onKeyDown}
        placeholder="Nom (« Jazz »)"
        aria-label="Nom du genre"
        className="h-8 w-44"
        autoFocus
      />
      <Input
        value={draft.phrase}
        onChange={(event) => onChange({ ...draft, phrase: event.target.value })}
        onKeyDown={onKeyDown}
        placeholder="Phrase (« le jazz »)"
        aria-label="Phrase du genre"
        className="h-8 w-52"
      />
      <Button size="sm" className="h-8" onClick={onSubmit} aria-label="Enregistrer">
        <Check className="h-4 w-4" />
      </Button>
      <Button size="sm" variant="ghost" className="h-8" onClick={onCancel} aria-label="Annuler">
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function GenresManagement() {
  const [genres, setGenres] = React.useState<Genre[]>([]);
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [usage, setUsage] = React.useState<Map<string, number> | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [editing, setEditing] = React.useState<{ id: string; draft: Draft } | null>(null);
  const [creating, setCreating] = React.useState<{ categoryId: string; draft: Draft } | null>(null);
  const [addCategoryId, setAddCategoryId] = React.useState("");

  const load = React.useCallback(async () => {
    const [genresResult, categoriesResult] = await Promise.all([
      supabase.from("event_genres").select("*").order("display_order").order("name"),
      supabase.from("categories").select("id, name, display_order, is_active").order("display_order"),
    ]);
    if (genresResult.error) console.error("Genres indisponibles:", genresResult.error);
    if (categoriesResult.error) console.error("Catégories indisponibles:", categoriesResult.error);
    setGenres(genresResult.data || []);
    setCategories((categoriesResult.data || []) as Category[]);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void load();
    loadGenreUsage()
      .then(setUsage)
      .catch((error) => console.error("Utilisation des genres indisponible:", error));
  }, [load]);

  function reportError(error: { code?: string; message?: string }, name?: string) {
    if (error.code === "23505") alert(`Un genre « ${name} » existe déjà dans cette catégorie.`);
    else alert(`Erreur : ${error.message || "erreur inconnue"}`);
  }

  async function createGenre() {
    if (!creating) return;
    const name = creating.draft.name.trim();
    const phrase = creating.draft.phrase.trim();
    if (!name || !phrase) {
      alert("Un genre a un nom et une phrase (« le jazz »).");
      return;
    }
    const siblings = genres.filter((genre) => genre.category_id === creating.categoryId);
    const { error } = await supabase.from("event_genres").insert({
      category_id: creating.categoryId,
      name,
      phrase,
      display_order: Math.max(0, ...siblings.map((genre) => genre.display_order)) + 1,
    });
    if (error) return reportError(error, name);
    setCreating(null);
    setAddCategoryId("");
    await load();
  }

  async function updateGenre(id: string, update: Partial<Pick<Genre, "name" | "phrase" | "is_active" | "display_order">>) {
    const { error } = await supabase.from("event_genres").update(update).eq("id", id);
    if (error) return reportError(error, update.name);
    await load();
  }

  async function saveEdit() {
    if (!editing) return;
    const name = editing.draft.name.trim();
    const phrase = editing.draft.phrase.trim();
    if (!name || !phrase) return;
    await updateGenre(editing.id, { name, phrase });
    setEditing(null);
  }

  /** Échange la place d'un genre avec son voisin (l'ordre des puces et des bulles). */
  async function move(genre: Genre, direction: -1 | 1) {
    const siblings = genres
      .filter((other) => other.category_id === genre.category_id)
      .sort((left, right) => left.display_order - right.display_order || left.name.localeCompare(right.name, "fr"));
    const index = siblings.findIndex((other) => other.id === genre.id);
    const neighbour = siblings[index + direction];
    if (!neighbour) return;
    // Des ordres égaux (ajouts à la main) : on renumérote toute la catégorie.
    const reordered = [...siblings];
    reordered.splice(index, 1);
    reordered.splice(index + direction, 0, genre);
    const updates = reordered
      .map((other, position) => ({ id: other.id, display_order: position + 1, before: other.display_order }))
      .filter((other) => other.display_order !== other.before);
    for (const update of updates) {
      const { error } = await supabase.from("event_genres").update({ display_order: update.display_order }).eq("id", update.id);
      if (error) return reportError(error);
    }
    await load();
  }

  async function deleteGenre(genre: Genre) {
    const count = usage?.get(genre.id) || 0;
    if (count > 0) {
      alert(`${count} événement${count > 1 ? "s portent" : " porte"} ce genre : désactive-le plutôt.`);
      return;
    }
    if (!confirm(`Supprimer le genre « ${genre.name} » ?`)) return;
    const { error } = await supabase.from("event_genres").delete().eq("id", genre.id);
    if (error) return reportError(error);
    await load();
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Chargement des genres…</p>;
  }

  const categoriesWithGenres = categories.filter((category) => genres.some((genre) => genre.category_id === category.id));
  const otherCategories = categories.filter(
    (category) => category.is_active !== false && !categoriesWithGenres.some((other) => other.id === category.id),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Shapes className="h-5 w-5 text-muted-foreground" />
        <div>
          <h2 className="text-xl font-semibold">Genres</h2>
          <p className="text-sm text-muted-foreground">
            Une liste fermée par catégorie : la collecte et le formulaire n&apos;en proposent pas d&apos;autres. La
            phrase sert aux textes de l&apos;app (« Ajouter le jazz à Pour toi »).
          </p>
        </div>
      </div>

      {categoriesWithGenres.map((category) => {
        const ofCategory = genres
          .filter((genre) => genre.category_id === category.id)
          .sort((left, right) => left.display_order - right.display_order || left.name.localeCompare(right.name, "fr"));
        return (
          <section key={category.id} className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{category.name}</h3>
              <Button
                size="sm"
                variant="ghost"
                className="h-8"
                onClick={() => setCreating({ categoryId: category.id, draft: { name: "", phrase: "" } })}
              >
                <Plus className="mr-1 h-4 w-4" />
                Ajouter un genre
              </Button>
            </div>
            <ul className="divide-y rounded-lg border">
              {ofCategory.map((genre, index) => (
                <li key={genre.id} className={cn("flex flex-wrap items-center gap-3 px-3 py-2", !genre.is_active && "opacity-60")}>
                  {editing?.id === genre.id ? (
                    <GenreDraftFields
                      draft={editing.draft}
                      onChange={(draft) => setEditing({ id: genre.id, draft })}
                      onSubmit={() => void saveEdit()}
                      onCancel={() => setEditing(null)}
                    />
                  ) : (
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium">{genre.name}</span>
                      <span className="ml-2 text-[13px] text-muted-foreground">{genre.phrase}</span>
                      {!genre.is_active ? (
                        <Badge variant="outline" className="ml-2">
                          Désactivé
                        </Badge>
                      ) : null}
                    </div>
                  )}
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {usage === null ? "…" : `${usage.get(genre.id) || 0} év.`}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      disabled={index === 0}
                      onClick={() => void move(genre, -1)}
                      aria-label={`Monter ${genre.name}`}
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      disabled={index === ofCategory.length - 1}
                      onClick={() => void move(genre, 1)}
                      aria-label={`Descendre ${genre.name}`}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      onClick={() => setEditing({ id: genre.id, draft: { name: genre.name, phrase: genre.phrase } })}
                      aria-label={`Modifier ${genre.name}`}
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Switch
                      checked={genre.is_active}
                      onCheckedChange={(checked) => void updateGenre(genre.id, { is_active: checked })}
                      aria-label={genre.is_active ? `Désactiver ${genre.name}` : `Activer ${genre.name}`}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 hover:text-destructive"
                      onClick={() => void deleteGenre(genre)}
                      aria-label={`Supprimer ${genre.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
              {creating?.categoryId === category.id ? (
                <li className="px-3 py-2">
                  <GenreDraftFields
                    draft={creating.draft}
                    onChange={(draft) => setCreating({ categoryId: category.id, draft })}
                    onSubmit={() => void createGenre()}
                    onCancel={() => setCreating(null)}
                  />
                </li>
              ) : null}
            </ul>
          </section>
        );
      })}

      {otherCategories.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Une autre catégorie</h3>
          <div className="flex flex-wrap gap-1.5">
            {otherCategories.map((category) => (
              <Button
                key={category.id}
                size="sm"
                variant={addCategoryId === category.id ? "default" : "outline"}
                className="h-8"
                onClick={() => {
                  setAddCategoryId(category.id);
                  setCreating({ categoryId: category.id, draft: { name: "", phrase: "" } });
                }}
              >
                {category.name}
              </Button>
            ))}
          </div>
          {creating && creating.categoryId === addCategoryId ? (
            <GenreDraftFields
              draft={creating.draft}
              onChange={(draft) => setCreating({ categoryId: addCategoryId, draft })}
              onSubmit={() => void createGenre()}
              onCancel={() => {
                setCreating(null);
                setAddCategoryId("");
              }}
            />
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
