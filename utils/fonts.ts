// Stub for font utils - not used in admin
export function extractFontFamily(value: any): string | null { 
  return typeof value === "string" ? value : null; 
}
export function getDefaultWeights(weights: string[]): string[] { 
  return weights || []; 
}
