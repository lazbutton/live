import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";

/**
 * Formate une date ISO en préservant les heures/minutes exactes de la base de données
 * Évite le décalage de timezone en utilisant directement les valeurs originales
 * 
 * @param dateString - Date au format ISO string
 * @param formatStr - Format de date (défaut: "PPpp" pour date complète avec heure)
 * @returns Date formatée en français
 */
export function formatDateWithoutTimezone(
  dateString: string | null | undefined,
  formatStr: string = "PPpp"
): string {
  if (!dateString) return "-";
  
  try {
    // Si la date contient un timezone explicite, extraire directement les composants
    const timezoneMatch = dateString.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})([+-]\d{2}:\d{2}|Z)$/);
    if (timezoneMatch) {
      // Date avec timezone explicite : utiliser directement les valeurs sans conversion
      const [, year, month, day, hours, minutes] = timezoneMatch;
      const localDate = new Date(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        parseInt(hours),
        parseInt(minutes)
      );
      return format(localDate, formatStr, { locale: fr });
    }
    
    // Sinon, parser et utiliser les valeurs locales
    const date = parseISO(dateString);
    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();
    const hours = date.getHours();
    const minutes = date.getMinutes();
    
    const localDate = new Date(year, month, day, hours, minutes);
    
    return format(localDate, formatStr, { locale: fr });
  } catch (error) {
    console.error("Erreur lors du formatage de la date:", error, dateString);
    return dateString; // Retourner la valeur originale en cas d'erreur
  }
}

/**
 * Convertit une date ISO en format datetime-local pour les inputs HTML
 * Préserve les heures/minutes exactes sans conversion de timezone
 * 
 * @param dateString - Date au format ISO string
 * @returns Date au format YYYY-MM-DDTHH:mm pour les inputs datetime-local
 */
export function toDatetimeLocal(dateString: string | null | undefined): string {
  if (!dateString) return "";
  
  try {
    // Si la date contient un timezone explicite, extraire directement les composants
    // pour éviter la conversion UTC qui décalerait l'heure
    const timezoneMatch = dateString.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})([+-]\d{2}:\d{2}|Z)$/);
    if (timezoneMatch) {
      // Date avec timezone explicite : utiliser directement les valeurs
      const [, year, month, day, hours, minutes] = timezoneMatch;
      return `${year}-${month}-${day}T${hours}:${minutes}`;
    }
    
    // Sinon, parser et utiliser les valeurs locales (pas UTC)
    const date = parseISO(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  } catch (error) {
    console.error("Erreur lors de la conversion de la date:", error, dateString);
    return "";
  }
}

/**
 * Convertit une valeur datetime-local en ISO string pour la base de données
 * Interprète la valeur comme UTC pour préserver les heures/minutes exactes
 * 
 * @param datetimeLocal - Date au format YYYY-MM-DDTHH:mm
 * @returns Date au format ISO string en UTC
 */
export function fromDatetimeLocal(datetimeLocal: string | null | undefined): string {
  if (!datetimeLocal) return "";
  
  try {
    // Parse la date locale comme si c'était UTC
    const [datePart, timePart] = datetimeLocal.split("T");
    if (!datePart || !timePart) return "";
    
    const [year, month, day] = datePart.split("-").map(Number);
    const [hours, minutes] = timePart.split(":").map(Number);
    
    // Vérifier que tous les nombres sont valides
    if (isNaN(year) || isNaN(month) || isNaN(day) || isNaN(hours) || isNaN(minutes)) {
      return "";
    }
    
    // Créer une date en UTC pour préserver les heures/minutes exactes
    const date = new Date(Date.UTC(year, month - 1, day, hours, minutes));
    
    return date.toISOString();
  } catch (error) {
    console.error("Erreur lors de la conversion de la date locale:", error, datetimeLocal);
    return "";
  }
}

