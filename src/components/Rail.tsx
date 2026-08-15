import { IconChevron } from './Icons'

/**
 * Ce qui reste d'un volet replié : une bande verticale portant son nom et de
 * quoi le rouvrir.
 *
 * Un volet qui disparaîtrait tout à fait laisserait l'application sans moyen
 * visible de le retrouver — il faudrait connaître un raccourci, ou deviner. La
 * bande coûte trente pixels et évite cela.
 */
export function Rail({ label, onOpen }: { label: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      className="rail"
      onClick={onOpen}
      aria-label={`Déplier ${label}`}
      title={`Déplier ${label}`}
    >
      <IconChevron className="rail__arrow" />
      <span className="rail__label">{label}</span>
    </button>
  )
}

/** Le bouton qui replie un volet, posé en tête de sa colonne. */
export function CollapseButton({ label, onClose }: { label: string; onClose: () => void }) {
  return (
    <button
      type="button"
      className="icon-button column-head__fold"
      onClick={onClose}
      aria-label={`Replier ${label}`}
      title={`Replier ${label}`}
    >
      <IconChevron />
    </button>
  )
}
