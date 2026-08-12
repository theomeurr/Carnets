import { useCarnets } from '../store/useCarnets'
import { IconAlert } from './Icons'

/**
 * Un bandeau franc quand l'écriture échoue. L'indicateur du haut suffit pour
 * dire « c'est en cours » ; il ne suffit pas pour dire « vos dernières
 * modifications ne sont nulle part ». Le bandeau disparaît de lui-même dès
 * qu'une écriture réussit — les modifications en attente sont réessayées.
 */
export function SaveBanner() {
  const { save } = useCarnets()
  if (save.status !== 'error') return null

  return (
    <div className="save-banner" role="alert">
      <IconAlert className="save-banner__icon" />
      <p>
        <strong>Vos dernières modifications ne sont pas enregistrées.</strong> {save.reason} Gardez
        cet onglet ouvert et copiez ailleurs ce qui compte : la prochaine tentative réessaiera
        d’écrire, mais rien ne garantit qu’elle aboutira.
      </p>
    </div>
  )
}
