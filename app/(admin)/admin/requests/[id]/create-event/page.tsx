import { redirect } from "next/navigation";

/**
 * Ancienne page plein écran de conversion d'une demande. La conversion se fait
 * désormais sur place depuis la file des demandes (bouton « Compléter ») ;
 * on redirige les anciens liens vers la demande concernée.
 */
export default async function RequestCreateEventRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/admin/requests?request=${encodeURIComponent(id)}`);
}
