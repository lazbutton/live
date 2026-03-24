"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase/client";

export function useOpenContentReportsCount() {
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function fetchCount() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          if (mounted) {
            setCount(0);
            setLoading(false);
          }
          return;
        }

        const { count: openCount, error } = await supabase
          .from("content_reports")
          .select("*", { count: "exact", head: true })
          .in("status", ["pending", "under_review"]);

        if (error) {
          console.error(
            "Erreur lors du comptage des signalements ouverts:",
            error,
          );
          if (mounted) {
            setCount(0);
          }
          return;
        }

        if (mounted) {
          setCount(openCount ?? 0);
        }
      } catch (error) {
        console.error(
          "Erreur lors du comptage des signalements ouverts:",
          error,
        );
        if (mounted) {
          setCount(0);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void fetchCount();
    const interval = window.setInterval(() => {
      void fetchCount();
    }, 30000);

    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

  return { count, loading };
}
