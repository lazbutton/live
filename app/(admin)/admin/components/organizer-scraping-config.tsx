"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Save, Plus, Trash2, Code, Globe, Sparkles, Play, Loader2 } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/components/ui/use-toast";
import { Progress } from "@/components/ui/progress";

interface ScrapingConfig {
  id: string;
  organizer_id: string | null;
  location_id: string | null;
  event_field: string;
  css_selector: string;
  attribute: string | null;
  transform_function: string | null;
  text_prefix: string | null;
}

interface AIField {
  id: string;
  organizer_id: string | null;
  location_id: string | null;
  field_name: string;
  enabled: boolean;
  ai_hint: string | null;
}

interface AgendaScrapingConfig {
  id: string;
  organizer_id: string | null;
  location_id: string | null;
  enabled: boolean;
  agenda_url: string;
  event_link_selector: string;
  event_link_attribute: string;
  next_page_selector: string | null;
  next_page_attribute: string;
  max_pages: number;
}

const EVENT_FIELDS = [
  { value: "title", label: "Titre" },
  { value: "description", label: "Description" },
  { value: "date", label: "Date de début" },
  { value: "end_date", label: "Date de fin" },
  { value: "price", label: "Prix" },
  { value: "presale_price", label: "Tarif prévente" },
  { value: "subscriber_price", label: "Tarif abonné" },
  { value: "location", label: "Lieu" },
  { value: "address", label: "Adresse" },
  { value: "image_url", label: "Image" },
  { value: "organizer", label: "Organisateur" },
  { value: "category", label: "Catégorie" },
  { value: "capacity", label: "Capacité" },
  { value: "door_opening_time", label: "Heure d'ouverture" },
  { value: "is_full", label: "Événement complet" },
];

const ATTRIBUTE_OPTIONS = [
  { value: "textContent", label: "Texte (textContent)" },
  { value: "innerHTML", label: "HTML (innerHTML)" },
  { value: "href", label: "Lien (href)" },
  { value: "src", label: "Image (src)" },
  { value: "datetime", label: "Date/Heure (datetime)" },
  { value: "data-date", label: "Date (data-date)" },
  { value: "data-price", label: "Prix (data-price)" },
  { value: "value", label: "Valeur (value)" },
];

const TRANSFORM_OPTIONS = [
  { value: null, label: "Aucune" },
  { value: "date", label: "Date (convertir en ISO)" },
  { value: "price", label: "Prix (extraire nombre)" },
  { value: "url", label: "URL (normaliser)" },
  { value: "text", label: "Texte (nettoyer)" },
];

interface OrganizerScrapingConfigProps {
  organizerId?: string;
  locationId?: string;
  organizerName: string;
  scrapingExampleUrl: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isPageMode?: boolean; // Si true, ne pas utiliser Dialog mais afficher directement
}

const AI_FIELD_OPTIONS = [
  { value: "title", label: "Titre" },
  { value: "description", label: "Description" },
  { value: "date", label: "Date de début" },
  { value: "end_date", label: "Date de fin" },
  { value: "price", label: "Prix" },
  { value: "presale_price", label: "Tarif prévente" },
  { value: "subscriber_price", label: "Tarif abonné" },
  { value: "location", label: "Lieu" },
  { value: "address", label: "Adresse" },
  { value: "image_url", label: "Image" },
  { value: "organizer", label: "Organisateur" },
  { value: "category", label: "Catégorie" },
  { value: "tags", label: "Tags" },
  { value: "capacity", label: "Capacité" },
  { value: "door_opening_time", label: "Heure d'ouverture" },
  { value: "is_full", label: "Événement complet" },
];

