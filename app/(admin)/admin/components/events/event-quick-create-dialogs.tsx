"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { supabase } from "@/lib/supabase/client";
import type { TablesInsert } from "@/lib/supabase/database.types";
import { AddressInput } from "@/components/ui/address-input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";
import { EntitySwitchRow } from "../directory/entity-sheet";
import type { ArtistOption, LocationData, OrganizerOption } from "./types";

/* Création rapide de lieux, organisateurs et artistes depuis le formulaire
   d'événement, sans le quitter. Chaque fenêtre renvoie la fiche créée. */

function QuickCreateShell({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  busy,
  onSubmit,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  submitLabel: string;
  busy: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => (busy ? undefined : onOpenChange(next))}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={onSubmit}>
          {children}
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Annuler
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function reportCreationError(entity: string, error: any) {
  console.error(`Erreur création ${entity}:`, error);
  toast({
    title: `Création impossible`,
    description: error?.message || "Une erreur est survenue.",
    variant: "destructive",
  });
}

/* ------------------------------------------------------------------ */
/* Lieu                                                                */
/* ------------------------------------------------------------------ */

export function QuickLocationDialog({
  open,
  onOpenChange,
  defaultName,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultName: string;
  onCreated: (location: LocationData, isOrganizer: boolean) => void;
}) {
  const [form, setForm] = React.useState({
    name: "",
    address: "",
    latitude: "",
    longitude: "",
    capacity: "",
    is_organizer: false,
  });
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setForm({ name: defaultName, address: "", latitude: "", longitude: "", capacity: "", is_organizer: false });
  }, [open, defaultName]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      // TODO(types): address est NOT NULL dans les migrations ; ce formulaire envoie null s'il est vide.
      const { data, error } = await supabase
        .from("locations")
        .insert([
          {
            name: form.name.trim(),
            address: form.address.trim() || null,
            latitude: form.latitude.trim() ? Number.parseFloat(form.latitude.trim()) : null,
            longitude: form.longitude.trim() ? Number.parseFloat(form.longitude.trim()) : null,
            capacity: form.capacity.trim() ? parseInt(form.capacity, 10) : null,
            is_organizer: form.is_organizer,
          },
        ] as TablesInsert<"locations">[])
        .select("id, name, address, capacity, latitude, longitude")
        .single();
      if (error) throw error;
      onCreated(data as LocationData, form.is_organizer);
      toast({ title: "Lieu créé", description: form.name.trim(), variant: "success" });
      onOpenChange(false);
    } catch (error) {
      reportCreationError("lieu", error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <QuickCreateShell
      open={open}
      onOpenChange={onOpenChange}
      title="Nouveau lieu"
      description="Il sera sélectionné pour cet événement. Tu pourras compléter sa fiche plus tard."
      submitLabel="Créer le lieu"
      busy={busy}
      onSubmit={handleSubmit}
    >
      <div className="space-y-2">
        <Label htmlFor="quick-location-name">Nom</Label>
        <Input
          id="quick-location-name"
          value={form.name}
          onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
          placeholder="Nom du lieu"
          required
          autoFocus
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="quick-location-address">Adresse</Label>
        <AddressInput
          id="quick-location-address"
          value={form.address}
          onChange={(address) => setForm((current) => ({ ...current, address }))}
          onAddressSelect={(address, coordinates) =>
            setForm((current) => ({
              ...current,
              address,
              latitude: coordinates?.latitude?.toString() || "",
              longitude: coordinates?.longitude?.toString() || "",
            }))
          }
          placeholder="Commencez à taper une adresse…"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="quick-location-capacity">Capacité</Label>
        <Input
          id="quick-location-capacity"
          type="number"
          min="0"
          inputMode="numeric"
          value={form.capacity}
          onChange={(event) => setForm((current) => ({ ...current, capacity: event.target.value }))}
          placeholder="Nombre de places"
        />
      </div>
      <EntitySwitchRow
        id="quick-location-organizer"
        title="Aussi organisateur"
        description="Le lieu pourra être choisi comme organisateur."
        checked={form.is_organizer}
        onCheckedChange={(checked) => setForm((current) => ({ ...current, is_organizer: checked }))}
      />
    </QuickCreateShell>
  );
}

/* ------------------------------------------------------------------ */
/* Organisateur                                                        */
/* ------------------------------------------------------------------ */

