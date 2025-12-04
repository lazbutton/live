// Stub for editor-store - not used in admin
export function useEditorStore() {
  return {
    themeState: { 
      currentMode: "dark" as const,
      styles: {
        light: {} as Record<string, any>,
        dark: {} as Record<string, any>,
      },
    },
    setThemeState: () => {},
  };
}
