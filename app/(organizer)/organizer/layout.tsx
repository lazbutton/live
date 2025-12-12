"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { checkIsOrganizer } from "@/lib/auth";
import { OrganizerLayout } from "./components/organizer-layout";

export default function OrganizerRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    async function checkAccess() {
      const isOrg = await checkIsOrganizer();
      if (!isOrg) {
        router.push("/admin/login");
        return;
      }
      setIsAuthorized(true);
    }

    checkAccess();
  }, [router]);

  // Afficher un loader pendant la vérification
  if (isAuthorized === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center space-y-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Vérification des permissions...</p>
        </div>
      </div>
    );
  }

  // Ne rien afficher si non autorisé (redirection en cours)
  if (!isAuthorized) {
    return null;
  }

  return <>{children}</>;
}

