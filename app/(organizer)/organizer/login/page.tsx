"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Loader2 } from "lucide-react";
import { AdminLogoMark } from "@/app/(admin)/admin/components/admin-brand";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getUserType } from "@/lib/auth-helpers";

export default function OrganizerLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError(authError.message);
        return;
      }

      if (data.user) {
        // Vérifier le type d'utilisateur (admin, organisateur, ou les deux)
        const userType = await getUserType();

        if (userType === "none") {
          await supabase.auth.signOut();
          setError("Vous n'avez pas les permissions nécessaires pour accéder à cette interface.");
          return;
        }

        // Rediriger selon le type d'utilisateur
        if (userType === "admin") {
          router.push("/admin");
        } else if (userType === "organizer") {
          router.push("/organizer");
        } else if (userType === "admin_and_organizer") {
          // Si l'utilisateur est les deux, rediriger vers l'organisateur par défaut
          router.push("/organizer");
        }
      }
    } catch (err) {
      setError("Une erreur est survenue lors de la connexion.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      data-app-shell="organizer"
      className="flex min-h-svh flex-col items-center justify-center bg-muted/40 px-4 py-10 dark:bg-background"
    >
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <AdminLogoMark className="size-10 rounded-lg" />
          <div className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight">Espace organisateur</h1>
            <p className="text-sm text-muted-foreground">Connecte-toi pour gérer tes événements OutLive</p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="vous@exemple.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="animate-spin" />
                  Connexion…
                </>
              ) : (
                "Se connecter"
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
