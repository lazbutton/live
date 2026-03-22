"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { fetchPendingAdminRequestsCount } from "@/lib/admin-requests";

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

        const nextCount = await fetchPendingAdminRequestsCount();
        if (mounted) {
          setCount(nextCount);
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

