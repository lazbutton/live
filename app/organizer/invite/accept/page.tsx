"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

function AcceptInvitationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<"loading" | "signup" | "success" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [invitation, setInvitation] = useState<{
    email: string;
    organizer_name: string;
    role: string;
  } | null>(null);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Token d'invitation manquant");
      setStep("error");
      setLoading(false);
      return;
    }

    loadInvitation();
  }, [token]);

  async function loadInvitation() {
    try {
      // Récupérer les détails de l'invitation
      const response = await fetch(`/api/organizer/invite/verify?token=${token}`);
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Invitation invalide ou expirée");
        setStep("error");
        return;
      }

      setInvitation(data.invitation);
      
      // Vérifier si l'utilisateur existe déjà
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        if (user.email?.toLowerCase() === data.invitation.email.toLowerCase()) {
          // L'utilisateur est déjà connecté avec cet email, accepter directement
          await acceptInvitation();
        } else {
          // L'utilisateur est connecté avec un autre email
          setError(
            `Vous êtes connecté avec ${user.email} mais l'invitation est pour ${data.invitation.email}. Veuillez vous déconnecter et créer un compte ou vous connecter avec l'email de l'invitation.`
          );
          setStep("signup");
        }
      } else {
        // L'utilisateur doit créer un compte ou se connecter
        setStep("signup");
      }
    } catch (err: any) {
      console.error("Erreur:", err);
      setError("Erreur lors du chargement de l'invitation");
      setStep("error");
    } finally {
      setLoading(false);
    }
  }

  async function acceptInvitation() {
    if (!token) return;

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError("Vous devez être connecté pour accepter l'invitation");
        return;
      }

      const response = await fetch("/api/organizer/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Erreur lors de l'acceptation de l'invitation");
        return;
      }

      setStep("success");
      
      // Rediriger vers l'interface organisateur après 2 secondes
      setTimeout(() => {
        router.push("/organizer");
      }, 2000);
    } catch (err: any) {
      console.error("Erreur:", err);
      setError("Erreur lors de l'acceptation");
    }
  }

  async function handleSignUp() {
    if (!password || password.length < 6) {
      setError("Le mot de passe doit contenir au moins 6 caractères");
      return;
    }

    if (password !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas");
      return;
    }

    if (!invitation) return;

    setSubmitting(true);
    setError(null);

    try {
      // Créer le compte utilisateur via l'API admin (email automatiquement confirmé)
      const createUserResponse = await fetch("/api/organizer/invite/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: invitation.email,
          password,
        }),
      });

      const createUserData = await createUserResponse.json();

      if (!createUserResponse.ok) {
        // Si l'utilisateur existe déjà (409), essayer de se connecter
        if (createUserResponse.status === 409) {
          const { error: signInError } = await supabase.auth.signInWithPassword({
            email: invitation.email,
            password,
          });

          if (signInError) {
            setError(
              "Ce compte existe déjà. Veuillez vous connecter avec votre mot de passe, puis cliquez à nouveau sur le lien d'invitation."
            );
            return;
          }

          // Connecté avec succès, attendre un peu que la session soit établie
          await new Promise((resolve) => setTimeout(resolve, 500));
          
          // Vérifier que l'utilisateur est bien connecté avec le bon email
          const {
            data: { user: currentUser },
          } = await supabase.auth.getUser();
          
          if (!currentUser || currentUser.email?.toLowerCase() !== invitation.email.toLowerCase()) {
            setError("Erreur lors de la connexion. Veuillez réessayer.");
            return;
          }
          
          await acceptInvitation();
          return;
        }

        setError(createUserData.error || "Erreur lors de la création du compte");
        return;
      }

      if (createUserData.user) {
        // Compte créé et automatiquement confirmé, maintenant se connecter
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: invitation.email,
          password,
        });

        if (signInError) {
          setError("Compte créé mais erreur lors de la connexion. Veuillez vous connecter manuellement.");
          return;
        }

        // Attendre que la session soit établie
        await new Promise((resolve) => setTimeout(resolve, 500));
        
        // Vérifier que l'utilisateur est bien connecté
        const {
          data: { user: currentUser },
        } = await supabase.auth.getUser();
        
        if (!currentUser || currentUser.email?.toLowerCase() !== invitation.email.toLowerCase()) {
          setError("Erreur lors de la connexion. Veuillez vous connecter avec votre compte, puis réessayez.");
          return;
        }
        
        // Accepter l'invitation
        await acceptInvitation();
      } else {
        setError("Erreur lors de la création du compte");
      }
    } catch (err: any) {
      console.error("Erreur:", err);
      setError("Erreur lors de la création du compte");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Chargement de l'invitation...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Erreur
            </CardTitle>
            <CardDescription>
              Impossible de traiter cette invitation
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === "success") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center space-y-4 text-center">
              <CheckCircle2 className="h-16 w-16 text-green-600" />
              <div>
                <h2 className="text-2xl font-semibold">Invitation acceptée !</h2>
                <p className="text-sm text-muted-foreground mt-2">
                  Vous allez être redirigé vers votre interface organisateur...
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Accepter l'invitation</CardTitle>
          <CardDescription>
            {invitation && (
              <>
                Vous avez été invité à rejoindre <strong>{invitation.organizer_name}</strong> en tant que{" "}
                {invitation.role === "owner" ? "propriétaire" : invitation.role === "editor" ? "éditeur" : "visualiseur"}.
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {invitation && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={invitation.email}
                  disabled
                  className="bg-muted"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Mot de passe</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 6 caractères"
                  disabled={submitting}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirmez votre mot de passe"
                  disabled={submitting}
                  required
                />
              </div>

              <div className="space-y-2">
                <Button
                  onClick={handleSignUp}
                  className="w-full"
                  disabled={submitting || !password || !confirmPassword}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Création du compte...
                    </>
                  ) : (
                    "Créer mon compte et accepter"
                  )}
                </Button>
                {error && error.includes("connecté avec") && (
                  <Button
                    onClick={async () => {
                      await supabase.auth.signOut();
                      window.location.reload();
                    }}
                    variant="outline"
                    className="w-full"
                  >
                    Se déconnecter
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AcceptInvitationPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
          <Card className="w-full max-w-md">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center justify-center space-y-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Chargement...</p>
              </div>
            </CardContent>
          </Card>
        </div>
      }
    >
      <AcceptInvitationContent />
    </Suspense>
  );
}

