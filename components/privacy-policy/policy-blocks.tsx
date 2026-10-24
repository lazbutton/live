import type { ReactNode } from "react";

/*
 * Briques de la politique de confidentialité (app/privacy-policy/page.tsx) : titres avec ancre,
 * liens, libellés de l'app entre guillemets. Le texte est en français, au « vous », avec les
 * espaces insécables écrites `&nbsp;`.
 */

/** Adresse des droits et des demandes de suppression. */
export const CONTACT_EMAIL = "lazbutton@proton.me";

/**
 * Ancre de « Supprimer votre compte OutLive » : l'adresse
 * https://www.outlive.fr/privacy-policy#supprimer-mon-compte est donnée à la Play Console (suppression
 * du compte). Ne pas la changer.
 */
export const ACCOUNT_DELETION_ANCHOR = "supprimer-mon-compte";

/** Les liens, soulignés : en thème sombre, `text-primary` a la couleur du texte. */
export const LINK_CLASS = "text-primary underline underline-offset-4 hover:opacity-80";

/** Une section numérotée ; [highlighted] l'encadre (« Supprimer votre compte OutLive »). */
export function PolicySection({
  id,
  title,
  highlighted = false,
  children,
}: {
  id: string;
  title: string;
  highlighted?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className={
        highlighted
          ? "scroll-mt-6 space-y-4 rounded-lg border-2 border-primary p-5 sm:p-6"
          : "scroll-mt-6 space-y-4"
      }
    >
      <h2 className="text-2xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function PolicySubsection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div id={id} className="scroll-mt-6 space-y-3 pt-4">
      <h3 className="text-xl font-semibold">{title}</h3>
      {children}
    </div>
  );
}

/** « Conservation : … », en fin de sous-section. */
export function Retention({ children }: { children: ReactNode }) {
  return (
    <p>
      <strong>Conservation&nbsp;:</strong> {children}
    </p>
  );
}

/** Un libellé de l'app ou du site, entre guillemets. */
export function Quote({ children }: { children: ReactNode }) {
  return <>«&nbsp;{children}&nbsp;»</>;
}

export function ExternalLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
      {children}
    </a>
  );
}

/** [CONTACT_EMAIL], avec un objet déjà rempli si [subject] est donné. */
export function ContactEmailLink({ subject }: { subject?: string }) {
  const href = subject
    ? `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`
    : `mailto:${CONTACT_EMAIL}`;
  return (
    <a href={href} className={LINK_CLASS}>
      {CONTACT_EMAIL}
    </a>
  );
}
