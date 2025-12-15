"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { Loader2 } from "lucide-react";
import { Toaster } from "@/components/ui/toaster";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isChecking, setIsChecking] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);

  useEffect(() => {
    // Ne pas vérifier l'accès sur la page de login
    if (pathname === "/admin/login") {
      setIsChecking(false);
      setHasAccess(true);
      return;
    }
    checkAdminAccess();
  }, [pathname]);

  async function checkAdminAccess() {
    try {
      setIsChecking(true);

      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push("/admin/login");
        return;
      }

      // Vérifier que l'utilisateur est admin
      const role = user.user_metadata?.role;
      
      if (role !== "admin") {
        // Si l'utilisateur est organisateur mais pas admin, rediriger vers l'interface organisateur
        const { checkIsOrganizer } = await import("@/lib/auth");
        const isOrganizer = await checkIsOrganizer();
        
        if (isOrganizer) {
          router.push("/organizer");
        } else {
          router.push("/admin/login");
        }
        return;
      }

      setHasAccess(true);
    } catch (error) {
      console.error("Erreur lors de la vérification d'accès admin:", error);
      router.push("/admin/login");
    } finally {
      setIsChecking(false);
    }
  }

  if (isChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">Vérification des permissions...</p>
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return null;
  }

  return (
    <>
      {children}
      <Toaster />
    </>
  );
}