export function OrganizerScrapingConfig({
  organizerId,
  locationId,
  organizerName,
  scrapingExampleUrl,
  open,
  onOpenChange,
  isPageMode = false,
}: OrganizerScrapingConfigProps) {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const [configs, setConfigs] = useState<ScrapingConfig[]>([]);
  const [aiFields, setAiFields] = useState<AIField[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingAiFields, setSavingAiFields] = useState(false);
  const [scrapingProgress, setScrapingProgress] = useState({
    isActive: false,
    discovered: 0,
    created: 0,
    enriched: 0,
    errors: 0,
    total: 0,
    current: 0,
  });
  const [newConfig, setNewConfig] = useState({
    event_field: "",
    css_selector: "",
    attribute: "textContent",
    transform_function: null as string | null,
    text_prefix: "",
  });
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [editingConfigId, setEditingConfigId] = useState<string | null>(null);
  const [pendingHints, setPendingHints] = useState<Record<string, string>>({});
  const [savingHints, setSavingHints] = useState<Record<string, boolean>>({});

  const [agendaConfigs, setAgendaConfigs] = useState<AgendaScrapingConfig[]>([]);
  const [agendaLoading, setAgendaLoading] = useState(true);
  const [savingAgenda, setSavingAgenda] = useState(false);
  const [isAgendaModalOpen, setIsAgendaModalOpen] = useState(false);
  const [editingAgendaId, setEditingAgendaId] = useState<string | null>(null);
  const [scrapingAgenda, setScrapingAgenda] = useState(false);
  const [maxEventsToScrape, setMaxEventsToScrape] = useState<string>("50");
  const [agendaForm, setAgendaForm] = useState({
    enabled: true,
    agenda_url: "",
    event_link_selector: "",
    event_link_attribute: "href",
    next_page_selector: "",
    next_page_attribute: "href",
    max_pages: 10,
  });

  const id = organizerId || locationId;

  useEffect(() => {
    if (open && id) {
      loadConfigs();
      loadAIFields();
      loadAgendaConfigs();
    }
  }, [open, id]);

  async function loadConfigs() {
    if (!id) return;
    
    try {
      setLoading(true);
      let query = supabase
        .from("organizer_scraping_configs")
        .select("*");
      
      if (organizerId) {
        query = query.eq("organizer_id", organizerId);
      } else if (locationId) {
        query = query.eq("location_id", locationId);
      }
      
      const { data, error } = await query.order("event_field");

      if (error) throw error;
      setConfigs(data || []);
    } catch (error) {
      console.error("Erreur lors du chargement des configurations:", error);
      alert("Erreur lors du chargement des configurations");
    } finally {
      setLoading(false);
    }
  }

  async function loadAgendaConfigs() {
    if (!id) return;

    try {
      setAgendaLoading(true);
      let query = supabase
        .from("organizer_agenda_scraping_configs")
        .select("*");

      if (organizerId) {
        query = query.eq("organizer_id", organizerId);
      } else if (locationId) {
        query = query.eq("location_id", locationId);
      }

      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) {
        console.error("Erreur Supabase:", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        throw error;
      }

      setAgendaConfigs((data || []) as any);
    } catch (error: any) {
      console.error("Erreur lors du chargement des configurations d'agenda:", {
        error,
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        code: error?.code,
      });
      alert(`Erreur lors du chargement des configurations d'agenda: ${error?.message || "Erreur inconnue"}`);
    } finally {
      setAgendaLoading(false);
    }
  }

  async function saveAgendaConfig() {
    if (!id) return;
    if (!agendaForm.agenda_url.trim() || !agendaForm.event_link_selector.trim()) {
      alert("Veuillez renseigner au minimum l'URL d'agenda et le sélecteur des liens d'événements.");
      return;
    }

    try {
      setSavingAgenda(true);

      const payload: any = {
        enabled: !!agendaForm.enabled,
        agenda_url: agendaForm.agenda_url.trim(),
        event_link_selector: agendaForm.event_link_selector.trim(),
        event_link_attribute: (agendaForm.event_link_attribute || "href").trim() || "href",
        next_page_selector: agendaForm.next_page_selector?.trim() ? agendaForm.next_page_selector.trim() : null,
        next_page_attribute: (agendaForm.next_page_attribute || "href").trim() || "href",
        max_pages: Number.isFinite(Number(agendaForm.max_pages)) ? Math.max(1, Math.min(200, Number(agendaForm.max_pages))) : 10,
      };

      if (editingAgendaId) {
        const { error } = await supabase
          .from("organizer_agenda_scraping_configs")
          .update(payload)
          .eq("id", editingAgendaId);
        if (error) throw error;
      } else {
        const insertPayload = {
          ...payload,
          organizer_id: organizerId || null,
          location_id: locationId || null,
        };

        const { error } = await supabase
          .from("organizer_agenda_scraping_configs")
          .insert([insertPayload]);
        if (error) throw error;
      }

      setIsAgendaModalOpen(false);
      setEditingAgendaId(null);
      setAgendaForm({
        enabled: true,
        agenda_url: "",
        event_link_selector: "",
        event_link_attribute: "href",
        next_page_selector: "",
        next_page_attribute: "href",
        max_pages: 10,
      });

      await loadAgendaConfigs();
    } catch (error) {
      console.error("Erreur lors de la sauvegarde de la configuration d'agenda:", error);
      alert("Erreur lors de la sauvegarde de la configuration d'agenda");
    } finally {
      setSavingAgenda(false);
    }
  }

  async function deleteAgendaConfig(configId: string) {
    if (!confirm("Supprimer cette configuration d'agenda ?")) return;
    try {
      const { error } = await supabase
        .from("organizer_agenda_scraping_configs")
        .delete()
        .eq("id", configId);
      if (error) throw error;
      await loadAgendaConfigs();
    } catch (error) {
      console.error("Erreur lors de la suppression de la configuration d'agenda:", error);
      alert("Erreur lors de la suppression");
    }
  }

  async function loadAIFields() {
    if (!id) {
      console.warn("loadAIFields: id manquant");
      return;
    }
    
    if (!organizerId && !locationId) {
      console.warn("loadAIFields: organizerId et locationId manquants");
      return;
    }
    
    try {
      setLoading(true);
      let query = supabase
        .from("organizer_ai_fields")
        .select("*");
      
      if (organizerId) {
        query = query.eq("organizer_id", organizerId).is("location_id", null);
      } else if (locationId) {
        query = query.eq("location_id", locationId).is("organizer_id", null);
      }
      
      const { data, error } = await query.order("field_name");

      if (error) {
        console.error("Erreur Supabase lors du chargement des champs IA:", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        throw error;
      }
      
      // Si aucun champ n'est configuré, initialiser avec tous les champs activés
      if (!data || data.length === 0) {
        console.log("Aucun champ IA configuré, initialisation avec les valeurs par défaut");
        
        // S'assurer que les valeurs sont bien null et non des chaînes vides
        const orgId = organizerId && organizerId.trim() !== "" ? organizerId : null;
        const locId = locationId && locationId.trim() !== "" ? locationId : null;
        
        // Vérifier que exactement un des deux est défini (contrainte de la table)
        if (!orgId && !locId) {
          console.error("Erreur: organizerId et locationId sont tous les deux vides ou null");
          throw new Error("Un organisateur ou un lieu doit être spécifié pour initialiser les champs IA");
        }
        
        const defaultFields = AI_FIELD_OPTIONS.map(field => ({
          organizer_id: orgId,
          location_id: locId,
          field_name: field.value,
          enabled: true,
          ai_hint: null,
        }));
        
        // Essayer d'insérer les champs par défaut
        const { data: inserted, error: insertError } = await supabase
          .from("organizer_ai_fields")
          .insert(defaultFields)
          .select();
        
        if (insertError) {
          // Logger l'erreur complète pour diagnostic
          console.error("Erreur Supabase lors de l'insertion des champs IA par défaut:");
          console.error("  - Message:", insertError?.message || 'Aucun message');
          console.error("  - Code:", insertError?.code || 'Aucun code');
          console.error("  - Détails:", insertError?.details || 'Aucun détail');
          console.error("  - Indice:", insertError?.hint || 'Aucun indice');
          console.error("  - Organizer ID:", orgId);
          console.error("  - Location ID:", locId);
          console.error("  - Nombre de champs:", defaultFields.length);
          console.error("  - Erreur complète:", JSON.stringify(insertError, null, 2));
          
          // Si c'est une erreur de contrainte unique (23505), les champs existent déjà
          // Recharger les données existantes au lieu de lever une erreur
          if (insertError?.code === '23505') {
            console.log("Des champs existent déjà (contrainte unique), rechargement des données...");
            let reloadQuery = supabase
              .from("organizer_ai_fields")
              .select("*");
            
            if (orgId) {
              reloadQuery = reloadQuery.eq("organizer_id", orgId).is("location_id", null);
            } else if (locId) {
              reloadQuery = reloadQuery.eq("location_id", locId).is("organizer_id", null);
            }
            
            const { data: existingData, error: reloadError } = await reloadQuery.order("field_name");
            if (!reloadError && existingData && existingData.length > 0) {
              console.log(`${existingData.length} champs IA trouvés et chargés`);
              setAiFields(existingData);
              return; // Sortir sans erreur
            }
          }
          
          // Pour les autres erreurs, continuer à les lever
          throw insertError;
        }
        
        if (inserted && inserted.length > 0) {
          console.log(`${inserted.length} champs IA créés avec succès`);
          setAiFields(inserted);
        } else {
          // Si aucun résultat mais pas d'erreur, recharger pour être sûr
          console.warn("Insertion réussie mais aucun résultat retourné, rechargement...");
          const { data: reloaded, error: reloadErr } = await query.order("field_name");
          if (!reloadErr && reloaded) {
            setAiFields(reloaded);
          }
        }
      } else {
        setAiFields(data || []);
      }
    } catch (error: any) {
      console.error("Erreur lors du chargement des champs IA:", {
        error,
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        code: error?.code,
        stack: error?.stack
      });
      alert(`Erreur lors du chargement des champs IA: ${error?.message || "Erreur inconnue"}`);
    } finally {
      setLoading(false);
    }
  }

  async function toggleAIField(fieldName: string, enabled: boolean) {
    if (!id) return;
    
    try {
      setSavingAiFields(true);
      
      // Trouver le champ existant
      const existingField = aiFields.find(f => f.field_name === fieldName);
      
      if (existingField) {
        // Mettre à jour
        const { error } = await supabase
          .from("organizer_ai_fields")
          .update({ enabled })
          .eq("id", existingField.id);
        
        if (error) throw error;
        
        setAiFields(prev => prev.map(f => 
          f.id === existingField.id ? { ...f, enabled } : f
        ));
      } else {
        // Créer
        const fieldData: any = {
          field_name: fieldName,
          enabled,
        };
        
        if (organizerId) {
          fieldData.organizer_id = organizerId;
          fieldData.location_id = null;
        } else if (locationId) {
          fieldData.location_id = locationId;
          fieldData.organizer_id = null;
        }
        
        const { data, error } = await supabase
          .from("organizer_ai_fields")
          .insert([fieldData])
          .select()
          .single();
        
        if (error) throw error;
        
        setAiFields(prev => [...prev, data]);
      }
    } catch (error: any) {
      console.error("Erreur lors de la mise à jour du champ IA:", error);
      alert(`Erreur: ${error?.message || "Erreur inconnue"}`);
    } finally {
      setSavingAiFields(false);
    }
  }

  async function saveAIHint(fieldName: string, hint: string) {
    if (!id) return;
    
    // Trouver le champ existant
    const existingField = aiFields.find(f => f.field_name === fieldName);
    
    const hintValue = hint.trim() || null;
    
    if (existingField) {
      // Mettre à jour
      const { error } = await supabase
        .from("organizer_ai_fields")
        .update({ ai_hint: hintValue })
        .eq("id", existingField.id);
      
      if (error) throw error;
      
      setAiFields(prev => prev.map(f => 
        f.id === existingField.id ? { ...f, ai_hint: hintValue } : f
      ));
    } else {
      // Créer
      const fieldData: any = {
        field_name: fieldName,
        enabled: true,
        ai_hint: hintValue,
      };
      
      if (organizerId) {
        fieldData.organizer_id = organizerId;
        fieldData.location_id = null;
      } else if (locationId) {
        fieldData.location_id = locationId;
        fieldData.organizer_id = null;
      }
      
      const { data, error } = await supabase
        .from("organizer_ai_fields")
        .insert([fieldData])
        .select()
        .single();
      
      if (error) throw error;
      
      setAiFields(prev => [...prev, data]);
    }
  }

  function getHintPlaceholder(fieldName: string): string {
    const placeholders: Record<string, string> = {
      title: "Le titre se trouve dans la balise h1",
      description: "La description est dans la section avec la classe 'description'",
      date: "La date est au format DD/MM/YYYY HH:mm",
      end_date: "La date de fin est toujours après le texte 'Fin:'",
      price: "Le prix est toujours écrit en gras, extraire uniquement le nombre",
      location: "Le lieu est mentionné après 'Lieu:'",
      address: "L'adresse complète se trouve dans le footer",
      image_url: "L'image principale est toujours la première image du carousel",
      organizer: "L'organisateur est mentionné en bas de page",
      category: "La catégorie correspond toujours au premier tag de la page",
      tags: "Les tags sont dans la section avec la classe 'tags'",
      capacity: "La capacité est mentionnée après 'Capacité:'",
      door_opening_time: "L'heure d'ouverture est toujours au format HH:mm",
    };
    return placeholders[fieldName] || "Ajoutez des instructions spécifiques pour ce champ";
  }

  async function saveConfig(config: Partial<ScrapingConfig>) {
    if (!id) return;
    
    try {
      setSaving(true);
      const configData: any = {
        event_field: config.event_field,
        css_selector: config.css_selector,
        attribute: config.attribute || "textContent",
        transform_function: config.transform_function || null,
        text_prefix: config.text_prefix && config.text_prefix.trim() !== "" ? config.text_prefix.trim() : null,
      };
      
      if (organizerId) {
        configData.organizer_id = organizerId;
        configData.location_id = null;
      } else if (locationId) {
        configData.location_id = locationId;
        configData.organizer_id = null;
      }

      if (editingConfigId) {
        // Mise à jour
        const { error } = await supabase
          .from("organizer_scraping_configs")
          .update(configData)
          .eq("id", editingConfigId);
        if (error) throw error;
      } else {
        // Création - Vérifier si une config existe déjà pour ce champ
        let existingQuery = supabase
          .from("organizer_scraping_configs")
          .select("*")
          .eq("event_field", config.event_field);
        
        if (organizerId) {
          existingQuery = existingQuery.eq("organizer_id", organizerId).is("location_id", null);
        } else if (locationId) {
          existingQuery = existingQuery.eq("location_id", locationId).is("organizer_id", null);
        }
        
        const { data: existing, error: checkError } = await existingQuery;
        
        if (checkError) {
          console.error("Erreur lors de la vérification:", checkError);
          throw checkError;
        }
        
        if (existing && existing.length > 0) {
          // Mise à jour de la config existante
          const { error } = await supabase
            .from("organizer_scraping_configs")
            .update(configData)
            .eq("id", existing[0].id);
          if (error) {
            console.error("Erreur lors de la mise à jour:", error);
            throw error;
          }
        } else {
          // Création
          const { error, data } = await supabase
            .from("organizer_scraping_configs")
            .insert([configData])
            .select();
          if (error) {
            console.error("Erreur lors de l'insertion:", error);
            console.error("Données envoyées:", configData);
            throw error;
          }
        }
      }

      await loadConfigs();
      setNewConfig({
        event_field: "",
        css_selector: "",
        attribute: "textContent",
        transform_function: null,
        text_prefix: "",
      });
    } catch (error: any) {
      console.error("Erreur lors de la sauvegarde:", error);
      const errorMessage = error?.message || error?.details || JSON.stringify(error) || "Erreur inconnue";
      console.error("Détails de l'erreur:", {
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        code: error?.code,
        fullError: error,
      });
      alert(`Erreur lors de la sauvegarde de la configuration: ${errorMessage}`);
    } finally {
      setSaving(false);
    }
  }

  async function deleteConfig(configId: string) {
    if (!confirm("Êtes-vous sûr de vouloir supprimer cette configuration ?")) {
      return;
    }

    try {
      const { error } = await supabase
        .from("organizer_scraping_configs")
        .delete()
        .eq("id", configId);
      if (error) throw error;
      await loadConfigs();
    } catch (error) {
      console.error("Erreur lors de la suppression:", error);
      alert("Erreur lors de la suppression");
    }
  }

  const unusedFields = EVENT_FIELDS.filter(
    (field) => !configs.some((c) => c.event_field === field.value)
  );

  const content = (
    <>
      {!isPageMode && (
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Code className="h-5 w-5" />
            Configuration du scraping pour {organizerName}
          </DialogTitle>
          <DialogDescription>
            Configurez les sélecteurs CSS pour extraire automatiquement les informations des événements depuis le site web.
          </DialogDescription>
        </DialogHeader>
      )}

        {!scrapingExampleUrl ? (
          <div className="p-4 bg-warning/15 rounded-lg border border-warning/30">
            <p className="text-sm text-warning-foreground">
              ⚠️ Aucune URL d'exemple configurée pour cet organisateur. Veuillez d'abord ajouter une URL d'exemple pour le scraping.
            </p>
          </div>
        ) : (
          <>
            <div className="p-4 bg-info/10 rounded-lg border border-info/30 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <Globe className="h-4 w-4 text-info" />
                <span className="font-medium text-info">URL d'exemple :</span>
                <a
                  href={scrapingExampleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-info underline"
                >
                  {scrapingExampleUrl}
                </a>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                💡 Astuce : Ouvrez cette URL dans votre navigateur, faites un clic droit sur un élément et sélectionnez "Inspecter" pour trouver son sélecteur CSS.
              </p>
            </div>

            {/* Section Agenda (liste + pagination) */}
            <Card className="mb-6">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      Agenda (liste + pagination)
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Définissez comment récupérer les URLs d'événements depuis la page agenda (et suivre la pagination).
                    </CardDescription>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      setEditingAgendaId(null);
                      setAgendaForm({
                        enabled: true,
                        agenda_url: "",
                        event_link_selector: "",
                        event_link_attribute: "href",
                        next_page_selector: "",
                        next_page_attribute: "href",
                        max_pages: 10,
                      });
                      setIsAgendaModalOpen(true);
                    }}
                    className="cursor-pointer"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Ajouter une source d'agenda
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-3">
                {agendaLoading ? (
                  <div className="text-center py-2 text-sm">Chargement...</div>
                ) : agendaConfigs.length > 0 ? (
                  <div className="space-y-2">
                    {agendaConfigs.map((cfg) => (
                      <div key={cfg.id} className="flex items-center justify-between gap-3 p-3 rounded border">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant={cfg.enabled ? "default" : "secondary"} className="text-xs">
                              {cfg.enabled ? "Actif" : "Inactif"}
                            </Badge>
                            <span className="text-xs text-muted-foreground truncate">
                              {cfg.agenda_url}
                            </span>
                          </div>
                          <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-muted-foreground shrink-0">Liens événements:</span>
                              <Badge variant="outline" className="font-mono text-[11px] px-1.5 py-0 truncate">
                                {cfg.event_link_selector}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-muted-foreground shrink-0">Pagination:</span>
                              {cfg.next_page_selector ? (
                                <Badge variant="outline" className="font-mono text-[11px] px-1.5 py-0 truncate">
                                  {cfg.next_page_selector}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                              <span className="text-muted-foreground">• max {cfg.max_pages} pages</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="cursor-pointer h-7 px-2 text-xs"
                            onClick={() => {
                              setEditingAgendaId(cfg.id);
                              setAgendaForm({
                                enabled: !!cfg.enabled,
                                agenda_url: cfg.agenda_url || "",
                                event_link_selector: cfg.event_link_selector || "",
                                event_link_attribute: cfg.event_link_attribute || "href",
                                next_page_selector: cfg.next_page_selector || "",
                                next_page_attribute: cfg.next_page_attribute || "href",
                                max_pages: cfg.max_pages || 10,
                              });
                              setIsAgendaModalOpen(true);
                            }}
                          >
                            Modifier
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            className="cursor-pointer h-7 w-7 p-0"
                            onClick={() => deleteAgendaConfig(cfg.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-3 text-sm text-muted-foreground">
                    Aucune configuration d'agenda. Ajoutez-en une pour activer le scraping automatique (cron).
                  </div>
                )}

                {agendaConfigs.length > 0 && (
                  <div className="mt-4 pt-4 border-t space-y-3">
                    <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                      <div className="flex-1 min-w-[200px]">
                        <Label htmlFor="max-events-scrape" className="text-sm mb-2 block">
                          Nombre d'événements à scraper
                        </Label>
                        <Select
                          value={maxEventsToScrape}
                          onValueChange={setMaxEventsToScrape}
                          disabled={scrapingAgenda}
                        >
                          <SelectTrigger id="max-events-scrape" className="w-full">
                            <SelectValue placeholder="Sélectionner un nombre" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="5">5 événements</SelectItem>
                            <SelectItem value="10">10 événements</SelectItem>
                            <SelectItem value="25">25 événements</SelectItem>
                            <SelectItem value="50">50 événements</SelectItem>
                            <SelectItem value="100">100 événements</SelectItem>
                            <SelectItem value="200">200 événements</SelectItem>
                            <SelectItem value="500">500 événements</SelectItem>
                            <SelectItem value="1000">1000 événements</SelectItem>
                            <SelectItem value="unlimited">Illimité</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <Button
                      type="button"
                      onClick={async () => {
                        if (!id) return;
                        if (!confirm("Voulez-vous déclencher le scraping de l'agenda maintenant ?")) return;

                        try {
                          setScrapingAgenda(true);
                          setScrapingProgress({
                            isActive: true,
                            discovered: 0,
                            created: 0,
                            enriched: 0,
                            errors: 0,
                            total: 0,
                            current: 0,
                          });

                          const response = await fetch("/api/organizer/scrape-agenda-stream", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              organizer_id: organizerId || null,
                              location_id: locationId || null,
                              max_events: maxEventsToScrape === "unlimited" ? null : parseInt(maxEventsToScrape, 10),
                            }),
                          });

                          if (!response.ok) {
                            throw new Error("Erreur lors de la connexion au serveur");
                          }

                          const reader = response.body?.getReader();
                          const decoder = new TextDecoder();

                          if (!reader) {
                            throw new Error("Impossible de lire la réponse du serveur");
                          }

                          let buffer = "";

                          while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;

                            buffer += decoder.decode(value, { stream: true });
                            const lines = buffer.split("\n");
                            buffer = lines.pop() || "";

                            for (const line of lines) {
                              if (line.startsWith("data: ")) {
                                try {
                                  const data = JSON.parse(line.slice(6));
                                  
                                  switch (data.type) {
                                    case "start":
                                      setScrapingProgress(prev => ({ ...prev, total: data.configs || 0 }));
                                      toast({
                                        title: "Scraping démarré",
                                        description: `${data.configs || 0} configuration(s) à traiter`,
                                      });
                                      break;
                                    
                                    case "config_start":
                                      toast({
                                        title: "Traitement en cours",
                                        description: `Analyse de ${data.label || "la configuration"}`,
                                      });
                                      break;
                                    
                                    case "urls_discovered":
                                      setScrapingProgress(prev => ({ ...prev, discovered: data.total || 0 }));
                                      break;
                                    
                                    case "request_created":
                                      setScrapingProgress(prev => ({ 
                                        ...prev, 
                                        created: data.count || 0,
                                        current: data.count || 0,
                                      }));
                                      toast({
                                        title: "Nouvelle demande créée",
                                        description: data.title || data.url || "Événement découvert",
                                        variant: "success",
                                      });
                                      break;
                                    
                                    case "request_enriched":
                                      setScrapingProgress(prev => ({ ...prev, enriched: prev.enriched + 1 }));
                                      toast({
                                        title: "Demande enrichie",
                                        description: data.title || "Données complétées",
                                        variant: "success",
                                      });
                                      break;
                                    
                                    case "url_skipped":
                                      // Pas de toast pour les URLs ignorées
                                      break;
                                    
                                    case "error":
                                      setScrapingProgress(prev => ({ ...prev, errors: prev.errors + 1 }));
                                      toast({
                                        title: "Erreur",
                                        description: data.error || "Une erreur est survenue",
                                        variant: "destructive",
                                      });
                                      break;
                                    
                                    case "complete":
                                      setScrapingProgress(prev => ({ ...prev, isActive: false }));
                                      toast({
                                        title: "Scraping terminé",
                                        description: `${data.created || 0} demande(s) créée(s), ${data.enriched || 0} enrichie(s)`,
                                        variant: "success",
                                      });
                                      break;
                                  }
                                } catch (e) {
                                  console.error("Erreur lors du parsing:", e);
                                }
                              }
                            }
                          }
                        } catch (error: any) {
                          console.error("Erreur lors du scraping:", error);
                          setScrapingProgress(prev => ({ ...prev, isActive: false }));
                          toast({
                            title: "Erreur",
                            description: error.message || "Erreur inconnue lors du scraping",
                            variant: "destructive",
                          });
                        } finally {
                          setScrapingAgenda(false);
                        }
                      }}
                      disabled={scrapingAgenda || agendaConfigs.length === 0}
                      className="w-full sm:w-auto cursor-pointer"
                      size="sm"
                      variant="default"
                    >
                      {scrapingAgenda ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Scraping en cours...
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4 mr-2" />
                          Scraper l'agenda maintenant
                        </>
                      )}
                    </Button>
                    {scrapingProgress.isActive && scrapingProgress.total > 0 && (
                      <div className="mt-4 space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Progression</span>
                          <span>
                            {scrapingProgress.created} / {scrapingProgress.discovered} demandes créées
                          </span>
                        </div>
                        <Progress 
                          value={
                            scrapingProgress.discovered > 0 
                              ? (scrapingProgress.created / scrapingProgress.discovered) * 100 
                              : 0
                          } 
                        />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Découvertes: {scrapingProgress.discovered}</span>
                          <span>Enrichies: {scrapingProgress.enriched}</span>
                          {scrapingProgress.errors > 0 && (
                            <span className="text-destructive">Erreurs: {scrapingProgress.errors}</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <p className="text-xs text-muted-foreground mt-3">
                  💡 Le cron <span className="font-mono">/api/cron/scrape-events</span> utilisera ces règles pour détecter les URLs d'événements.
                  {agendaConfigs.length > 0 && " Vous pouvez aussi déclencher le scraping manuellement ci-dessus."}
                </p>
              </CardContent>
            </Card>

            {/* Modale pour ajouter/modifier une configuration d'agenda */}
            <Dialog open={isAgendaModalOpen} onOpenChange={setIsAgendaModalOpen}>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>
                    {editingAgendaId ? "Modifier la configuration d'agenda" : "Ajouter une source d'agenda"}
                  </DialogTitle>
                  <DialogDescription>
                    Définissez un sélecteur CSS qui pointe vers les liens des événements sur la page agenda.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 mt-4">
                  <div className="flex items-center justify-between gap-3 p-3 rounded border bg-muted/30">
                    <div className="space-y-1">
                      <div className="text-sm font-medium">Activer ce scraper d'agenda</div>
                      <div className="text-xs text-muted-foreground">
                        Si désactivé, il ne sera pas utilisé par le cron.
                      </div>
                    </div>
                    <Switch
                      checked={agendaForm.enabled}
                      onCheckedChange={(checked) => setAgendaForm((p) => ({ ...p, enabled: checked }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="agenda_url">URL de l'agenda *</Label>
                    <Input
                      id="agenda_url"
                      type="url"
                      value={agendaForm.agenda_url}
                      onChange={(e) => setAgendaForm((p) => ({ ...p, agenda_url: e.target.value }))}
                      placeholder="https://site-organisateur.fr/agenda"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="event_link_selector">Sélecteur CSS des liens d'événements *</Label>
                      <Input
                        id="event_link_selector"
                        value={agendaForm.event_link_selector}
                        onChange={(e) => setAgendaForm((p) => ({ ...p, event_link_selector: e.target.value }))}
                        placeholder="Ex: a.event-card, .event-list a"
                        className="font-mono text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="event_link_attribute">Attribut du lien</Label>
                      <Input
                        id="event_link_attribute"
                        value={agendaForm.event_link_attribute}
                        onChange={(e) => setAgendaForm((p) => ({ ...p, event_link_attribute: e.target.value }))}
                        placeholder="href"
                        className="font-mono text-sm"
                      />
                      <p className="text-xs text-muted-foreground">
                        Généralement <span className="font-mono">href</span>.
                      </p>
                    </div>
                  </div>

                  <Separator />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="next_page_selector">Sélecteur CSS du lien \"page suivante\" (optionnel)</Label>
                      <Input
                        id="next_page_selector"
                        value={agendaForm.next_page_selector}
                        onChange={(e) => setAgendaForm((p) => ({ ...p, next_page_selector: e.target.value }))}
                        placeholder="Ex: a.next, .pagination a[rel='next']"
                        className="font-mono text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="next_page_attribute">Attribut pagination</Label>
                      <Input
                        id="next_page_attribute"
                        value={agendaForm.next_page_attribute}
                        onChange={(e) => setAgendaForm((p) => ({ ...p, next_page_attribute: e.target.value }))}
                        placeholder="href"
                        className="font-mono text-sm"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="max_pages">Nombre max de pages</Label>
                    <Input
                      id="max_pages"
                      type="number"
                      min={1}
                      max={200}
                      value={agendaForm.max_pages}
                      onChange={(e) => setAgendaForm((p) => ({ ...p, max_pages: Number(e.target.value) }))}
                    />
                    <p className="text-xs text-muted-foreground">
                      Pour éviter les boucles/pagination infinie.
                    </p>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsAgendaModalOpen(false)}
                      className="cursor-pointer"
                    >
                      Annuler
                    </Button>
                    <Button
                      type="button"
                      onClick={saveAgendaConfig}
                      disabled={savingAgenda || !agendaForm.agenda_url.trim() || !agendaForm.event_link_selector.trim()}
                      className="cursor-pointer"
                    >
                      <Save className="h-4 w-4 mr-2" />
                      {savingAgenda ? "Sauvegarde..." : "Enregistrer"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            {/* Liste des configurations existantes */}
            {loading ? (
              <div className="text-center py-4 text-sm">Chargement...</div>
            ) : (
              <div className="space-y-2 mb-6">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-sm">Configurations existantes</h3>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      setEditingConfigId(null);
                      setNewConfig({
                        event_field: "",
                        css_selector: "",
                        attribute: "textContent",
                        transform_function: null,
                        text_prefix: "",
                      });
                      setIsConfigModalOpen(true);
                    }}
                    className="cursor-pointer"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Ajouter une configuration
                  </Button>
                </div>
                {configs.length > 0 ? (
                <div className="space-y-1.5">
                  {configs.map((config) => (
                    <div 
                      key={config.id} 
                      className="flex items-center justify-between gap-2 p-2 rounded border text-sm"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-xs">
                            {EVENT_FIELDS.find((f) => f.value === config.event_field)?.label || config.event_field}
                          </span>
                          <Badge variant="outline" className="text-xs font-mono px-1.5 py-0">
                            {config.css_selector.length > 30 
                              ? `${config.css_selector.substring(0, 30)}...` 
                              : config.css_selector}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {config.attribute || "textContent"}
                          </span>
                          {config.transform_function && (
                            <span className="text-xs text-muted-foreground">
                              • {TRANSFORM_OPTIONS.find((t) => t.value === config.transform_function)?.label}
                            </span>
                          )}
                          {config.text_prefix && (
                            <span className="text-xs text-muted-foreground">
                              • "{config.text_prefix}"
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingConfigId(config.id);
                            setNewConfig({
                              event_field: config.event_field,
                              css_selector: config.css_selector,
                              attribute: config.attribute || "textContent",
                              transform_function: config.transform_function,
                              text_prefix: config.text_prefix || "",
                            });
                            setIsConfigModalOpen(true);
                          }}
                          className="cursor-pointer h-7 px-2 text-xs"
                        >
                          Modifier
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={() => deleteConfig(config.id)}
                          className="cursor-pointer h-7 w-7 p-0"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                ) : (
                  <div className="text-center py-4 text-sm text-muted-foreground">
                    <p>Aucune configuration pour le moment.</p>
                    <p className="text-xs mt-1">Cliquez sur "Ajouter une configuration" pour commencer.</p>
                  </div>
                )}
              </div>
            )}

            {/* Section Configuration des champs IA */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  Champs à demander à l'IA
                </CardTitle>
                <CardDescription className="text-xs">
                  Activez ou désactivez les champs que l'IA doit extraire. 
                  Les champs extraits via CSS ont toujours la priorité sur l'IA.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-3">
                {loading ? (
                  <div className="text-center py-2 text-sm">Chargement...</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {AI_FIELD_OPTIONS.map((field) => {
                      const aiField = aiFields.find(f => f.field_name === field.value);
                      const isEnabled = aiField?.enabled ?? true;
                      const hasCssConfig = configs.some(c => c.event_field === field.value);
                      const currentHint = aiField?.ai_hint || "";
                      
                      return (
                        <div
                          key={field.value}
                          className={`p-3 rounded border space-y-2 ${
                            hasCssConfig ? 'bg-muted/50' : ''
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={isEnabled}
                              onCheckedChange={(checked) => toggleAIField(field.value, checked)}
                              disabled={savingAiFields || hasCssConfig}
                              className="scale-75"
                            />
                            <Label 
                              className={`text-sm cursor-pointer flex-1 ${hasCssConfig ? 'text-muted-foreground' : ''}`}
                              htmlFor={`ai-${field.value}`}
                            >
                              {field.label}
                              {hasCssConfig && (
                                <span className="ml-1 text-xs text-muted-foreground">⚡ CSS</span>
                              )}
                            </Label>
                          </div>
                          {isEnabled && !hasCssConfig && (
                            <div className="space-y-1">
                              <div className="flex items-center gap-1">
                                <Label htmlFor={`hint-${field.value}`} className="text-xs text-muted-foreground">
                                  Indication pour l'IA (optionnel) :
                                </Label>
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="text-xs text-muted-foreground cursor-help">ℹ️</span>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p className="text-xs max-w-xs">
                                        Ajoutez des instructions spécifiques pour aider l'IA à extraire ce champ.
                                        Ex: "Le prix est toujours écrit en gras", "La date est au format DD/MM/YYYY"
                                      </p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </div>
                              <Textarea
                                id={`hint-${field.value}`}
                                value={pendingHints[field.value] !== undefined ? pendingHints[field.value] : currentHint}
                                onChange={(e) => {
                                  const newValue = e.target.value;
                                  setPendingHints(prev => ({
                                    ...prev,
                                    [field.value]: newValue
                                  }));
                                }}
                                placeholder={`Ex: ${getHintPlaceholder(field.value)}`}
                                className="text-xs min-h-[60px] resize-none"
                                disabled={savingAiFields || savingHints[field.value]}
                              />
                              {pendingHints[field.value] !== undefined && pendingHints[field.value] !== currentHint && (
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={async () => {
                                    setSavingHints(prev => ({ ...prev, [field.value]: true }));
                                    try {
                                      await saveAIHint(field.value, pendingHints[field.value]);
                                      setPendingHints(prev => {
                                        const newPending = { ...prev };
                                        delete newPending[field.value];
                                        return newPending;
                                      });
                                    } catch (error) {
                                      console.error("Erreur lors de la sauvegarde:", error);
                                    } finally {
                                      setSavingHints(prev => {
                                        const newSaving = { ...prev };
                                        delete newSaving[field.value];
                                        return newSaving;
                                      });
                                    }
                                  }}
                                  disabled={savingHints[field.value]}
                                  className="w-full text-xs h-7"
                                >
                                  {savingHints[field.value] ? "Sauvegarde..." : "Valider"}
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-3">
                  💡 Les champs désactivés ne seront pas extraits par l'IA. Si un champ a une configuration CSS, l'IA ne sera pas utilisée.
                </p>
              </CardContent>
            </Card>

            {/* Modale pour ajouter/modifier une configuration */}
            <Dialog open={isConfigModalOpen} onOpenChange={setIsConfigModalOpen}>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>
                    {editingConfigId ? "Modifier une configuration" : "Ajouter une configuration"}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="event_field">Champ d'événement *</Label>
                    <Select
                      value={newConfig.event_field}
                      onValueChange={(value) =>
                        setNewConfig({ ...newConfig, event_field: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionner un champ" />
                      </SelectTrigger>
                      <SelectContent>
                        {(newConfig.event_field
                          ? EVENT_FIELDS
                          : unusedFields
                        ).map((field) => (
                          <SelectItem key={field.value} value={field.value}>
                            {field.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="css_selector">Sélecteur CSS *</Label>
                    <Input
                      id="css_selector"
                      value={newConfig.css_selector}
                      onChange={(e) =>
                        setNewConfig({ ...newConfig, css_selector: e.target.value })
                      }
                      placeholder="Ex: .event-title, h1, #price, .event-date"
                      className="font-mono text-sm"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="attribute">Attribut HTML</Label>
                    <Select
                      value={newConfig.attribute || "textContent"}
                      onValueChange={(value) =>
                        setNewConfig({ ...newConfig, attribute: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ATTRIBUTE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="transform_function">Fonction de transformation</Label>
                    <Select
                      value={newConfig.transform_function || "none"}
                      onValueChange={(value) =>
                        setNewConfig({
                          ...newConfig,
                          transform_function: value === "none" ? null : value,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Aucune" />
                      </SelectTrigger>
                      <SelectContent>
                        {TRANSFORM_OPTIONS.map((option) => (
                          <SelectItem
                            key={option.value || "none"}
                            value={option.value || "none"}
                          >
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="text_prefix">Texte à rechercher avant la valeur (optionnel)</Label>
                    <Input
                      id="text_prefix"
                      value={newConfig.text_prefix}
                      onChange={(e) =>
                        setNewConfig({ ...newConfig, text_prefix: e.target.value })
                      }
                      placeholder='Ex: "prix :", "date :", "lieu :"'
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      Si défini, la valeur sera extraite après ce texte dans le contenu de l'élément sélectionné. 
                      Par exemple, si l'élément contient "prix : 25€", avec "prix :" comme texte recherché, 
                      la valeur extraite sera " 25€".
                    </p>
                  </div>

                  <div className="flex justify-end gap-2 pt-4">
                  {newConfig.event_field && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        setNewConfig({
                          event_field: "",
                          css_selector: "",
                          attribute: "textContent",
                          transform_function: null,
                          text_prefix: "",
                        })
                      }
                      className="cursor-pointer"
                    >
                      Annuler
                    </Button>
                  )}
                  <Button
                    type="button"
                    onClick={() => saveConfig(newConfig)}
                    disabled={
                      !newConfig.event_field || !newConfig.css_selector || saving
                    }
                    className="cursor-pointer"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {saving ? "Sauvegarde..." : "Enregistrer"}
                  </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

          </>
        )}
      </>
  );

  if (isPageMode) {
    return <div className="space-y-6">{content}</div>;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${isMobile ? "w-[95vw] max-w-[95vw]" : "max-w-4xl"} max-h-[90vh] overflow-y-auto`}>
        {content}
      </DialogContent>
    </Dialog>
  );
}

