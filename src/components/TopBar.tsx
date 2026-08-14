import { useFolio } from '../store/useFolio'
import { nameOf } from '../sync/remote'
import { IconChevron, IconCloud as IconSync } from './Icons'
import { useMobilePane } from './paneContext'
import { IconAlert, IconCheck, IconCloud, IconLock, IconSearch } from './Icons'

/** Bandeau supérieur : identité, entrée de la recherche, état de l'enregistrement. */
export function TopBar({ onSearch, onAccount }: { onSearch: () => void; onAccount: () => void }) {
  const { state, save, vault, sync } = useFolio()
  const { pane, back } = useMobilePane()
  const pages = state.pages.length
  const openCount = vault.openLocks.size

  return (
    <header className="topbar">
      {/* Le retour ne s'affiche que sur petit écran, où une seule colonne
          est visible à la fois ; le CSS le masque au-delà. */}
      <button
        type="button"
        className="topbar__back"
        aria-label="Revenir en arrière"
        disabled={pane === 'browse'}
        onClick={back}
      >
        <IconChevron />
      </button>

      <div className="topbar__brand">
        <span className="topbar__mark" aria-hidden="true" />
        <span className="topbar__name">Folio</span>
      </div>

      <button type="button" className="topbar__search" onClick={onSearch}>
        <IconSearch />
        <span className="topbar__search-label">
          Rechercher dans {pages} page{pages > 1 ? 's' : ''}…
        </span>
        <kbd className="topbar__kbd">Ctrl K</kbd>
      </button>

      {openCount > 0 && (
        <button
          type="button"
          className="topbar__relock"
          onClick={() => vault.relock()}
          title="Referme tous les verrous ouverts et oublie les clés. Se fait aussi tout seul après 5 minutes sans activité."
        >
          <IconLock />
          Tout verrouiller
          {openCount > 1 && <span className="topbar__relock-count">{openCount}</span>}
        </button>
      )}

      {sync.available && (
        <button
          type="button"
          className={`topbar__account is-${sync.status}`}
          onClick={onAccount}
          title={accountTitle(sync)}
        >
          <IconSync />
          {sync.account ? nameOf(sync.account).short : 'Se connecter'}
        </button>
      )}

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

// Le bouton n'affiche que le prénom ; l'infobulle rappelle donc de quel
// compte il s'agit, ce que le prénom seul ne dit pas.
function accountTitle(sync: ReturnType<typeof useFolio>['sync']): string {
  if (!sync.account) return 'Se connecter pour retrouver ses notes sur ses autres appareils'
  const who = sync.account.email
  if (sync.status === 'syncing') return `${who} — synchronisation en cours…`
  if (sync.status === 'error') return `${who} — ${sync.reason ?? 'le dernier échange a échoué'}`
  if (!sync.lastSyncAt) return `${who} — connecté`
  return `${who} — à jour, dernier échange à ${new Date(sync.lastSyncAt).toLocaleTimeString('fr-FR')}`
}

function label(status: 'saved' | 'saving' | 'error'): string {
  if (status === 'saving') return 'Enregistrement…'
  if (status === 'error') return 'Non enregistré'
  return 'Enregistré'
}

function tooltip({ status, at, reason, driver }: ReturnType<typeof useFolio>['save']): string {
  if (status === 'error') return reason ?? 'Cause inconnue.'
  const support = driver === 'localstorage' ? 'le stockage de secours' : 'ce navigateur'
  if (!at) return `Vos notes sont enregistrées dans ${support}`
  return `Dernier enregistrement à ${new Date(at).toLocaleTimeString('fr-FR')}`
}
