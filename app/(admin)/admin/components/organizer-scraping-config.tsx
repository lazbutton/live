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
import { Save, Plus, Trash2, Code, Globe, Sparkles } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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

const EVENT_FIELDS = [
  { value: "title", label: "Titre" },
  { value: "description", label: "Description" },
  { value: "date", label: "Date de début" },
  { value: "end_date", label: "Date de fin" },
  { value: "price", label: "Prix" },
  { value: "location", label: "Lieu" },
  { value: "address", label: "Adresse" },
  { value: "image_url", label: "Image" },
  { value: "organizer", label: "Organisateur" },
  { value: "category", label: "Catégorie" },
  { value: "capacity", label: "Capacité" },
  { value: "door_opening_time", label: "Heure d'ouverture" },
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
  websiteUrl: string | null;
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
  { value: "location", label: "Lieu" },
  { value: "address", label: "Adresse" },
  { value: "image_url", label: "Image" },
  { value: "organizer", label: "Organisateur" },
  { value: "category", label: "Catégorie" },
  { value: "tags", label: "Tags" },
  { value: "capacity", label: "Capacité" },
  { value: "door_opening_time", label: "Heure d'ouverture" },
];

export function OrganizerScrapingConfig({
  organizerId,
  locationId,
  organizerName,
  websiteUrl,
  open,
  onOpenChange,
  isPageMode = false,
}: OrganizerScrapingConfigProps) {
  const isMobile = useIsMobile();
  const [configs, setConfigs] = useState<ScrapingConfig[]>([]);
  const [aiFields, setAiFields] = useState<AIField[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingAiFields, setSavingAiFields] = useState(false);
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

  const id = organizerId || locationId;

  useEffect(() => {
    if (open && id) {
      loadConfigs();
      loadAIFields();
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
        const defaultFields = AI_FIELD_OPTIONS.map(field => ({
          organizer_id: organizerId || null,
          location_id: locationId || null,
          field_name: field.value,
          enabled: true,
        }));
        
        const { data: inserted, error: insertError } = await supabase
          .from("organizer_ai_fields")
          .insert(defaultFields)
          .select();
        
        if (insertError) {
          console.error("Erreur Supabase lors de l'insertion des champs IA par défaut:", {
            message: insertError.message,
            details: insertError.details,
            hint: insertError.hint,
            code: insertError.code
          });
          throw insertError;
        }
        setAiFields(inserted || []);
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

        {!websiteUrl ? (
          <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              ⚠️ Aucun site web configuré pour cet organisateur. Veuillez d'abord ajouter une URL de site web.
            </p>
          </div>
        ) : (
          <>
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <Globe className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <span className="font-medium text-blue-900 dark:text-blue-100">Site web :</span>
                <a
                  href={websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 underline"
                >
                  {websiteUrl}
                </a>
              </div>
              <p className="text-xs text-blue-700 dark:text-blue-300 mt-2">
                💡 Astuce : Ouvrez le site web dans votre navigateur, faites un clic droit sur un élément et sélectionnez "Inspecter" pour trouver son sélecteur CSS.
              </p>
            </div>

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

