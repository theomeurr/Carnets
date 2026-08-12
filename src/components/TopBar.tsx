import { useCarnets } from '../store/useCarnets'
import { IconAlert, IconCheck, IconCloud, IconSearch } from './Icons'

/** Bandeau supérieur : identité, entrée de la recherche, état de l'enregistrement. */
export function TopBar({ onSearch }: { onSearch: () => void }) {
  const { state, save } = useCarnets()
  const pages = state.pages.length

  return (
    <header className="topbar">
      <div className="topbar__brand">
        <span className="topbar__mark" aria-hidden="true" />
        <span className="topbar__name">Carnets</span>
      </div>

      <button type="button" className="topbar__search" onClick={onSearch}>
        <IconSearch />
        <span className="topbar__search-label">
          Rechercher dans {pages} page{pages > 1 ? 's' : ''}…
        </span>
        <kbd className="topbar__kbd">Ctrl K</kbd>
      </button>

      <p className={`save-badge is-${save.status}`} aria-live="polite" title={tooltip(save)}>
        {save.status === 'saving' ? (
          <IconCloud />
        ) : save.status === 'error' ? (
          <IconAlert />
        ) : (
          <IconCheck />
        )}
        <span>{label(save.status)}</span>
      </p>
    </header>
  )
}

function label(status: 'saved' | 'saving' | 'error'): string {
  if (status === 'saving') return 'Enregistrement…'
  if (status === 'error') return 'Non enregistré'
  return 'Enregistré'
}

function tooltip({ status, at, reason, driver }: ReturnType<typeof useCarnets>['save']): string {
  if (status === 'error') return reason ?? 'Cause inconnue.'
  const support = driver === 'localstorage' ? 'le stockage de secours' : 'ce navigateur'
  if (!at) return `Vos notes sont enregistrées dans ${support}`
  return `Dernier enregistrement à ${new Date(at).toLocaleTimeString('fr-FR')}`
}
