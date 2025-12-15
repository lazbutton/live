"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";

export function usePendingRequestsCount() {
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function fetchCount() {
      try {
        const { data: auth } = await supabase.auth.getUser();
        if (!auth?.user) {
          if (mounted) {
            setCount(0);
            setLoading(false);
          }
          return;
        }

        // Compter uniquement les demandes en attente (pending) avec dates futures ou sans date
        const now = new Date();
        now.setHours(0, 0, 0, 0);

        // Filtrer côté client pour exclure les demandes avec dates passées
        // On récupère toutes les demandes pending puis on filtre
        const { data: requests, error: fetchError } = await supabase
          .from("user_requests")
          .select("id, event_data")
          .in("request_type", ["event_creation", "event_from_url"])
          .eq("status", "pending");

        if (fetchError) {
          console.error("Erreur lors de la récupération des demandes:", fetchError);
          if (mounted) {
            setCount(0);
            setLoading(false);
          }
          return;
        }

        if (mounted && requests) {
          // Filtrer les demandes avec dates passées
          const validRequests = requests.filter((r) => {
            const eventDate = r.event_data?.date;
            if (!eventDate) return true; // Garder les demandes sans date
            const eventDateTimestamp = new Date(eventDate).getTime();
            if (Number.isNaN(eventDateTimestamp)) return true; // Garder si la date est invalide
            return eventDateTimestamp >= now.getTime();
          });

          setCount(validRequests.length);
        }
      } catch (err) {
        console.error("Erreur lors du comptage des demandes:", err);
        if (mounted) {
          setCount(0);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    fetchCount();

    // Rafraîchir toutes les 30 secondes
    const interval = setInterval(fetchCount, 30000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return { count, loading };
}

