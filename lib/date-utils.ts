import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";

/**
 * Formate une date ISO en préservant les heures/minutes exactes de la base de données
 * Évite le décalage de timezone en utilisant directement les valeurs UTC
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
    const date = parseISO(dateString);
    // Extraire les composants UTC pour éviter la conversion timezone
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const day = date.getUTCDate();
    const hours = date.getUTCHours();
    const minutes = date.getUTCMinutes();
    
    // Créer une nouvelle date en utilisant les valeurs UTC mais en locale
    // Cela préserve les heures/minutes exactes sans conversion
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
    const date = parseISO(dateString);
    // Extraire les composants UTC
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    const hours = String(date.getUTCHours()).padStart(2, "0");
    const minutes = String(date.getUTCMinutes()).padStart(2, "0");
    
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

