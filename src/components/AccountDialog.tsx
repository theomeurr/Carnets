import { useState, type FormEvent } from 'react'
import { useFolio } from '../store/useFolio'
import { IconCloud, IconLock } from './Icons'
import { Modal } from './Modal'

/**
 * Connexion, inscription, déconnexion. Un seul écran : le même formulaire
 * bascule d'un mode à l'autre, parce que la différence entre « je reviens »
 * et « je m'inscris » ne mérite pas deux parcours.
 */
export function AccountDialog({ onClose }: { onClose: () => void }) {
  const { sync } = useFolio()
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (sync.account) return <ConnectedDialog onClose={onClose} />

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!email || !password || busy) return
    setBusy(true)
    setError(null)
    try {
      if (mode === 'signIn') await sync.signIn(email, password)
      else await sync.signUp(email, password)
      onClose()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Échec de la connexion.')
      setBusy(false)
    }
  }

  return (
    <Modal
      title={mode === 'signIn' ? 'Se connecter' : 'Créer un compte'}
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          <button type="button" className="button" onClick={onClose} disabled={busy}>
            Annuler
          </button>
          <button
            type="button"
            className="button is-primary"
            onClick={submit}
            disabled={!email || !password || busy}
          >
            {busy ? 'Un instant…' : mode === 'signIn' ? 'Se connecter' : 'Créer le compte'}
          </button>
        </>
      }
    >
      <form onSubmit={submit}>
        <p className="dialog-lead">
          Un compte permet de retrouver vos notes sur vos autres appareils. Sans compte, Folio
          fonctionne exactement pareil — tout reste simplement sur celui-ci.
        </p>

        <label className="field">
          <span className="field__label">Adresse électronique</span>
          <input
            className="field__input"
            type="email"
            autoComplete="email"
            value={email}
            disabled={busy}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>

        <label className="field" style={{ marginTop: 12 }}>
          <span className="field__label">Mot de passe</span>
          <input
            className="field__input"
            type="password"
            autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
            value={password}
            disabled={busy}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        {error && <p className="field__error">{error}</p>}

        <button
          type="button"
          className="dialog-switch"
          disabled={busy}
          onClick={() => {
            setMode(mode === 'signIn' ? 'signUp' : 'signIn')
            setError(null)
          }}
        >
          {mode === 'signIn' ? 'Pas encore de compte ? En créer un' : 'J’ai déjà un compte'}
        </button>

        <p className="dialog-warning">
          <IconLock />
          <span>
            <strong>Le mot de passe du compte n’est pas celui de vos notes verrouillées.</strong>{' '}
            Une note protégée voyage chiffrée : le serveur n’en voit que du bruit, et son mot de
            passe ne quitte jamais cet appareil.
          </span>
        </p>
      </form>
    </Modal>
  )
}

/** Ce que l'on voit quand on est déjà connecté. */
function ConnectedDialog({ onClose }: { onClose: () => void }) {
  const { sync } = useFolio()
  const [busy, setBusy] = useState(false)

  return (
    <Modal
      title="Votre compte"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="button" onClick={onClose}>
            Fermer
          </button>
          <button
            type="button"
            className="button is-danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              await sync.signOut()
              onClose()
            }}
          >
            Se déconnecter
          </button>
        </>
      }
    >
      <p className="dialog-lead" style={{ marginBottom: 12 }}>
        Connecté en tant que <strong>{sync.account?.email}</strong>.
      </p>

      <p className="account-state">
        <IconCloud />
        <span>
          {sync.status === 'syncing' && 'Synchronisation en cours…'}
          {sync.status === 'synced' &&
            (sync.lastSyncAt
              ? `À jour — dernier échange à ${new Date(sync.lastSyncAt).toLocaleTimeString('fr-FR')}.`
              : 'À jour.')}
          {sync.status === 'error' && (sync.reason ?? 'Le dernier échange a échoué.')}
          {sync.status === 'off' && 'En attente.'}
        </span>
      </p>

      <p className="dialog-lead" style={{ marginTop: 14, marginBottom: 0 }}>
        La déconnexion laisse vos notes sur cet appareil. Elle efface seulement le lien avec le
        compte.
      </p>
    </Modal>
  )
}
