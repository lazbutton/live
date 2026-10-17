"use client";

import * as React from "react";
import Image from "next/image";
import type { User } from "@supabase/supabase-js";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase/client";

import { InstallHint } from "./install-hint";
import { QuickAddForm } from "./quick-add-form";

type AuthState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "forbidden"; email: string }
  | { status: "ready"; email: string };

function authStateOf(user: User | null): AuthState {
  if (!user) return { status: "signed-out" };
  const role = user.user_metadata?.role ?? user.app_metadata?.role;
  return role === "admin" ? { status: "ready", email: user.email ?? "" } : { status: "forbidden", email: user.email ?? "" };
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-md flex-col px-4 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-[max(env(safe-area-inset-top),1.25rem)]">
      {children}
    </div>
  );
}

function AppMark() {
  return <Image src="/ajout/app-icon/192?v=2" alt="" width={56} height={56} unoptimized className="mx-auto rounded-2xl" />;
}

function LoginScreen() {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (authError) {
      setError(authError.status === 400 ? "Email ou mot de passe incorrect." : "Connexion impossible : vérifie le réseau et réessaie.");
    }
    setPending(false);
  }

  return (
    <Screen>
      <form onSubmit={submit} className="my-auto w-full space-y-5">
        <div className="space-y-2 text-center">
          <AppMark />
          <h1 className="pt-2 text-xl font-semibold tracking-tight">OutLive Ajout</h1>
          <p className="text-sm text-muted-foreground">Connecte-toi avec ton compte admin.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="h-11"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Mot de passe</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-11"
          />
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          Se connecter
        </Button>
      </form>
    </Screen>
  );
}

function ForbiddenScreen({ email }: { email: string }) {
  return (
    <Screen>
      <div className="my-auto space-y-4 text-center">
        <AppMark />
        <h1 className="text-xl font-semibold tracking-tight">Accès réservé aux admins</h1>
        <p className="text-sm text-muted-foreground">Le compte {email || "connecté"} n&apos;a pas l&apos;accès administrateur.</p>
        <Button variant="outline" size="lg" className="w-full" onClick={() => supabase.auth.signOut()}>
          Changer de compte
        </Button>
      </div>
    </Screen>
  );
}

/** Écran mobile d'ajout rapide : connexion admin, puis formulaire. */
export function QuickAddApp({ sharedLink }: { sharedLink: string | null }) {
  const [auth, setAuth] = React.useState<AuthState>({ status: "loading" });

  React.useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => setAuth(authStateOf(session?.user ?? null)));
    return () => subscription.unsubscribe();
  }, []);

  React.useEffect(() => {
    // En développement, le cache gênerait le rechargement du code.
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/ajout-sw.js", { scope: "/ajout" }).catch(() => {});
  }, []);

  if (auth.status === "loading") {
    return (
      <Screen>
        <Loader2 className="m-auto size-5 animate-spin text-muted-foreground" aria-label="Chargement" />
      </Screen>
    );
  }
  if (auth.status === "signed-out") return <LoginScreen />;
  if (auth.status === "forbidden") return <ForbiddenScreen email={auth.email} />;

  return (
    <Screen>
      <header className="pb-5">
        <h1 className="text-xl font-semibold tracking-tight">Ajouter à OutLive</h1>
        <p className="text-[13px] text-muted-foreground">Un lieu, une structure ou un artiste : l&apos;IA récupère ensuite les événements.</p>
      </header>
      <InstallHint />
      <QuickAddForm sharedLink={sharedLink} />
      <footer className="mt-auto pt-10 text-center text-xs text-muted-foreground">
        {auth.email} ·{" "}
        <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => supabase.auth.signOut()}>
          Se déconnecter
        </button>
      </footer>
    </Screen>
  );
}
