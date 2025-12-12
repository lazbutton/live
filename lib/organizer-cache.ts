/**
 * Cache intelligent pour l'interface organisateur
 * Utilise localStorage pour persister les données entre les sessions
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // Time to live en millisecondes
}

class OrganizerCache {
  private prefix = "organizer.cache.";

  /**
   * Récupère une valeur du cache si elle existe et n'est pas expirée
   */
  get<T>(key: string): T | null {
    if (typeof window === "undefined") return null;

    try {
      const stored = localStorage.getItem(this.prefix + key);
      if (!stored) return null;

      const entry: CacheEntry<T> = JSON.parse(stored);
      const now = Date.now();

      // Vérifier si l'entrée est expirée
      if (now > entry.timestamp + entry.ttl) {
        localStorage.removeItem(this.prefix + key);
        return null;
      }

      return entry.data;
    } catch (error) {
      console.error(`Erreur lors de la récupération du cache pour ${key}:`, error);
      return null;
    }
  }

  /**
   * Stocke une valeur dans le cache avec un TTL
   */
  set<T>(key: string, data: T, ttlMs: number = 5 * 60 * 1000): void {
    if (typeof window === "undefined") return;

    try {
      const entry: CacheEntry<T> = {
        data,
        timestamp: Date.now(),
        ttl: ttlMs,
      };

      localStorage.setItem(this.prefix + key, JSON.stringify(entry));
    } catch (error) {
      console.error(`Erreur lors de la mise en cache pour ${key}:`, error);
      // Si le storage est plein, essayer de nettoyer les anciennes entrées
      this.cleanup();
    }
  }

  /**
   * Supprime une entrée du cache
   */
  delete(key: string): void {
    if (typeof window === "undefined") return;
    localStorage.removeItem(this.prefix + key);
  }

  /**
   * Nettoie les entrées expirées du cache
   */
  cleanup(): void {
    if (typeof window === "undefined") return;

    try {
      const keys = Object.keys(localStorage);
      const now = Date.now();

      keys.forEach((key) => {
        if (!key.startsWith(this.prefix)) return;

        try {
          const stored = localStorage.getItem(key);
          if (!stored) return;

          const entry = JSON.parse(stored);
          if (now > entry.timestamp + entry.ttl) {
            localStorage.removeItem(key);
          }
        } catch {
          // Ignorer les erreurs de parsing
          localStorage.removeItem(key);
        }
      });
    } catch (error) {
      console.error("Erreur lors du nettoyage du cache:", error);
    }
  }

  /**
   * Vide tout le cache organisateur
   */
  clear(): void {
    if (typeof window === "undefined") return;

    try {
      const keys = Object.keys(localStorage);
      keys.forEach((key) => {
        if (key.startsWith(this.prefix)) {
          localStorage.removeItem(key);
        }
      });
    } catch (error) {
      console.error("Erreur lors de la suppression du cache:", error);
    }
  }

  /**
   * Invalide un cache spécifique (utile après une mise à jour)
   */
  invalidate(pattern: string): void {
    if (typeof window === "undefined") return;

    try {
      const keys = Object.keys(localStorage);
      keys.forEach((key) => {
        if (key.startsWith(this.prefix) && key.includes(pattern)) {
          localStorage.removeItem(key);
        }
      });
    } catch (error) {
      console.error("Erreur lors de l'invalidation du cache:", error);
    }
  }
}

// Instance singleton
export const organizerCache = new OrganizerCache();

// Clés de cache standardisées
export const CACHE_KEYS = {
  ORGANIZERS: "organizers",
  LOCATIONS: "locations",
  ROOMS: "rooms",
  CATEGORIES: "categories",
  TAGS: "tags",
  ALL_ORGANIZERS: "all_organizers",
  EVENTS: (organizerId?: string) => organizerId ? `events.${organizerId}` : "events",
  EVENT: (eventId: string) => `event.${eventId}`,
} as const;

// TTLs en millisecondes
export const CACHE_TTL = {
  ORGANIZERS: 10 * 60 * 1000, // 10 minutes
  LOCATIONS: 15 * 60 * 1000, // 15 minutes
  ROOMS: 10 * 60 * 1000, // 10 minutes
  CATEGORIES: 30 * 60 * 1000, // 30 minutes (changent rarement)
  TAGS: 30 * 60 * 1000, // 30 minutes
  ALL_ORGANIZERS: 10 * 60 * 1000, // 10 minutes
  EVENTS: 2 * 60 * 1000, // 2 minutes (changent souvent)
  EVENT: 5 * 60 * 1000, // 5 minutes
} as const;

// Nettoyer le cache au démarrage
if (typeof window !== "undefined") {
  organizerCache.cleanup();
}

