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
            "flex min-h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-left text-sm text-foreground shadow-xs outline-none transition-[color,border-color,box-shadow] duration-150 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 data-[state=open]:border-ring disabled:cursor-not-allowed disabled:opacity-50 max-md:min-h-10 dark:bg-input/25",
            className
          )}
        >
          <div className="flex min-w-0 flex-1 flex-wrap gap-1">
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
                    className="cursor-pointer gap-1 pr-1"
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
                      className="-mr-0.5 inline-flex items-center justify-center rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
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
                      <X className="h-3 w-3" />
                    </span>
                  </Badge>
                );
              })
            )}
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-full overflow-hidden p-0"
        align="start"
        portalled={false}
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
            className="h-9"
          />
        </div>
        <div className="max-h-60 overflow-auto p-1" style={{ overscrollBehavior: "contain" }}>
          {filteredOptions.length === 0 && !showCreateOption ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Aucune option disponible
            </div>
          ) : (
            <>
              {showCreateOption && onCreate && (
                <div
                  className={cn(
                    "relative flex w-full cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground max-md:py-2.5",
                    isCreating && "cursor-wait opacity-50"
                  )}
                  onClick={handleCreate}
                >
                  <div className="flex items-center gap-2 flex-1">
                    <Plus className="h-4 w-4 text-muted-foreground" />
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
                      "relative flex w-full cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground max-md:py-2.5",
                      isSelected && "font-medium"
                    )}
                    onClick={() => handleSelect(option.value)}
                  >
                    <div className="flex items-center gap-2 flex-1">
                      <div
                        className={cn(
                          "flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors",
                          isSelected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-input"
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

