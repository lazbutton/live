"use client";

import * as React from "react";
import { Check, ChevronDown, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";

interface SelectSearchableOption {
  value: string;
  label: string;
}

interface SelectSearchableProps {
  options: SelectSearchableOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  emptyActionLabel?: string;
  onEmptyAction?: (query: string) => void;
}

export function SelectSearchable({
  options,
  value,
  onValueChange,
  placeholder = "Sélectionner...",
  className,
  searchPlaceholder = "Rechercher...",
  disabled = false,
  emptyActionLabel,
  onEmptyAction,
}: SelectSearchableProps) {
  const [open, setOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const trimmedSearchQuery = searchQuery.trim();
  const actionLabel = emptyActionLabel || "Ajouter";

  const filteredOptions = React.useMemo(() => {
    if (!searchQuery.trim()) return options;
    const query = searchQuery.toLowerCase();
    return options.filter((option) =>
      option.label.toLowerCase().includes(query)
    );
  }, [options, searchQuery]);

  const selectedOption = options.find((opt) => opt.value === value);

  React.useEffect(() => {
    if (!open) {
      setSearchQuery("");
    }
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between px-3 font-normal has-[>svg]:px-3",
            !selectedOption && "text-muted-foreground",
            className
          )}
        >
          <span className="truncate">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="overflow-hidden p-0"
        align="start"
        portalled={false}
        style={{ width: "var(--radix-popover-trigger-width)" }}
      >
        <div className="border-b p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-9"
              disabled={disabled}
            />
          </div>
        </div>
        <div
          className="max-h-[300px] overflow-auto"
          style={{ overscrollBehavior: "contain" }}
        >
          {filteredOptions.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              <div>
                {trimmedSearchQuery ? "Aucun résultat trouvé" : "Aucune option disponible"}
              </div>
            </div>
          ) : (
            <div className="p-1">
              {filteredOptions.map((option) => (
                <div
                  key={option.value}
                  className={cn(
                    "relative flex cursor-pointer select-none items-center rounded-md px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground max-md:py-2.5",
                    value === option.value && "font-medium"
                  )}
                  onClick={() => {
                    onValueChange(option.value);
                    setOpen(false);
                    setSearchQuery("");
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === option.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {option.label}
                </div>
              ))}
            </div>
          )}
        </div>
        {onEmptyAction ? (
          <div className="border-t p-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              className="w-full justify-center gap-2 border-dashed"
              onClick={() => {
                onEmptyAction(trimmedSearchQuery);
                setOpen(false);
                setSearchQuery("");
              }}
            >
              <Plus className="h-4 w-4" />
              {trimmedSearchQuery ? `${actionLabel} : "${trimmedSearchQuery}"` : actionLabel}
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

