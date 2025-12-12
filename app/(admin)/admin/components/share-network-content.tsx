"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, Calendar, MapPin, Users, Clock, Euro, Tag, FolderOpen } from "lucide-react";
import { addDays, addWeeks, format, startOfWeek, endOfWeek } from "date-fns";
import { fr } from "date-fns/locale";
import { formatDateWithoutTimezone } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import { toPng } from "html-to-image";

interface Event {
  id: string;
  title: string;
  description: string | null;
  date: string;
  end_date: string | null;
  image_url: string | null;
  price: number | null;
  category?: string;
  category_name?: { name: string };
  location?: { id: string; name: string; image_url?: string | null };
  room?: { id: string; name: string } | null;
  event_organizers?: Array<{
    organizer?: { id: string; name: string } | null;
    location?: { id: string; name: string } | null;
  }>;
  event_tags?: Array<{
    tag: { id: string; name: string };
  }>;
}

const SOCIAL_SQUARE = {
  label: "Carré",
  sizeLabel: "1080×1080",
  width: 1080,
  height: 1080,
  previewWidth: 432,
  previewAspectRatio: "1 / 1",
  backgroundColor: "#ffffff",
} as const;

export function ShareNetworkContent() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [tags, setTags] = useState<{ id: string; name: string }[]>([]);
  // Période sélectionnable (YYYY-MM-DD). Par défaut : semaine prochaine (lun→dim).
  const [rangeStartKey, setRangeStartKey] = useState<string>(() => {
    const base = addWeeks(new Date(), 1);
    const start = startOfWeek(base, { weekStartsOn: 1 });
    return format(start, "yyyy-MM-dd");
  });
  const [rangeEndKey, setRangeEndKey] = useState<string>(() => {
    const base = addWeeks(new Date(), 1);
    const end = endOfWeek(base, { weekStartsOn: 1 });
    return format(end, "yyyy-MM-dd");
  });
  const [generatedImages, setGeneratedImages] = useState<{ [key: string]: string }>({});
  const [generatingImages, setGeneratingImages] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<{ done: number; total: number } | null>(null);
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
  const imageRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  useEffect(() => {
    loadCategories();
    loadTags();
  }, []);

  useEffect(() => {
    if (categories.length > 0 && tags.length > 0) {
      loadWeekEvents();
    }
  }, [categories, tags, rangeStartKey, rangeEndKey]);

  useEffect(() => {
    if (events.length === 0 || loading) return;
    if (generatingImages) return;
    // Générer automatiquement les visuels manquants
    const missing = events.some((e) => !generatedImages[e.id]);
    if (!missing) return;

      // Attendre un peu pour que les refs soient prêts
      const timer = setTimeout(() => {
        generateAllImages();
      }, 200);
      return () => clearTimeout(timer);
  }, [events, loading, generatingImages, generatedImages]);

  async function generateAllImages() {
    setGeneratingImages(true);
    setGenerationProgress(null);
    try {
      const tasks = events.filter((e) => !generatedImages[e.id]);
      setGenerationProgress({ done: 0, total: tasks.length });

      const batchSize = 4;
      
      for (let i = 0; i < tasks.length; i += batchSize) {
        const batch = tasks.slice(i, i + batchSize);
        const batchPromises = batch.map(async (event) => {
          const imageUrl = await generateImage(event.id);
          return { eventId: event.id, imageUrl };
        });
        
        const batchResults = await Promise.all(batchPromises);
        setGeneratedImages((prev) => {
          const next = { ...prev };
        batchResults.forEach(({ eventId, imageUrl }) => {
            if (imageUrl) next[eventId] = imageUrl;
          });
          return next;
        });
        setGenerationProgress((prev) => {
          if (!prev) return prev;
          return { ...prev, done: Math.min(prev.total, prev.done + batch.length) };
        });
        
        // Petit délai entre les batches pour éviter de surcharger
        if (i + batchSize < tasks.length) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
    } catch (error) {
      console.error("Erreur lors de la génération des images:", error);
    } finally {
      setGeneratingImages(false);
      setGenerationProgress(null);
    }
  }

  async function loadCategories() {
    try {
      const { data } = await supabase
        .from("categories")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (data) setCategories(data);
    } catch (error) {
      console.error("Erreur lors du chargement des catégories:", error);
    }
  }

  async function loadTags() {
    try {
      const { data } = await supabase
        .from("tags")
        .select("id, name")
        .order("name");
      if (data) setTags(data);
    } catch (error) {
      console.error("Erreur lors du chargement des tags:", error);
    }
  }

  function parseLocalDateKey(key: string) {
    const [y, m, d] = key.split("-").map((n) => parseInt(n, 10));
    return new Date(y, (m || 1) - 1, d || 1);
  }
  function startOfLocalDay(date: Date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  function endOfLocalDay(date: Date) {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
  }
  function formatKey(date: Date) {
    return format(date, "yyyy-MM-dd");
  }
  function getWeekendRangeKey(base: Date) {
    const today = startOfLocalDay(base);
    const dow = today.getDay(); // 0=dim, 6=sam
    const saturday =
      dow === 6 ? today : dow === 0 ? addDays(today, -1) : addDays(today, 6 - dow);
    const sunday = addDays(saturday, 1);
    return { startKey: formatKey(saturday), endKey: formatKey(sunday) };
  }

  const thisWeek = (() => {
    const now = new Date();
    const start = startOfWeek(now, { weekStartsOn: 1 });
    const end = endOfWeek(now, { weekStartsOn: 1 });
    return { startKey: formatKey(start), endKey: formatKey(end) };
  })();
  const nextWeek = (() => {
    const base = addWeeks(new Date(), 1);
    const start = startOfWeek(base, { weekStartsOn: 1 });
    const end = endOfWeek(base, { weekStartsOn: 1 });
    return { startKey: formatKey(start), endKey: formatKey(end) };
  })();
  const thisWeekend = getWeekendRangeKey(new Date());

  async function loadWeekEvents() {
    try {
      setLoading(true);
      setEvents([]);
      setGeneratedImages({});
      setSelectedImages(new Set());
      setGeneratingImages(false);

      const start = startOfLocalDay(parseLocalDateKey(rangeStartKey));
      const end = endOfLocalDay(parseLocalDateKey(rangeEndKey));

      const { data, error } = await supabase
        .from("events")
        .select(`
          id,
          title,
          description,
          date,
          end_date,
          image_url,
          price,
          category,
          tag_ids,
          location:locations(id, name, image_url),
          room:rooms(id, name),
          event_organizers:event_organizers(
            organizer:organizers(id, name),
            location:locations(id, name)
          )
        `)
        .eq("status", "approved")
        .gte("date", start.toISOString())
        .lte("date", end.toISOString())
        .order("date", { ascending: true });

      if (error) {
        console.error("Erreur Supabase:", JSON.stringify(error, null, 2));
        console.error("Erreur Supabase details:", error);
        throw error;
      }
      
      // Transformer les données pour correspondre au type Event
      const transformedData = (data || []).map((event: any) => {
        // Gérer la catégorie - chercher par nom dans la table categories
        let categoryName = null;
        if (event.category && categories.length > 0) {
          const foundCategory = categories.find((cat) => cat.name === event.category || cat.id === event.category);
          if (foundCategory) {
            categoryName = { id: foundCategory.id, name: foundCategory.name };
          }
        }
        
        // Gérer les tags - mapper les tag_ids vers les objets tags
        let eventTags: Array<{ tag: { id: string; name: string } }> = [];
        if (event.tag_ids && Array.isArray(event.tag_ids) && event.tag_ids.length > 0) {
          if (tags.length > 0) {
            eventTags = event.tag_ids
              .map((tagId: string) => {
                // Comparer les IDs en tant que strings pour éviter les problèmes de type
                const foundTag = tags.find((tag) => String(tag.id) === String(tagId));
                return foundTag ? { tag: { id: foundTag.id, name: foundTag.name } } : null;
              })
              .filter((tag: any): tag is { tag: { id: string; name: string } } => tag !== null);
          } else {
            console.warn("Tags array is empty, cannot map tag_ids for event:", event.id, "tag_ids:", event.tag_ids);
          }
        } else if (event.tag_ids && event.tag_ids.length > 0) {
          console.log("Event has tag_ids but tags list is not loaded yet:", event.id, "tag_ids:", event.tag_ids);
        }
        // Debug: log les tags pour vérifier
        if (eventTags.length > 0) {
          console.log(`Event ${event.id} has ${eventTags.length} tags:`, eventTags.map(et => et.tag.name));
        }
        
        // Gérer le lieu
        const location = event.location && !Array.isArray(event.location) ? event.location : 
                        Array.isArray(event.location) && event.location.length > 0 ? event.location[0] : 
                        null;
        
        // Gérer la salle
        const room = event.room && !Array.isArray(event.room) ? event.room : 
                    Array.isArray(event.room) && event.room.length > 0 ? event.room[0] : 
                    null;
        
        return {
          ...event,
          location,
          room,
          category_name: categoryName,
          event_tags: eventTags || [],
        };
      });
      
      setEvents(transformedData);
    } catch (error) {
      console.error("Erreur lors du chargement des événements:", error);
    } finally {
      setLoading(false);
    }
  }

  function toggleImageSelection(eventId: string) {
    setSelectedImages((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(eventId)) {
        newSet.delete(eventId);
      } else {
        newSet.add(eventId);
      }
      return newSet;
    });
  }

  function toggleAllImages() {
    if (selectedImages.size === events.length) {
      setSelectedImages(new Set());
    } else {
      setSelectedImages(new Set(events.map((e) => e.id)));
    }
  }

  async function downloadSelectedImages() {
    for (const eventId of selectedImages) {
      const event = events.find((e) => e.id === eventId);
      if (event) {
        downloadSingleImage(eventId, event.title);
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
  }

  async function generateImage(eventId: string): Promise<string | null> {
    const element = imageRefs.current[eventId];
    if (!element) return null;

    try {
      const spec = SOCIAL_SQUARE;
      // Attendre que les images soient chargées
      const images = element.querySelectorAll("img");
      await Promise.all(
        Array.from(images).map(
          (img) =>
            new Promise((resolve, reject) => {
              if (img.complete) {
                resolve(null);
                return;
              }
              img.onload = () => resolve(null);
              img.onerror = () => reject(new Error("Erreur de chargement d'image"));
            })
        )
      );

      // Petit délai pour s'assurer que tout est rendu
      await new Promise((resolve) => setTimeout(resolve, 50));

      const dataUrl = await toPng(element, {
        width: spec.width,
        height: spec.height,
        backgroundColor: spec.backgroundColor,
        pixelRatio: 1,
        cacheBust: false, // Désactiver cacheBust pour plus de vitesse
        quality: 0.95, // Légèrement réduire la qualité pour accélérer
        style: {
          transform: "none",
          position: "static",
        },
      });
      return dataUrl;
    } catch (error) {
      console.error("Erreur lors de la génération de l'image:", error);
      return null;
    }
  }

  function downloadImage(dataUrl: string, filename: string) {
    const link = document.createElement("a");
    link.download = filename;
    link.href = dataUrl;
    link.click();
  }

  function downloadSingleImage(eventId: string, eventTitle: string) {
    const spec = SOCIAL_SQUARE;
    const imageUrl = generatedImages[eventId];
    if (imageUrl) {
      const safeTitle = eventTitle.replace(/[^a-z0-9]/gi, "_").toLowerCase();
      downloadImage(imageUrl, `${safeTitle}_${spec.width}x${spec.height}.png`);
    }
  }

  if (loading) {
    return <div className="text-center py-8">Chargement...</div>;
  }

    return (
    <div className="space-y-6">
      {/* Période */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Période
          </CardTitle>
          <CardDescription>
            Sélectionnez les dates à couvrir. Par défaut, la page affiche la semaine prochaine.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="share-range-start">Début</Label>
              <Input
                id="share-range-start"
                type="date"
                value={rangeStartKey}
                onChange={(e) => {
                  const next = e.target.value;
                  setRangeStartKey(next);
                  if (next && rangeEndKey && next > rangeEndKey) setRangeEndKey(next);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="share-range-end">Fin</Label>
              <Input
                id="share-range-end"
                type="date"
                value={rangeEndKey}
                onChange={(e) => {
                  const next = e.target.value;
                  setRangeEndKey(next);
                  if (next && rangeStartKey && next < rangeStartKey) setRangeStartKey(next);
                }}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground">
              {format(parseLocalDateKey(rangeStartKey), "EEEE d MMMM", { locale: fr })} →{" "}
              {format(parseLocalDateKey(rangeEndKey), "EEEE d MMMM", { locale: fr })}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant={rangeStartKey === thisWeek.startKey && rangeEndKey === thisWeek.endKey ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  const now = new Date();
                  const start = startOfWeek(now, { weekStartsOn: 1 });
                  const end = endOfWeek(now, { weekStartsOn: 1 });
                  setRangeStartKey(formatKey(start));
                  setRangeEndKey(formatKey(end));
                }}
              >
                Cette semaine
              </Button>
              <Button
                type="button"
                variant={rangeStartKey === thisWeekend.startKey && rangeEndKey === thisWeekend.endKey ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  const { startKey, endKey } = getWeekendRangeKey(new Date());
                  setRangeStartKey(startKey);
                  setRangeEndKey(endKey);
                }}
              >
                Ce week-end
              </Button>
              <Button
                type="button"
                variant={rangeStartKey === nextWeek.startKey && rangeEndKey === nextWeek.endKey ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  const base = addWeeks(new Date(), 1);
                  const start = startOfWeek(base, { weekStartsOn: 1 });
                  const end = endOfWeek(base, { weekStartsOn: 1 });
                  setRangeStartKey(formatKey(start));
                  setRangeEndKey(formatKey(end));
                }}
              >
                Semaine prochaine
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {events.length === 0 ? (
      <Card>
        <CardContent className="py-8">
          <p className="text-center text-muted-foreground">
              Aucun événement sur cette période.
          </p>
        </CardContent>
      </Card>
      ) : null}

      {/* Aperçu des images */}
      {events.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>
                Visuels réseaux{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  • {SOCIAL_SQUARE.label} {SOCIAL_SQUARE.sizeLabel}
                </span>
              </CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={toggleAllImages}
                  variant="outline"
                  size="sm"
                  disabled={events.length === 0}
                >
                  {selectedImages.size === events.length ? "Tout désélectionner" : "Tout sélectionner"}
                </Button>
                <Button
                  onClick={downloadSelectedImages}
                  disabled={selectedImages.size === 0}
                  className="flex items-center gap-2"
                  variant={selectedImages.size > 0 ? "outline" : "default"}
                >
                  <Download className="h-4 w-4" />
                  Télécharger {selectedImages.size > 0 ? `(${selectedImages.size})` : ""}
                </Button>
              </div>
            </div>
            {generatingImages && (
              <CardDescription>
                {generationProgress
                  ? `Génération ${generationProgress.done}/${generationProgress.total} • ${SOCIAL_SQUARE.label} ${SOCIAL_SQUARE.sizeLabel}`
                  : "Génération des images en cours..."}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-16">
            {/* Aperçu */}
            <div>
              {generatingImages ? (
                <div className="text-center py-8 text-muted-foreground">
                  {generationProgress
                    ? `Génération ${generationProgress.done}/${generationProgress.total} • ${SOCIAL_SQUARE.label} ${SOCIAL_SQUARE.sizeLabel}`
                    : "Génération des images..."}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-20 gap-y-8 justify-items-center">
                  {events.map((event) => {
                    const imageUrl = generatedImages[event.id];
                    const isSelected = selectedImages.has(event.id);
                    return (
                      <div
                        key={event.id}
                        onClick={() => toggleImageSelection(event.id)}
                        className="relative group cursor-pointer overflow-hidden border"
                        style={{
                          width: `${SOCIAL_SQUARE.previewWidth}px`,
                          maxWidth: "100%",
                          aspectRatio: SOCIAL_SQUARE.previewAspectRatio,
                          backgroundColor: "var(--card)",
                          position: "relative",
                          borderRadius: "var(--radius-lg)",
                          overflow: "hidden",
                          borderColor: isSelected ? "var(--ring)" : "var(--border)",
                          borderWidth: isSelected ? "2px" : "1px",
                          boxShadow: "var(--shadow-lg)",
                        }}
                      >
                        {/* Overlay de sélection moderne */}
                        {isSelected && (
                          <div
                            className="absolute inset-0 backdrop-blur-[2px] z-[5]"
                            style={{
                              backgroundColor:
                                "color-mix(in srgb, var(--primary) 12%, transparent)",
                              border: "2px solid var(--ring)",
                              borderRadius: "var(--radius-lg)",
                            }}
                          />
                        )}
                        <div 
                          className="absolute top-4 left-4 z-10 cursor-pointer group/checkbox"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleImageSelection(event.id);
                          }}
                        >
                          <div
                            className={cn(
                              "w-7 h-7 flex items-center justify-center border-2 transition-all duration-200 ease-out",
                              isSelected ? "scale-110" : "hover:scale-105"
                            )}
                            style={{
                              borderRadius: "var(--radius-md)",
                              backgroundColor: isSelected ? "var(--primary)" : "var(--card)",
                              borderColor: isSelected ? "var(--ring)" : "var(--border)",
                              boxShadow: isSelected ? "var(--shadow-md)" : "var(--shadow-sm)",
                              color: isSelected ? "var(--primary-foreground)" : "var(--foreground)",
                            }}
                          >
                            {isSelected ? (
                              <svg 
                                className="w-4 h-4 drop-shadow-sm animate-in zoom-in-50 duration-200" 
                                fill="none" 
                                strokeLinecap="round" 
                                strokeLinejoin="round" 
                                strokeWidth="3" 
                                viewBox="0 0 24 24" 
                                stroke="currentColor"
                              >
                                <path d="M5 13l4 4L19 7" />
                              </svg>
                            ) : (
                              <div className="w-2 h-2 rounded-full bg-transparent group-hover/checkbox:bg-primary transition-colors duration-200" />
                            )}
                          </div>
                        </div>
                        {imageUrl ? (
                          <>
                            <img 
                              src={imageUrl} 
                              alt={event.title}
                              style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "contain",
                              }}
                            />
                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  downloadSingleImage(event.id, event.title);
                                }}
                                size="sm"
                                variant="secondary"
                                className="shadow-lg"
                              >
                                <Download className="h-4 w-4 mr-2" />
                                Télécharger
                              </Button>
                            </div>
                          </>
                        ) : (
                          <div className="flex items-center justify-center h-full text-muted-foreground">
                            Image en cours de génération...
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Images cachées pour génération */}
      <div className="absolute -left-[9999px] opacity-0 pointer-events-none">
        {events.map((event) => {
          const organizers = event.event_organizers
            ?.filter((eo) => {
              // Exclure les organisateurs qui sont aussi le lieu principal
              if (eo.location?.id && event.location?.id && eo.location.id === event.location.id) {
                return false;
              }
              return true;
            })
            .map((eo) => eo.organizer?.name || eo.location?.name)
            .filter((name): name is string => name != null)
            .join(", ");

          const imageSrc = event.image_url || event.location?.image_url || "";
          const startDayKey = format(startOfLocalDay(new Date(event.date)), "yyyy-MM-dd");
          const endDayKey = event.end_date ? format(startOfLocalDay(new Date(event.end_date)), "yyyy-MM-dd") : startDayKey;
          const isMultiDay = startDayKey !== endDayKey;

          const dateLabel =
            isMultiDay && event.end_date
              ? `Du ${formatDateWithoutTimezone(event.date, "EEE d MMM")} → ${formatDateWithoutTimezone(event.end_date, "EEE d MMM")}`
              : formatDateWithoutTimezone(event.date, "EEE d MMM");

          const timeLabel = (() => {
            const start = formatDateWithoutTimezone(event.date, "HH:mm");
            if (!event.end_date) return start;
            const end = formatDateWithoutTimezone(event.end_date, "HH:mm");
            return isMultiDay ? `${start} → ${end}` : `${start} - ${end}`;
          })();

          // Si multi-jours et durée > 20h : ne pas afficher les heures sur les visuels
          const showTime = (() => {
            if (!event.end_date) return true;
            const startMs = new Date(event.date).getTime();
            const endMs = new Date(event.end_date).getTime();
            if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return true;
            const hours = (endMs - startMs) / (1000 * 60 * 60);
            return !(isMultiDay && hours > 20);
          })();

          // IMPORTANT (rasterisation) : html-to-image gère mal les multi-line clamps (-webkit-line-clamp)
          // → on tronque en JS pour éviter que le bas des glyphes soit coupé.
          const truncateForImage = (text: string, maxChars: number) => {
            const clean = (text || "").replace(/\s+/g, " ").trim();
            if (clean.length <= maxChars) return clean;
            let out = clean.slice(0, maxChars);
            const lastSpace = out.lastIndexOf(" ");
            if (lastSpace > Math.floor(maxChars * 0.6)) out = out.slice(0, lastSpace);
            return out.replace(/[,\.;:!?-]+$/, "").trimEnd() + "…";
          };

          const titleText = truncateForImage(event.title, 64);

          return (
            <div
              key={event.id}
              data-event-id={event.id}
              ref={(el) => {
                imageRefs.current[event.id] = el;
              }}
              style={{
                width: `${SOCIAL_SQUARE.width}px`,
                height: `${SOCIAL_SQUARE.height}px`,
                backgroundColor: SOCIAL_SQUARE.backgroundColor,
                position: "relative",
                overflow: "hidden",
                fontFamily: "'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                boxSizing: "border-box",
                display: "flex",
                flexDirection: "column",
                margin: "0",
                padding: "0",
              }}
            >
              {/* Image avec overlays */}
              <div
                style={{
                  width: "100%",
                  height: "640px",
                  flexShrink: 0,
                  overflow: "hidden",
                  padding: "40px",
                  position: "relative",
                }}
              >
                {imageSrc ? (
                  <img
                    src={imageSrc}
                    alt={event.title}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: "block",
                      borderRadius: "12px",
                    }}
                    crossOrigin="anonymous"
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      borderRadius: "12px",
                      background:
                        "radial-gradient(1200px 800px at 10% 10%, #111827 0%, #0b1020 45%, #000000 100%)",
                    }}
                  />
                )}
                  {/* Catégorie et prix en overlay */}
                  <div style={{
                    position: "absolute",
                    top: "70px",
                    left: "70px",
                    display: "flex",
                    gap: "20px",
                    alignItems: "flex-start",
                    zIndex: 10,
                  }}>
                    {event.category_name && (
                      <div style={{
                        fontSize: "32px",
                        fontWeight: "700",
                        color: "#ffffff",
                        padding: "16px 32px",
                        backgroundColor: "rgba(0, 0, 0, 0.7)",
                        borderRadius: "12px",
                        backdropFilter: "blur(10px)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        lineHeight: "36px",
                        height: "68px",
                        minHeight: "68px",
                        margin: "0",
                      }}>
                        {event.category_name.name.toUpperCase()}
                      </div>
                    )}
                    {(event.price !== null && event.price !== undefined) && (
                      <div style={{
                        fontSize: "32px",
                        fontWeight: "700",
                        color: "#000000",
                        padding: "16px 32px",
                        backgroundColor: "#f0f0f0",
                        borderRadius: "12px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        lineHeight: "36px",
                        height: "68px",
                        minHeight: "68px",
                        margin: "0",
                      }}>
                        {event.price === 0 ? "GRATUIT" : `${event.price}€`}
                      </div>
                    )}
                  </div>
                  {/* Logo en haut à droite */}
                  <div style={{
                    position: "absolute",
                    top: "70px",
                    right: "70px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 10,
                  }}>
                    <div style={{
                      backgroundColor: "#f0f0f0",
                      borderRadius: "12px",
                      padding: "16px 24px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      height: "68px",
                      minHeight: "68px",
                    }}>
                      <img
                        src="/logo_posts_instas.png"
                        alt="Logo"
                        style={{
                          height: "36px",
                          width: "auto",
                          display: "block",
                        }}
                        crossOrigin="anonymous"
                      />
                    </div>
                  </div>
                </div>

              {/* Section inférieure avec détails */}
              <div style={{
                flex: 1,
                padding: "28px 40px 36px 40px",
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
                justifyContent: "flex-start",
                boxSizing: "border-box",
              }}>
                <h2
                  style={{
                    fontSize: "56px",
                    fontWeight: "800",
                    lineHeight: "1.25",
                    marginBottom: "18px",
                    marginTop: "0",
                    color: "#000000",
                    letterSpacing: "-0.02em",
                    padding: "0 0 10px 0", // évite coupe bas glyphes au raster
                    height: "auto",
                  }}
                >
                  {titleText}
                </h2>

                  {/* Tags, organisateurs/lieu et date - poussés en bas */}
                  <div style={{ marginTop: "auto" }}>
                    {(organizers || event.location) && (
                      <div style={{ 
                        marginBottom: "28px", 
                        display: "flex", 
                        alignItems: "center", 
                        gap: "14px", 
                        flexWrap: "wrap",
                      }}>
                        {organizers && (
                          <>
                            <svg 
                              width="28" 
                              height="28" 
                              viewBox="0 0 24 24" 
                              fill="none" 
                              stroke="#000000" 
                              strokeWidth="2" 
                              strokeLinecap="round" 
                              strokeLinejoin="round" 
                              style={{ 
                                flexShrink: 0,
                              }}
                            >
                              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                              <circle cx="9" cy="7" r="4" />
                              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                            </svg>
                            <span style={{ 
                              fontSize: "28px", 
                              color: "#000000", 
                              fontWeight: "500",
                              lineHeight: "1.4",
                            }}>
                              {organizers}
                            </span>
                            {event.location && <span style={{ fontSize: "28px", color: "#000000" }}> - </span>}
                          </>
                        )}
                        {event.location && (
                          <>
                            <svg 
                              width="28" 
                              height="28" 
                              viewBox="0 0 24 24" 
                              fill="none" 
                              stroke="#000000" 
                              strokeWidth="2" 
                              strokeLinecap="round" 
                              strokeLinejoin="round" 
                              style={{ 
                                flexShrink: 0,
                              }}
                            >
                              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                              <circle cx="12" cy="10" r="3" />
                            </svg>
                            <span style={{ 
                              fontSize: "28px", 
                              color: "#000000", 
                              fontWeight: "500",
                              lineHeight: "1.4",
                            }}>
                              {event.location.name}
                            </span>
                            {event.room && (
                              <>
                                <span style={{ fontSize: "28px", color: "#000000" }}> - </span>
                                <span style={{ 
                                  fontSize: "28px", 
                                  color: "#000000", 
                                  fontWeight: "500",
                                  lineHeight: "1.4",
                                }}>
                                  {event.room.name}
                                </span>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    )}
                    {event.event_tags && Array.isArray(event.event_tags) && event.event_tags.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginBottom: "28px" }}>
                        {event.event_tags.slice(0, 3).map((et: any, index: number) => (
                          <div key={et?.tag?.id || `tag-${index}`} style={{
                            fontSize: "22px",
                            fontWeight: "600",
                            color: "#000000",
                            padding: "12px 24px",
                            backgroundColor: "#f0f0f0",
                            borderRadius: "10px",
                          }}>
                            {et?.tag?.name || "Tag"}
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{ 
                    fontSize: "36px", 
                    color: "#1a202c", 
                    fontWeight: "700", 
                    display: "flex", 
                    alignItems: "center", 
                    gap: "14px",
                    marginLeft: "20px",
                  }}>
                    <svg 
                      width="32" 
                      height="32" 
                      viewBox="0 0 24 24" 
                      fill="none" 
                      stroke="#1a202c" 
                      strokeWidth="2" 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      style={{ 
                        flexShrink: 0,
                      }}
                    >
                      <path d="M8 2v4" />
                      <path d="M16 2v4" />
                      <rect width="18" height="18" x="3" y="4" rx="2" />
                      <path d="M3 10h18" />
                    </svg>
                    <span>{dateLabel}</span>
                    {showTime && (
                      <>
                    <span>|</span>
                    <svg 
                      width="32" 
                      height="32" 
                      viewBox="0 0 24 24" 
                      fill="none" 
                      stroke="#1a202c" 
                      strokeWidth="2" 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      style={{ 
                        flexShrink: 0,
                      }}
                    >
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                        <span>{timeLabel}</span>
                        </>
                      )}
                  </div>
                  </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

