import { useCarnets } from '../store/useCarnets'
import { IconCheck, IconCloud, IconSearch } from './Icons'

/** Bandeau supérieur : identité, entrée de la recherche, état de l'enregistrement. */
export function TopBar({ onSearch }: { onSearch: () => void }) {
  const { state, saveStatus, savedAt } = useCarnets()
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

      <p
        className={`save-badge is-${saveStatus}`}
        aria-live="polite"
        title={
          savedAt
            ? `Dernier enregistrement à ${new Date(savedAt).toLocaleTimeString('fr-FR')}`
            : 'Vos notes sont enregistrées dans ce navigateur'
        }
      >
        {saveStatus === 'saving' ? <IconCloud /> : <IconCheck />}
        <span>{saveStatus === 'saving' ? 'Enregistrement…' : 'Enregistré'}</span>
      </p>
    </header>
  )
}
