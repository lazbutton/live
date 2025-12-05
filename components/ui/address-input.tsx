"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Input } from "./input";
import { cn } from "@/lib/utils";
import { MapPin, Loader2 } from "lucide-react";

interface AddressSuggestion {
  label: string;
  value: string;
}

interface AddressInputProps extends Omit<React.ComponentProps<"input">, "onChange" | "value"> {
  value: string;
  onChange: (address: string) => void;
  onAddressSelect?: (address: string) => void;
  className?: string;
}

export function AddressInput({
  value,
  onChange,
  onAddressSelect,
  className,
  ...props
}: AddressInputProps) {
  const [suggestions, setSuggestions] = React.useState<AddressSuggestion[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [showSuggestions, setShowSuggestions] = React.useState(false);
  const [selectedIndex, setSelectedIndex] = React.useState(-1);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const suggestionsRef = React.useRef<HTMLDivElement>(null);
  const timeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const [position, setPosition] = React.useState<{ top: number; left: number; width: number } | null>(null);
  const [mounted, setMounted] = React.useState(false);
  const isSelectingRef = React.useRef(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Synchroniser la valeur de l'input avec la prop value quand elle change de l'extérieur
  React.useEffect(() => {
    if (inputRef.current && !isSelectingRef.current) {
      const currentValue = inputRef.current.value || "";
      const propValue = value || "";
      // Ne synchroniser que si la valeur a vraiment changé
      if (currentValue !== propValue) {
        inputRef.current.value = propValue;
      }
    }
  }, [value]);

  const updatePosition = React.useCallback(() => {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX,
        width: rect.width,
      });
    }
  }, []);

  const fetchAddressSuggestions = React.useCallback(async (query: string) => {
    if (!query || query.length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    updatePosition();
    setIsLoading(true);
    try {
      const response = await fetch(
        `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=5`
      );
      const data = await response.json();

      if (data.features && Array.isArray(data.features)) {
        const addressSuggestions: AddressSuggestion[] = data.features.map((feature: any) => ({
          label: feature.properties.label,
          value: feature.properties.label,
        }));
        setSuggestions(addressSuggestions);
        setShowSuggestions(addressSuggestions.length > 0);
        setSelectedIndex(-1);
        updatePosition();
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    } catch (error) {
      console.error("Erreur lors de la récupération des suggestions:", error);
      setSuggestions([]);
      setShowSuggestions(false);
    } finally {
      setIsLoading(false);
    }
  }, [updatePosition]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Ignorer si on est en train de sélectionner une suggestion
    if (isSelectingRef.current) {
      isSelectingRef.current = false;
      return;
    }
    
    const newValue = e.target.value;
    onChange(newValue);
    
    // Réinitialiser l'index sélectionné lors de la saisie
    setSelectedIndex(-1);

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      fetchAddressSuggestions(newValue);
    }, 300);
  };

  const handleSelectSuggestion = React.useCallback((suggestion: AddressSuggestion) => {
    const addressValue = suggestion.value;
    
    // Marquer qu'on est en train de sélectionner pour éviter que handleInputChange interfère
    isSelectingRef.current = true;
    
    // Fermer les suggestions d'abord
    setShowSuggestions(false);
    setSuggestions([]);
    
    // Appeler onChange pour mettre à jour l'état du parent
    // Cela déclenchera un re-render et la prop value sera mise à jour
    onChange(addressValue);
    
    // Callback optionnel
    if (onAddressSelect) {
      onAddressSelect(addressValue);
    }
    
    // Réinitialiser le flag après que React ait re-rendu
    setTimeout(() => {
      isSelectingRef.current = false;
      // S'assurer que la valeur est bien affichée
      if (inputRef.current && inputRef.current.value !== addressValue) {
        inputRef.current.value = addressValue;
      }
      // Focus sur l'input
      inputRef.current?.focus();
    }, 10);
  }, [onChange, onAddressSelect]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) {
      if (e.key === "Escape") {
        setShowSuggestions(false);
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : prev));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case "Enter":
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          handleSelectSuggestion(suggestions[selectedIndex]);
        } else if (suggestions.length > 0) {
          // Si aucune suggestion n'est sélectionnée mais qu'il y a des suggestions, prendre la première
          handleSelectSuggestion(suggestions[0]);
        }
        break;
      case "Escape":
        setShowSuggestions(false);
        break;
    }
  };

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    const handleResize = () => {
      if (showSuggestions) {
        updatePosition();
      }
    };

    const handleScroll = () => {
      if (showSuggestions) {
        updatePosition();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleScroll, true);
    
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleScroll, true);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [showSuggestions, updatePosition]);

  return (
    <div className="relative w-full" style={{ zIndex: 1 }}>
      <div className="relative">
        <Input
          {...props}
          ref={inputRef}
          value={value || ""}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          className={cn("pr-10", className)}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <MapPin className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {mounted && showSuggestions && suggestions.length > 0 && position && createPortal(
        <div
          ref={suggestionsRef}
          data-address-suggestions
          className="fixed bg-popover border border-border/30 rounded-lg shadow-2xl max-h-[300px] overflow-y-auto"
          style={{
            zIndex: 9999999,
            position: 'fixed',
            top: `${position.top}px`,
            left: `${position.left}px`,
            width: `${position.width}px`,
            pointerEvents: 'auto',
            isolation: 'isolate',
          }}
          onMouseDown={(e) => {
            // Empêcher le blur de l'input quand on clique sur les suggestions
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => {
            // Empêcher la propagation pour éviter de fermer les modales
            e.stopPropagation();
          }}
          onMouseUp={(e) => {
            // Empêcher la propagation sur mouseup aussi
            e.stopPropagation();
          }}
        >
          {suggestions.map((suggestion, index) => (
            <div
              key={index}
              className={cn(
                "px-3 py-2 text-sm cursor-pointer transition-colors",
                index === selectedIndex
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent/50 hover:text-accent-foreground"
              )}
              style={{ pointerEvents: 'auto' }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleSelectSuggestion(suggestion);
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onMouseUp={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <div className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="break-words">{suggestion.label}</span>
              </div>
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

