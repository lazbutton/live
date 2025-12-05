// Stub for editor-store - not used in admin
export function useEditorStore() {
  return {
    themeState: { 
      currentMode: "dark" as "dark" | "light",
      styles: {
        light: {} as Record<string, any>,
        dark: {} as Record<string, any>,
      },
    },
    setThemeState: (_state: any) => {},
  };
}
