"use client";

import * as React from "react";
import { X, Check, ChevronDown, Search } from "lucide-react";
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

interface MultiSelectProps {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  searchPlaceholder?: string;
}

export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Sélectionner...",
  className,
  disabled = false,
  searchPlaceholder = "Rechercher...",
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");

  const filteredOptions = React.useMemo(() => {
    if (!searchQuery.trim()) return options;
    const query = searchQuery.toLowerCase();
    return options.filter((option) =>
      option.label.toLowerCase().includes(query)
    );
  }, [options, searchQuery]);

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

  // Réinitialiser la recherche quand le popover se ferme
  React.useEffect(() => {
    if (!open) {
      setSearchQuery("");
    }
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex min-h-[44px] w-full items-center justify-between whitespace-nowrap border px-4 py-2 text-sm ring-offset-background cursor-pointer data-[placeholder]:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background disabled:cursor-not-allowed disabled:opacity-40 shadow-sm hover:shadow-md",
            className
          )}
          style={{
            borderRadius: "var(--radius-md)",
            borderColor: "var(--border)",
            backgroundColor: "var(--input)",
            color: "var(--foreground)",
          }}
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
        className="w-full p-0 border"
        align="start"
        style={{
          width: "var(--radix-popover-trigger-width)",
          borderRadius: "var(--radius-lg)",
          borderColor: "var(--border)",
          backgroundColor: "var(--popover)",
          color: "var(--popover-foreground)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-9"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
        <div className="max-h-60 overflow-auto p-1">
          {filteredOptions.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              {searchQuery.trim() ? "Aucun résultat trouvé" : "Aucune option disponible"}
            </div>
          ) : (
            filteredOptions.map((option) => {
              const isSelected = selected.includes(option.value);
              return (
                <div
                  key={option.value}
                  className={cn(
                    "relative flex w-full cursor-pointer select-none items-center py-2.5 px-3 text-sm outline-none hover:bg-accent/40 hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground transition-colors",
                    isSelected && "bg-accent/60 text-accent-foreground"
                  )}
                  style={{
                    borderRadius: "var(--radius-md)",
                  }}
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
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

