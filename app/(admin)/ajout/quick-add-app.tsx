"use client";

import * as React from "react";
import Image from "next/image";
import type { User } from "@supabase/supabase-js";
import { ExternalLink, Loader2, LogOut } from "lucide-react";

import { supabase } from "@/lib/supabase/client";

import { QuickAddForm } from "./quick-add-form";
import { buttonClass, TextInput } from "./ui";

type AuthState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "forbidden"; email: string }
  | { status: "ready"; email: string };

const ICON = "/ajout/app-icon/192?v=3";

function authStateOf(user: User | null): AuthState {
  if (!user) return { status: "signed-out" };
  const role = user.app_metadata?.role;
  return role === "admin" ? { status: "ready", email: user.email ?? "" } : { status: "forbidden", email: user.email ?? "" };
}

function CenteredScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-sm flex-col justify-center px-6 pb-[max(env(safe-area-inset-bottom),2rem)] pt-[max(env(safe-area-inset-top),2rem)]">
      {children}
    </div>
  );
}

function AppIcon({ size }: { size: number }) {
  return (
    <Image
      src={ICON}
      alt=""
      width={size}
      height={size}
      unoptimized
      className="shrink-0"
      style={{ borderRadius: size * 0.27 }}
    />
  );
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
    <CenteredScreen>
      <div className="flex flex-col items-center text-center">
        <AppIcon size={72} />
        <h1 className="mt-5 text-[28px] font-semibold tracking-tight">OutLive Ajout</h1>
        <p className="mt-1.5 text-[15px] leading-snug text-muted-foreground">
          Un lieu, une structure, un artiste : ajoute-les en quelques secondes, l&apos;IA trouve les événements.
        </p>
      </div>
      <form onSubmit={submit} className="mt-9 space-y-3">
        <label className="sr-only" htmlFor="login-email">
          Email
        </label>
        <TextInput
          id="login-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          placeholder="Email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <label className="sr-only" htmlFor="login-password">
          Mot de passe
        </label>
        <TextInput
          id="login-password"
          type="password"
          autoComplete="current-password"
          placeholder="Mot de passe"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {error ? (
          <p role="alert" className="px-1 text-[14px] text-destructive">
            {error}
          </p>
        ) : null}
        <button type="submit" className={`${buttonClass()} mt-2 w-full`} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          Se connecter
        </button>
      </form>
      <p className="mt-6 text-center text-[13px] text-muted-foreground">Réservé aux comptes administrateur.</p>
    </CenteredScreen>
  );
}

function ForbiddenScreen({ email }: { email: string }) {
  return (
    <CenteredScreen>
      <div className="flex flex-col items-center text-center">
        <AppIcon size={72} />
        <h1 className="mt-5 text-[26px] font-semibold tracking-tight">Accès réservé aux admins</h1>
        <p className="mt-1.5 text-[15px] text-muted-foreground">
          Le compte {email || "connecté"} n&apos;a pas l&apos;accès administrateur.
        </p>
      </div>
      <button type="button" className={`${buttonClass({ variant: "secondary" })} mt-8 w-full`} onClick={() => supabase.auth.signOut()}>
        Changer de compte
      </button>
    </CenteredScreen>
  );
}

function AccountMenu({ email }: { email: string }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Compte"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex size-9 items-center justify-center rounded-full bg-muted text-[15px] font-semibold uppercase text-foreground outline-none focus-visible:ring-4 focus-visible:ring-ring/15"
      >
        {(email || "?").charAt(0)}
      </button>
      {open ? (
        <div className="absolute right-0 top-11 z-40 w-64 rounded-2xl border border-border bg-popover p-1.5 shadow-xl">
          <p className="truncate px-3 py-2 text-[13px] text-muted-foreground">{email}</p>
          <a href="/admin" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] active:bg-muted">
            <ExternalLink className="size-[18px] text-muted-foreground" />
            Ouvrir l&apos;admin
          </a>
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] text-destructive active:bg-muted"
            onClick={() => supabase.auth.signOut()}
          >
            <LogOut className="size-[18px]" />
            Se déconnecter
          </button>
        </div>
      ) : null}
    </div>
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
      <CenteredScreen>
        <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" aria-label="Chargement" />
      </CenteredScreen>
    );
  }
  if (auth.status === "signed-out") return <LoginScreen />;
  if (auth.status === "forbidden") return <ForbiddenScreen email={auth.email} />;

  return (
    <div className="min-h-svh">
      <header className="mx-auto flex w-full max-w-md items-center justify-between px-4 pb-1 pt-[max(env(safe-area-inset-top),0.75rem)]">
        <div className="flex items-center gap-2.5">
          <AppIcon size={30} />
          <span className="text-[17px] font-semibold tracking-tight">Ajout rapide</span>
        </div>
        <AccountMenu email={auth.email} />
      </header>
      <QuickAddForm sharedLink={sharedLink} />
    </div>
  );
}
