"use client";

import * as React from "react";
import { Loader2, Trash2 } from "lucide-react";

import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { fromDatetimeLocal, toDatetimeLocal } from "@/lib/date-utils";
import { compressImage } from "@/lib/image-compression";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAlertDialog } from "@/hooks/use-alert-dialog";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/multi-select";
import { MultiSelectCreatable } from "@/components/ui/multi-select-creatable";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SelectSearchable } from "@/components/ui/select-searchable";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { EventFormOverviewCard } from "@/components/events/event-form-overview-card";

import { EventImageUpload } from "./event-image-upload";
import type { AdminEvent, CategoryOption, EventFormData, EventStatus, LocationData, OrganizerOption, RoomOption, TagOption } from "./types";

export type EventFormPrefill = Partial<{
  form: Partial<EventFormData>;
  organizerIds: string[];
  tagIds: string[];
}>;

export type EventFormSheetProps = {
  event: AdminEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locations: LocationData[];
  organizers: OrganizerOption[];
  tags: TagOption[];
  categories: CategoryOption[];
  defaultDate?: Date;
  prefill?: EventFormPrefill;
  onTagCreated?: () => void;
  onSaved?: (eventId: string) => void;
  onDeleted?: (eventId: string) => void;
};

function toDatetimeLocalFromLocalDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${da}T${h}:${mi}`;
}

function emptyForm(): EventFormData {
  return {
    title: "",
    description: "",
    date: "",
    end_date: "",
    category: "",
    price: "",
    presale_price: "",
    subscriber_price: "",
    capacity: "",
    is_full: false,
    location_id: "",
    room_id: "",
    door_opening_time: "",
    external_url: "",
    external_url_label: "",
    instagram_url: "",
    facebook_url: "",
    scraping_url: "",
    image_url: "",
    status: "pending",
  };
}

function StatusPicker({
  value,
  onChange,
  disabled,
}: {
  value: EventStatus;
  onChange: (s: EventStatus) => void;
  disabled?: boolean;
}) {
  const items: Array<{ value: EventStatus; label: string; dot: string }> = [
    { value: "pending", label: "Pending", dot: "bg-amber-500" },
    { value: "approved", label: "Approved", dot: "bg-emerald-500" },
    { value: "rejected", label: "Rejected", dot: "bg-red-500" },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it) => {
        const active = it.value === value;
        return (
          <Button
            key={it.value}
            type="button"
            variant={active ? "default" : "outline"}
            size="sm"
            disabled={disabled}
            className={cn("h-10 gap-2", !active && "bg-background")}
            onClick={() => onChange(it.value)}
          >
            <span className={cn("h-2.5 w-2.5 rounded-full", it.dot)} />
            {it.label}
          </Button>
        );
      })}
    </div>
  );
}

export function EventFormSheet({
  event,
  open,
  onOpenChange,
  locations,
  organizers,
  tags,
  categories,
  defaultDate,
  prefill,
  onTagCreated,
  onSaved,
  onDeleted,
}: EventFormSheetProps) {
  const isMobile = useIsMobile();
  const { showConfirm, AlertDialogComponent } = useAlertDialog();

  const [formData, setFormData] = React.useState<EventFormData>(() => emptyForm());
  const [selectedOrganizerIds, setSelectedOrganizerIds] = React.useState<string[]>([]);
  const [selectedTagIds, setSelectedTagIds] = React.useState<string[]>([]);

  const [rooms, setRooms] = React.useState<RoomOption[]>([]);
  const [loadingRooms, setLoadingRooms] = React.useState(false);

  const [showEndDate, setShowEndDate] = React.useState(false);

  const [imageFile, setImageFile] = React.useState<File | null>(null);
  const [imagePreview, setImagePreview] = React.useState<string | null>(event?.image_url || null);
  const [imageWasCleared, setImageWasCleared] = React.useState(false);

  const [saving, setSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const isEdit = Boolean(event && event.id);

  // init/reset when opening or event changes
  React.useEffect(() => {
    if (!open) return;

    setSaving(false);
    setDeleting(false);
    setRooms([]);
    setLoadingRooms(false);
    setImageFile(null);
    setImageWasCleared(false);

    if (event) {
      setFormData({
        title: event.title || "",
        description: event.description || "",
        date: toDatetimeLocal(event.date),
        end_date: event.end_date ? toDatetimeLocal(event.end_date) : "",
        category: event.category || "",
        price: event.price != null ? String(event.price) : "",
        presale_price: event.presale_price != null ? String(event.presale_price) : "",
        subscriber_price: event.subscriber_price != null ? String(event.subscriber_price) : "",
        capacity: event.capacity != null ? String(event.capacity) : "",
        is_full: Boolean(event.is_full),
        location_id: event.location_id || "",
        room_id: event.room_id || "",
        door_opening_time: event.door_opening_time || "",
        external_url: event.external_url || "",
        external_url_label: event.external_url_label || "",
        instagram_url: event.instagram_url || "",
        facebook_url: event.facebook_url || "",
        scraping_url: event.scraping_url || "",
        image_url: event.image_url || "",
        status: event.status || "pending",
      });

      const orgIds =
        event.event_organizers
          ?.map((eo) => eo.organizer?.id || eo.location?.id || null)
          .filter((id): id is string => Boolean(id)) || [];
      setSelectedOrganizerIds(orgIds);

      setSelectedTagIds(event.tag_ids || []);
      setImagePreview(event.image_url || null);
      setShowEndDate(Boolean(event.end_date));
      return;
    }

    const base = emptyForm();
    const defaultDt = (() => {
      if (!defaultDate) return "";
      const d = new Date(defaultDate);
      if (Number.isNaN(d.getTime())) return "";
      if (d.getHours() === 0 && d.getMinutes() === 0) {
        d.setHours(20, 0, 0, 0);
      }
      return toDatetimeLocalFromLocalDate(d);
    })();

    const merged: EventFormData = {
      ...base,
      ...(prefill?.form || {}),
      date: (prefill?.form?.date ?? base.date) || defaultDt,
    } as EventFormData;

    setFormData(merged);
    setSelectedOrganizerIds(prefill?.organizerIds || []);
    setSelectedTagIds(prefill?.tagIds || []);
    setImagePreview(merged.image_url ? merged.image_url : null);
    setShowEndDate(Boolean(merged.end_date));
  }, [open, event?.id]);

  // load rooms when location changes
  React.useEffect(() => {
    const locationId = formData.location_id;
    if (!open) return;
    if (!locationId) {
      setRooms([]);
      setFormData((prev) => ({ ...prev, room_id: "" }));
      return;
    }

    let cancelled = false;
    async function load() {
      setLoadingRooms(true);
      try {
        const { data, error } = await supabase
          .from("rooms")
          .select("id, name")
          .eq("location_id", locationId)
          .order("name", { ascending: true });
        if (error) throw error;
        if (!cancelled) {
          setRooms((data || []) as RoomOption[]);
        }
      } catch (e) {
        console.error("Erreur rooms:", e);
        if (!cancelled) setRooms([]);
      } finally {
        if (!cancelled) setLoadingRooms(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [formData.location_id, open]);

  // auto-fill capacity from location (only if empty)
  React.useEffect(() => {
    if (!open) return;
    if (!formData.location_id) return;
    if (formData.capacity) return;
    const loc = locations.find((l) => l.id === formData.location_id);
    if (loc?.capacity != null) {
      setFormData((prev) => ({ ...prev, capacity: String(loc.capacity ?? "") }));
    }
  }, [formData.location_id, locations, formData.capacity, open]);

  function handleOrganizerChange(newIds: string[]) {
    setSelectedOrganizerIds(newIds);

    // UX: si un organisateur est sélectionné, pré-remplir les réseaux sociaux (sans écraser si déjà rempli)
    if (newIds.length > 0) {
      const first = organizers.find((o) => o.id === newIds[0]);
      if (first) {
        setFormData((prev) => ({
          ...prev,
          instagram_url: prev.instagram_url || first.instagram_url || "",
          facebook_url: prev.facebook_url || first.facebook_url || "",
          ...(first.type === "location" ? { location_id: first.id } : null),
        }));
      }
    }
  }

  async function handleCreateTag(name: string): Promise<string | null> {
    try {
      const { data, error } = await supabase.from("tags").insert([{ name: name.trim() }]).select("id").single();
      if (error) throw error;
      onTagCreated?.();
      toast({ title: "Tag créé", description: name, variant: "success" });
      return data?.id ?? null;
    } catch (e: any) {
      console.error("Erreur création tag:", e);
      toast({
        title: "Création tag impossible",
        description: e?.message || "Une erreur est survenue.",
        variant: "destructive",
      });
      return null;
    }
  }

  async function uploadImageIfNeeded(): Promise<string | null> {
    if (!imageFile) return null;
    try {
      const compressedFile = await compressImage(imageFile, 2);
      const fileExt = compressedFile.name.split(".").pop() || "jpg";
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;

      const { data, error } = await supabase.storage.from("event-images").upload(fileName, compressedFile, {
        cacheControl: "3600",
        upsert: false,
      });

      if (error) throw error;

      const {
        data: { publicUrl },
      } = supabase.storage.from("event-images").getPublicUrl(data.path);

      return publicUrl;
    } catch (e: any) {
      console.error("Erreur upload image:", e);
      toast({
        title: "Upload image impossible",
        description: e?.message || "Vérifie le bucket `event-images`.",
        variant: "destructive",
      });
      return null;
    }
  }

  function normalizeUuid(value: string) {
    if (!value || value === "none") return null;
    return value;
  }

  function normalizeNullable(value: string) {
    return value.trim() ? value.trim() : null;
  }

  async function save({ forceApproved }: { forceApproved: boolean }) {
    if (saving) return;

    if (!formData.title.trim()) {
      toast({ title: "Titre requis", description: "Renseigne un titre.", variant: "destructive" });
      return;
    }
    if (!formData.date) {
      toast({ title: "Date requise", description: "Choisis une date de début.", variant: "destructive" });
      return;
    }
    if (!formData.category.trim()) {
      toast({ title: "Catégorie requise", description: "Choisis une catégorie.", variant: "destructive" });
      return;
    }

    if (formData.end_date && formData.date) {
      const startIso = fromDatetimeLocal(formData.date);
      const endIso = fromDatetimeLocal(formData.end_date);
      if (startIso && endIso) {
        const start = new Date(startIso);
        const end = new Date(endIso);
        if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end < start) {
          toast({
            title: "Date de fin invalide",
            description: "La date de fin ne peut pas être antérieure à la date de début.",
            variant: "destructive",
          });
          return;
        }
      }
    }

    setSaving(true);
    try {
      const uploadedUrl = await uploadImageIfNeeded();
      if (imageFile && !uploadedUrl) {
        setSaving(false);
        return;
      }

      const selectedLocation =
        formData.location_id && formData.location_id !== "none"
          ? locations.find((l) => l.id === formData.location_id) || null
          : null;

      const statusToSave: EventStatus = forceApproved ? "approved" : formData.status;

      const baseData: any = {
        title: formData.title.trim(),
        description: normalizeNullable(formData.description || ""),
        date: fromDatetimeLocal(formData.date) || formData.date,
        end_date: formData.end_date ? fromDatetimeLocal(formData.end_date) || null : null,
        category: formData.category,
        price: formData.price ? parseFloat(formData.price) : null,
        presale_price: formData.presale_price ? parseFloat(formData.presale_price) : null,
        subscriber_price: formData.subscriber_price ? parseFloat(formData.subscriber_price) : null,
        capacity: formData.capacity ? parseInt(formData.capacity) : null,
        is_full: Boolean(formData.is_full),
        location_id: normalizeUuid(formData.location_id),
        room_id: normalizeUuid(formData.room_id),
        door_opening_time: normalizeNullable(formData.door_opening_time),
        external_url: normalizeNullable(formData.external_url),
        external_url_label: normalizeNullable(formData.external_url_label),
        instagram_url: normalizeNullable(formData.instagram_url),
        facebook_url: normalizeNullable(formData.facebook_url),
        scraping_url: normalizeNullable(formData.scraping_url),
        status: statusToSave,
        tag_ids: selectedTagIds.length > 0 ? selectedTagIds : [],
        address: selectedLocation?.address || null,
        latitude: selectedLocation?.latitude || null,
        longitude: selectedLocation?.longitude || null,
      };

      // image url precedence: uploaded file > url field > cleared > keep existing
      const nextImageUrl = (() => {
        if (uploadedUrl) return uploadedUrl;
        if (formData.image_url.trim()) return formData.image_url.trim();
        if (imageWasCleared) return null;
        return event?.image_url || null;
      })();
      baseData.image_url = nextImageUrl;

      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id || null;

      let savedEventId: string;

      if (isEdit && event) {
        const { error } = await supabase.from("events").update(baseData).eq("id", event.id);
        if (error) throw error;
        savedEventId = event.id;
      } else {
        const { data: newEvent, error } = await supabase
          .from("events")
          .insert([{ ...baseData, created_by: userId }])
          .select("id")
          .single();
        if (error) throw error;
        savedEventId = newEvent.id;
      }

      // organizers: delete + insert (keeps constraint exactly-one)
      await supabase.from("event_organizers").delete().eq("event_id", savedEventId);

      if (selectedOrganizerIds.length > 0) {
        const organizerEntries = selectedOrganizerIds.map((id) => {
          const org = organizers.find((o) => o.id === id);
          return org?.type === "location"
            ? { event_id: savedEventId, location_id: id, organizer_id: null }
            : { event_id: savedEventId, organizer_id: id, location_id: null };
        });

        const { error: orgError } = await supabase.from("event_organizers").insert(organizerEntries);
        if (orgError) throw orgError;
      }

      toast({ title: "Événement enregistré", variant: "success" });
      onOpenChange(false);
      onSaved?.(savedEventId);
    } catch (e: any) {
      console.error("Erreur save event:", e);
      toast({
        title: "Enregistrement impossible",
        description: e?.message || "Une erreur est survenue.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!event) return;
    showConfirm({
      title: "Supprimer l’événement ?",
      description: "Cette action est irréversible.",
      variant: "destructive",
      confirmText: "Supprimer",
      cancelText: "Annuler",
      onConfirm: async () => {
        setDeleting(true);
        try {
          const { error } = await supabase.from("events").delete().eq("id", event.id);
          if (error) throw error;
          toast({ title: "Événement supprimé", variant: "success" });
          onOpenChange(false);
          onDeleted?.(event.id);
        } catch (e: any) {
          console.error("Erreur delete:", e);
          toast({
            title: "Suppression impossible",
            description: e?.message || "Une erreur est survenue.",
            variant: "destructive",
          });
        } finally {
          setDeleting(false);
        }
      },
    });
  }

  const locationOptions = React.useMemo(
    () => [
      { value: "", label: "Aucun lieu" },
      ...locations.map((l) => ({ value: l.id, label: l.name })),
    ],
    [locations],
  );

  const categoryOptions = React.useMemo(() => categories, [categories]);
  const organizerOptions = React.useMemo(
    () =>
      organizers.map((o) => ({
        value: o.id,
        label: `${o.name}${o.type === "location" ? " (Lieu)" : ""}`,
      })),
    [organizers],
  );
  const tagOptions = React.useMemo(() => tags.map((t) => ({ value: t.id, label: t.name })), [tags]);

  const side = isMobile ? "bottom" : "right";
  const selectedLocationLabel = locations.find((location) => location.id === formData.location_id)?.name;
  const selectedCategoryLabel = categories.find((category) => category.id === formData.category)?.name;
  const selectedOrganizerLabels = selectedOrganizerIds
    .map((id) => organizers.find((organizer) => organizer.id === id)?.name)
    .filter((value): value is string => Boolean(value));
  const missingRequired = [
    !formData.title.trim() ? "Titre" : null,
    !formData.date ? "Date" : null,
    !formData.category ? "Categorie" : null,
  ].filter((value): value is string => Boolean(value));
  const priceSummary = formData.price.trim() ? `${formData.price.trim()} EUR` : undefined;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side={side as any}
          className={cn(
            isMobile
              ? "h-[100dvh] p-0"
              : "w-full sm:w-[760px] lg:w-[920px] max-w-[100vw] p-0",
          )}
        >
          <div className="flex h-full flex-col">
            <div className="px-5 pt-5 pb-4 border-b">
              <SheetHeader className="space-y-1">
                <SheetTitle>{isEdit ? "Modifier l’événement" : "Créer un événement"}</SheetTitle>
                <SheetDescription>
                  {isEdit ? "Modifie les informations, puis enregistre." : "Crée un événement en quelques champs, le reste est optionnel."}
                </SheetDescription>
              </SheetHeader>
            </div>

            <div className="flex-1 overflow-auto px-5 py-5">
              <form
                className="space-y-6"
                onSubmit={(e) => {
                  e.preventDefault();
                  void save({ forceApproved: false });
                }}
              >
                <EventFormOverviewCard
                  title={formData.title}
                  categoryLabel={selectedCategoryLabel}
                  startDate={formData.date}
                  endDate={formData.end_date}
                  locationLabel={selectedLocationLabel}
                  organizerLabels={selectedOrganizerLabels}
                  tagsCount={selectedTagIds.length}
                  priceLabel={priceSummary}
                  hasImage={Boolean(imagePreview || formData.image_url.trim())}
                  missingRequired={missingRequired}
                />

                {/* Champs principaux */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="event-title">Titre</Label>
                    <Input
                      id="event-title"
                      value={formData.title}
                      onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
                      placeholder="Nom de l’événement"
                      required
                      className="h-11"
                      disabled={saving || deleting}
                    />
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Date de début</Label>
                      <DateTimePicker
                        value={formData.date}
                        onChange={(v) => setFormData((p) => ({ ...p, date: v }))}
                        placeholder="Choisir une date"
                        required
                        disabled={saving || deleting}
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Date de fin</Label>
                        {!showEndDate ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2"
                            onClick={() => setShowEndDate(true)}
                            disabled={saving || deleting}
                          >
                            Ajouter
                          </Button>
                        ) : null}
                      </div>
                      {showEndDate ? (
                        <DateTimePicker
                          value={formData.end_date}
                          onChange={(v) => setFormData((p) => ({ ...p, end_date: v }))}
                          placeholder="Optionnel"
                          disabled={saving || deleting}
                          allowClear
                        />
                      ) : (
                        <div className="h-11 rounded-md border bg-muted/20" />
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Lieu</Label>
                    <SelectSearchable
                      options={locationOptions}
                      value={formData.location_id}
                      onValueChange={(v) => setFormData((p) => ({ ...p, location_id: v, room_id: "" }))}
                      placeholder="Sélectionner un lieu"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Catégorie</Label>
                    <Select
                      value={formData.category || "none"}
                      onValueChange={(v) => setFormData((p) => ({ ...p, category: v === "none" ? "" : v }))}
                      disabled={saving || deleting}
                    >
                      <SelectTrigger className="h-11">
                        <SelectValue placeholder="Choisir une catégorie" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Choisir…</SelectItem>
                        {categoryOptions.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Image</Label>
                    <EventImageUpload
                      currentImageUrl={imagePreview}
                      onImageChange={(file, preview) => {
                        setImageFile(file);
                        setImagePreview(preview);
                        if (file) {
                          setImageWasCleared(false);
                          setFormData((p) => ({ ...p, image_url: "" }));
                        } else if (!preview) {
                          setImageWasCleared(true);
                          setFormData((p) => ({ ...p, image_url: "" }));
                        }
                      }}
                      onUrlChange={(url) => {
                        setFormData((p) => ({ ...p, image_url: url }));
                        setImagePreview(url || null);
                        if (url) {
                          setImageWasCleared(false);
                          setImageFile(null);
                        }
                      }}
                      disabled={saving || deleting}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Statut</Label>
                    <StatusPicker
                      value={formData.status}
                      onChange={(s) => setFormData((p) => ({ ...p, status: s }))}
                      disabled={saving || deleting}
                    />
                  </div>
                </div>

                {/* Détails complémentaires */}
                <Card className="p-4">
                  <div className="space-y-0.5">
                    <div className="text-sm font-semibold">Détails complémentaires</div>
                    <div className="text-xs text-muted-foreground">
                      Description, tags, organisateurs, prix, liens, salle et paramètres complémentaires.
                    </div>
                  </div>

                  <div className="mt-4 space-y-4">
                    <div className="space-y-2">
                      <Label>Description</Label>
                      <Textarea
                        value={formData.description}
                        onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
                        placeholder="Détails, lineup, infos utiles…"
                        disabled={saving || deleting}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Tags</Label>
                      <MultiSelectCreatable
                        options={tagOptions}
                        selected={selectedTagIds}
                        onChange={setSelectedTagIds}
                        onCreate={handleCreateTag}
                        placeholder="Ajouter des tags"
                        disabled={saving || deleting}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Organisateurs</Label>
                      <MultiSelect
                        options={organizerOptions}
                        selected={selectedOrganizerIds}
                        onChange={handleOrganizerChange}
                        placeholder="Sélectionner…"
                        disabled={saving || deleting}
                      />
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="space-y-2">
                        <Label>Prix</Label>
                        <Input
                          type="number"
                          inputMode="decimal"
                          value={formData.price}
                          onChange={(e) => setFormData((p) => ({ ...p, price: e.target.value }))}
                          disabled={saving || deleting}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Prévente</Label>
                        <Input
                          type="number"
                          inputMode="decimal"
                          value={formData.presale_price}
                          onChange={(e) => setFormData((p) => ({ ...p, presale_price: e.target.value }))}
                          disabled={saving || deleting}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Abonné</Label>
                        <Input
                          type="number"
                          inputMode="decimal"
                          value={formData.subscriber_price}
                          onChange={(e) => setFormData((p) => ({ ...p, subscriber_price: e.target.value }))}
                          disabled={saving || deleting}
                        />
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Capacité</Label>
                        <Input
                          type="number"
                          inputMode="numeric"
                          value={formData.capacity}
                          onChange={(e) => setFormData((p) => ({ ...p, capacity: e.target.value }))}
                          disabled={saving || deleting}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Complet</Label>
                        <div className="flex items-center justify-between rounded-lg border px-4 h-11">
                          <span className="text-sm text-muted-foreground">Sold out</span>
                          <Switch
                            checked={formData.is_full}
                            onCheckedChange={(v) => setFormData((p) => ({ ...p, is_full: v }))}
                            disabled={saving || deleting}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>URL externe</Label>
                        <Input
                          type="url"
                          value={formData.external_url}
                          onChange={(e) => setFormData((p) => ({ ...p, external_url: e.target.value }))}
                          disabled={saving || deleting}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Label URL</Label>
                        <Input
                          value={formData.external_url_label}
                          onChange={(e) => setFormData((p) => ({ ...p, external_url_label: e.target.value }))}
                          disabled={saving || deleting}
                        />
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Instagram</Label>
                        <Input
                          type="url"
                          value={formData.instagram_url}
                          onChange={(e) => setFormData((p) => ({ ...p, instagram_url: e.target.value }))}
                          disabled={saving || deleting}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Facebook</Label>
                        <Input
                          type="url"
                          value={formData.facebook_url}
                          onChange={(e) => setFormData((p) => ({ ...p, facebook_url: e.target.value }))}
                          disabled={saving || deleting}
                        />
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Salle</Label>
                        <Select
                          value={formData.room_id || "none"}
                          onValueChange={(v) => setFormData((p) => ({ ...p, room_id: v === "none" ? "" : v }))}
                          disabled={saving || deleting || !formData.location_id || loadingRooms}
                        >
                          <SelectTrigger className="h-11">
                            <SelectValue placeholder={loadingRooms ? "Chargement..." : "Optionnel"} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Aucune</SelectItem>
                            {rooms.map((r) => (
                              <SelectItem key={r.id} value={r.id}>
                                {r.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Heure ouverture portes</Label>
                        <Input
                          type="time"
                          step={60}
                          value={formData.door_opening_time}
                          onChange={(e) => setFormData((p) => ({ ...p, door_opening_time: e.target.value }))}
                          disabled={saving || deleting}
                          className="h-11"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>URL scraping</Label>
                      <Input
                        type="url"
                        value={formData.scraping_url}
                        onChange={(e) => setFormData((p) => ({ ...p, scraping_url: e.target.value }))}
                        disabled={saving || deleting}
                        className="h-11"
                      />
                    </div>
                  </div>
                </Card>
              </form>
            </div>

            {/* actions sticky */}
            <div className={cn("border-t bg-background p-4", isMobile && "pb-[calc(1rem+env(safe-area-inset-bottom))]")}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                {isEdit ? (
                  <Button
                    type="button"
                    variant="destructive"
                    className="gap-2"
                    onClick={() => void confirmDelete()}
                    disabled={saving || deleting}
                  >
                    {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    Supprimer
                  </Button>
                ) : (
                  <div />
                )}

                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onOpenChange(false)}
                    disabled={saving || deleting}
                  >
                    Fermer
                  </Button>
                  <Button type="button" onClick={() => void save({ forceApproved: false })} disabled={saving || deleting}>
                    {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    Enregistrer
                  </Button>
                  <Button
                    type="button"
                    className="bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => void save({ forceApproved: true })}
                    disabled={saving || deleting}
                  >
                    {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    Enregistrer & Approuver
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialogComponent />
    </>
  );
}

