"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function ThemeToggle() {
  const [isDark, setIsDark] = React.useState(() => {
    // Initialiser avec le thème actuel du document
    if (typeof window !== "undefined") {
      return document.documentElement.classList.contains("dark");
    }
    return true; // Par défaut dark
  });

  React.useEffect(() => {
    // Synchroniser avec le thème actuel au montage
    const html = document.documentElement;
    setIsDark(html.classList.contains("dark"));
  }, []);

  const toggleTheme = () => {
    const html = document.documentElement;
    const currentIsDark = html.classList.contains("dark");
    const newIsDark = !currentIsDark;
    
    if (newIsDark) {
      html.classList.add("dark");
      html.style.colorScheme = "dark";
    } else {
      html.classList.remove("dark");
      html.style.colorScheme = "light";
    }
    
    setIsDark(newIsDark);
    
    // Sauvegarder la préférence dans localStorage
    localStorage.setItem("theme", newIsDark ? "dark" : "light");
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          className="h-9 w-9"
          aria-label={isDark ? "Passer en mode clair" : "Passer en mode sombre"}
        >
          {isDark ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {isDark ? "Mode clair" : "Mode sombre"}
      </TooltipContent>
    </Tooltip>
  );
}




