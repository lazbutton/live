/**
 * Utilitaires pour gérer les URLs d'images Supabase Storage avec optimisations
 */

import type { SupabaseClient } from "@supabase/supabase-js";

type StorageReference = {
  table: string;
  column: string;
};

export function getPublicStorageObjectPath(
  storageUrl: string | null | undefined,
  bucket: string,
): string | null {
  if (!storageUrl) return null;
  const marker = `/storage/v1/object/public/${bucket}/`;
  const markerIndex = storageUrl.indexOf(marker);
  if (markerIndex < 0) return null;
  return decodeURIComponent(
    storageUrl.slice(markerIndex + marker.length).split("?")[0].replace(/^\/+/, ""),
  );
}

/**
 * Supprime une ancienne image uniquement lorsqu'aucune ligne ne la référence encore.
 * Un échec de maintenance ne doit jamais annuler l'enregistrement métier réussi.
 */
export async function removeReplacedStorageObject(
  supabase: SupabaseClient,
  {
    bucket,
    previousUrl,
    nextUrl,
    references,
  }: {
    bucket: string;
    previousUrl: string | null | undefined;
    nextUrl: string | null | undefined;
    references: StorageReference[];
  },
): Promise<boolean> {
  if (!previousUrl || previousUrl === nextUrl) return false;
  const objectPath = getPublicStorageObjectPath(previousUrl, bucket);
  if (!objectPath) return false;

  try {
    for (const reference of references) {
      const { count, error } = await supabase
        .from(reference.table)
        .select("*", { count: "exact", head: true })
        .eq(reference.column, previousUrl);
      if (error) throw error;
      if ((count ?? 0) > 0) return false;
    }

    const { error } = await supabase.storage.from(bucket).remove([objectPath]);
    if (error) throw error;
    return true;
  } catch (error) {
    console.warn(
      `Nettoyage différé de l'image remplacée ${bucket}/${objectPath}:`,
      error,
    );
    return false;
  }
}

/**
 * Génère une URL d'image avec des paramètres de transformation
 * 
 * Note: Supabase Storage ne supporte pas nativement les transformations d'images.
 * Cette fonction permet de préparer l'URL pour une utilisation avec Next.js Image
 * ou un service de transformation externe (ImageKit, Cloudinary, etc.)
 * 
 * @param storageUrl - URL de base de l'image dans Supabase Storage
 * @param options - Options de transformation
 * @returns URL transformée (ou URL originale si pas de transformation disponible)
 */
export function getOptimizedImageUrl(
  storageUrl: string | null | undefined,
  options?: {
    width?: number;
    height?: number;
    quality?: number; // 1-100
    format?: 'webp' | 'jpg' | 'png';
  }
): string {
  if (!storageUrl) return '';

  // Si pas d'options, retourner l'URL originale
  if (!options) return storageUrl;

  // Pour l'instant, retourner l'URL originale
  // Dans le futur, on pourra ajouter un service de transformation d'images
  // ou utiliser Next.js Image optimization
  return storageUrl;
}

/**
 * Génère une URL d'image avec taille optimisée pour différentes utilisations
 */
export function getImageUrl(
  storageUrl: string | null | undefined,
  size: 'thumbnail' | 'small' | 'medium' | 'large' | 'original' = 'original'
): string {
  if (!storageUrl) return '';

  const sizes = {
    thumbnail: { width: 150, height: 150, quality: 80 },
    small: { width: 400, height: 400, quality: 85 },
    medium: { width: 800, height: 800, quality: 90 },
    large: { width: 1200, height: 1200, quality: 90 },
    original: undefined,
  };

  const options = sizes[size];
  return getOptimizedImageUrl(storageUrl, options);
}

/**
 * Utilise Next.js Image Optimization si disponible
 * Sinon, retourne l'URL Supabase avec paramètres pour un futur service
 */
export function getImageUrlForNextImage(
  storageUrl: string | null | undefined,
  width: number,
  height?: number,
  quality: number = 90
): string {
  if (!storageUrl) return '';

  // Next.js Image optimization fonctionne automatiquement avec les images externes
  // si configuré dans next.config.js
  // Pour l'instant, retourner l'URL originale
  // Next.js s'occupera de l'optimisation automatiquement
  return storageUrl;
}

/**
 * Crée une URL avec paramètres de transformation pour ImageKit ou Cloudinary
 * 
 * Exemple d'utilisation avec ImageKit:
 * - Configurer ImageKit comme proxy devant Supabase Storage
 * - Utiliser cette fonction pour générer les URLs avec transformations
 */
export function getTransformedImageUrl(
  storageUrl: string | null | undefined,
  options: {
    width?: number;
    height?: number;
    quality?: number;
    format?: 'webp' | 'jpg' | 'png';
    crop?: 'fit' | 'fill' | 'crop';
  }
): string {
  if (!storageUrl) return '';

  // Pour l'instant, retourner l'URL originale
  // Dans le futur, si vous configurez ImageKit ou Cloudinary:
  // - Extraire le chemin de l'image depuis storageUrl
  // - Construire l'URL avec les paramètres de transformation
  // - Exemple ImageKit: https://ik.imagekit.io/your-id/image.jpg?tr=w-800,h-600,q-90
  
  return storageUrl;
}





