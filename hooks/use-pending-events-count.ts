"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export function usePendingEventsCount() {
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

        const { count: pendingCount, error } = await supabase
          .from("events")
          .select("*", { count: "exact", head: true })
          .eq("status", "pending");

        if (error) {
          console.error("Erreur lors du comptage des événements en attente:", error);
          if (mounted) {
            setCount(0);
          }
          return;
        }

        if (mounted) {
          setCount(pendingCount ?? 0);
        }
      } catch (err) {
        console.error("Erreur lors du comptage des événements en attente:", err);
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
    const interval = setInterval(fetchCount, 30000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return { count, loading };
}