export function QuickOrganizerDialog({
  open,
  onOpenChange,
  defaultName,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultName: string;
  onCreated: (organizer: OrganizerOption) => void;
}) {
  const [form, setForm] = React.useState({ name: "", instagram_url: "", facebook_url: "" });
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setForm({ name: defaultName, instagram_url: "", facebook_url: "" });
  }, [open, defaultName]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("organizers")
        .insert([
          {
            name: form.name.trim(),
            instagram_url: form.instagram_url.trim() || null,
            facebook_url: form.facebook_url.trim() || null,
          },
        ])
        .select("id, name, instagram_url, facebook_url")
        .single();
      if (error) throw error;
      onCreated({ ...(data as Omit<OrganizerOption, "type">), type: "organizer" });
      toast({ title: "Organisateur créé", description: form.name.trim(), variant: "success" });
      onOpenChange(false);
    } catch (error) {
      reportCreationError("organisateur", error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <QuickCreateShell
      open={open}
      onOpenChange={onOpenChange}
      title="Nouvel organisateur"
      description="Il sera ajouté aux organisateurs de cet événement."
      submitLabel="Créer l’organisateur"
      busy={busy}
      onSubmit={handleSubmit}
    >
      <div className="space-y-2">
        <Label htmlFor="quick-organizer-name">Nom</Label>
        <Input
          id="quick-organizer-name"
          value={form.name}
          onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
          placeholder="Nom de l’organisateur"
          required
          autoFocus
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="quick-organizer-instagram">Instagram</Label>
          <Input
            id="quick-organizer-instagram"
            type="url"
            value={form.instagram_url}
            onChange={(event) => setForm((current) => ({ ...current, instagram_url: event.target.value }))}
            placeholder="https://instagram.com/…"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="quick-organizer-facebook">Facebook</Label>
          <Input
            id="quick-organizer-facebook"
            type="url"
            value={form.facebook_url}
            onChange={(event) => setForm((current) => ({ ...current, facebook_url: event.target.value }))}
            placeholder="https://facebook.com/…"
          />
        </div>
      </div>
    </QuickCreateShell>
  );
}

/* ------------------------------------------------------------------ */
/* Artiste                                                             */
/* ------------------------------------------------------------------ */

export function QuickArtistDialog({
  open,
  onOpenChange,
  defaultName,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultName: string;
  onCreated: (artist: ArtistOption) => void;
}) {
  const [form, setForm] = React.useState({
    name: "",
    artist_type_label: "",
    origin_city: "",
    short_description: "",
    instagram_url: "",
    website_url: "",
  });
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setForm({
      name: defaultName,
      artist_type_label: "",
      origin_city: "",
      short_description: "",
      instagram_url: "",
      website_url: "",
    });
  }, [open, defaultName]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      // TODO(types): slug (NOT NULL) est rempli par le trigger assign_artist_slug, l'Insert généré l'exige.
      const { data, error } = await supabase
        .from("artists")
        .insert([
          {
            name: form.name.trim(),
            artist_type_label: form.artist_type_label.trim() || null,
            origin_city: form.origin_city.trim() || null,
            short_description: form.short_description.trim() || null,
            instagram_url: form.instagram_url.trim() || null,
            website_url: form.website_url.trim() || null,
            created_by: user?.id || null,
          },
        ] as TablesInsert<"artists">[])
        .select("id, name, slug, image_url, origin_city")
        .single();
      if (error) throw error;
      onCreated(data as ArtistOption);
      toast({ title: "Artiste créé", description: form.name.trim(), variant: "success" });
      onOpenChange(false);
    } catch (error) {
      reportCreationError("artiste", error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <QuickCreateShell
      open={open}
      onOpenChange={onOpenChange}
      title="Nouvel artiste"
      description="Il sera ajouté à la programmation de cet événement."
      submitLabel="Créer l’artiste"
      busy={busy}
      onSubmit={handleSubmit}
    >
      <div className="space-y-2">
        <Label htmlFor="quick-artist-name">Nom</Label>
        <Input
          id="quick-artist-name"
          value={form.name}
          onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
          placeholder="Nom de scène, groupe, collectif…"
          required
          autoFocus
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="quick-artist-type">Type</Label>
          <Input
            id="quick-artist-type"
            value={form.artist_type_label}
            onChange={(event) => setForm((current) => ({ ...current, artist_type_label: event.target.value }))}
            placeholder="DJ, Groupe…"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="quick-artist-city">Ville d’origine</Label>
          <Input
            id="quick-artist-city"
            value={form.origin_city}
            onChange={(event) => setForm((current) => ({ ...current, origin_city: event.target.value }))}
            placeholder="Orléans, Paris…"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="quick-artist-description">Description courte</Label>
        <Textarea
          id="quick-artist-description"
          value={form.short_description}
          onChange={(event) => setForm((current) => ({ ...current, short_description: event.target.value }))}
          rows={3}
          placeholder="Quelques lignes de présentation"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="quick-artist-instagram">Instagram</Label>
          <Input
            id="quick-artist-instagram"
            type="url"
            value={form.instagram_url}
            onChange={(event) => setForm((current) => ({ ...current, instagram_url: event.target.value }))}
            placeholder="https://instagram.com/…"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="quick-artist-website">Site web</Label>
          <Input
            id="quick-artist-website"
            type="url"
            value={form.website_url}
            onChange={(event) => setForm((current) => ({ ...current, website_url: event.target.value }))}
            placeholder="https://…"
          />
        </div>
      </div>
    </QuickCreateShell>
  );
}
