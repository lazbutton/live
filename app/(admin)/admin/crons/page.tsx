"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { AdminLayout } from "../components/admin-layout";
import { CronsManagement } from "../components/crons-management";
import { Loader2 } from "lucide-react";

export default function CronsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    checkAdmin();
  }, []);

  async function checkAdmin() {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      
      if (error || !user) {
        router.push("/admin/login");
        return;
      }

      const role = user.user_metadata?.role;
      if (role !== "admin") {
        router.push("/admin/login");
        return;
      }

      setIsAdmin(true);
    } catch (error) {
      console.error("Erreur lors de la vérification admin:", error);
      router.push("/admin/login");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <AdminLayout title="Gestion des Crons">
      <CronsManagement />
    </AdminLayout>
  );
}

