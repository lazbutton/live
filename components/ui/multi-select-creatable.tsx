"use client";

import * as React from "react";
import { X, Check, ChevronDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface MultiSelectOption {
  label: string;
  value: string;
}

interface MultiSelectCreatableProps {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  onCreate?: (value: string) => Promise<string | null>; // Retourne l'ID du tag créé ou null en cas d'erreur
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  createPlaceholder?: string;
}

export function MultiSelectCreatable({
  options,
  selected,
  onChange,
  onCreate,
  placeholder = "Sélectionner...",
  className,
  disabled = false,
  createPlaceholder = "Ajouter un nouveau tag...",
}: MultiSelectCreatableProps) {
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState("");
  const [isCreating, setIsCreating] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleUnselect = (value: string) => {
    onChange(selected.filter((s) => s !== value));
  };

  const handleSelect = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((s) => s !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const handleCreate = async () => {
    if (!inputValue.trim() || !onCreate || isCreating) return;

    const trimmedValue = inputValue.trim();
    
    // Vérifier si le tag existe déjà
    const existingOption = options.find(
      (opt) => opt.label.toLowerCase() === trimmedValue.toLowerCase()
    );
    
    if (existingOption) {
      // Si le tag existe, le sélectionner
      if (!selected.includes(existingOption.value)) {
        onChange([...selected, existingOption.value]);
      }
      setInputValue("");
      return;
    }

    setIsCreating(true);
    try {
      const newId = await onCreate(trimmedValue);
      if (newId) {
        onChange([...selected, newId]);
        setInputValue("");
      }
    } catch (error) {
      console.error("Erreur lors de la création du tag:", error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && inputValue.trim()) {
      e.preventDefault();
      handleCreate();
    } else if (e.key === "Escape") {
      setInputValue("");
      inputRef.current?.blur();
    }
  };

  const filteredOptions = React.useMemo(() => {
    if (!inputValue.trim()) return options;
    
    const lowerInput = inputValue.toLowerCase();
    return options.filter((opt) =>
      opt.label.toLowerCase().includes(lowerInput)
    );
  }, [options, inputValue]);

  const showCreateOption = inputValue.trim() && 
    !options.some((opt) => opt.label.toLowerCase() === inputValue.trim().toLowerCase());

  React.useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex min-h-[44px] w-full items-center justify-between whitespace-nowrap rounded-lg border border-border/30 bg-input/50 backdrop-blur-sm px-4 py-2 text-sm ring-offset-background cursor-pointer data-[placeholder]:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background focus:border-ring/50 hover:border-border/50 disabled:cursor-not-allowed disabled:opacity-40 shadow-sm hover:shadow-md",
            className
          )}
        >
          <div className="flex flex-wrap gap-1 flex-1">
            {selected.length === 0 ? (
              <span className="text-muted-foreground">{placeholder}</span>
            ) : (
              selected.map((value) => {
                const option = options.find((opt) => opt.value === value);
                if (!option) return null;
                return (
                  <Badge
                    key={value}
                    variant="secondary"
                    className="mr-1 mb-1 cursor-pointer"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleUnselect(value);
                    }}
                  >
                    {option.label}
                    <span
                      role="button"
                      tabIndex={0}
                      className="ml-1 ring-offset-background rounded-full outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-pointer inline-flex items-center justify-center"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          handleUnselect(value);
                        }
                      }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleUnselect(value);
                      }}
                    >
                      <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                    </span>
                  </Badge>
                );
              })
            )}
          </div>
          <ChevronDown className="h-4 w-4 opacity-60 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-full p-0 rounded-xl border border-border/30 bg-popover/95 backdrop-blur-xl shadow-2xl"
        align="start"
        style={{ width: "var(--radix-popover-trigger-width)" }}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="p-2 border-b">
          <Input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={createPlaceholder}
            className="min-h-[36px] text-base"
          />
        </div>
        <div className="max-h-60 overflow-auto p-1">
          {filteredOptions.length === 0 && !showCreateOption ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Aucune option disponible
            </div>
          ) : (
            <>
              {showCreateOption && onCreate && (
                <div
                  className={cn(
                    "relative flex w-full cursor-pointer select-none items-center rounded-lg py-2.5 px-3 text-sm outline-none hover:bg-accent/40 hover:text-accent-foreground transition-colors",
                    isCreating && "opacity-50 cursor-wait"
                  )}
                  onClick={handleCreate}
                >
                  <div className="flex items-center gap-2 flex-1">
                    <Plus className="h-4 w-4 text-primary" />
                    <span>
                      Créer "{inputValue.trim()}"
                    </span>
                  </div>
                </div>
              )}
              {filteredOptions.map((option) => {
                const isSelected = selected.includes(option.value);
                return (
                  <div
                    key={option.value}
                    className={cn(
                      "relative flex w-full cursor-pointer select-none items-center rounded-lg py-2.5 px-3 text-sm outline-none hover:bg-accent/40 hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground transition-colors",
                      isSelected && "bg-accent/60 text-accent-foreground"
                    )}
                    onClick={() => handleSelect(option.value)}
                  >
                    <div className="flex items-center gap-2 flex-1">
                      <div
                        className={cn(
                          "flex h-4 w-4 items-center justify-center rounded-sm border border-primary transition-colors",
                          isSelected
                            ? "bg-primary text-primary-foreground"
                            : "opacity-50"
                        )}
                      >
                        {isSelected && <Check className="h-3 w-3" />}
                      </div>
                      <span>{option.label}</span>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

