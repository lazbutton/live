"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function OrganizerPage() {
  const router = useRouter();

  useEffect(() => {
    router.push("/organizer/dashboard");
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <p className="text-muted-foreground">Redirection...</p>
      </div>
    </div>
  );
}

