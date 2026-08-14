import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useFolio } from '../store/useFolio'
import { nameOf } from '../sync/remote'
import { IconCheck, IconCloud, IconLock } from './Icons'

/**
 * La page de connexion, et la page du compte une fois connecté.
 *
 * C'est un écran plein, pas une boîte de dialogue : sur téléphone une fenêtre
 * flottante avec un clavier ouvert ne laisse presque rien à voir, et
 * l'inscription demande maintenant quatre champs. Elle recouvre l'espace de
 * travail sans le démonter — revenir aux notes les retrouve telles quelles,
 * curseur et historique d'annulation compris.
 *
 * `onDone` est appelé quand on quitte la page, de quelque manière que ce soit.
 */
export function AccountPage({ onDone }: { onDone: () => void }) {
  const { sync } = useFolio()

  // Échap referme, comme partout ailleurs dans l'application. Au premier
  // lancement cela revient à choisir de continuer sans compte, ce qui est
  // exactement ce que fait le bouton du même nom.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDone()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onDone])

  return (
    <div className="account-page" role="dialog" aria-modal="true" aria-label="Votre compte">
      <div className="account-page__sheet">
        <div className="account-page__brand">
          <span className="account-page__mark" aria-hidden="true" />
          <span className="account-page__wordmark">Folio</span>
        </div>
        {sync.account ? <Connected onDone={onDone} /> : <SignIn onDone={onDone} />}
      </div>
    </div>
  )
}

function SignIn({ onDone }: { onDone: () => void }) {
  const { sync } = useFolio()
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const first = useRef<HTMLInputElement>(null)

  const creating = mode === 'signUp'
  // À l'inscription on veut aussi l'identité ; à la connexion elle revient
  // toute seule du compte.
  const complete =
    email.trim() !== '' &&
    password !== '' &&
    (!creating || (firstName.trim() !== '' && lastName.trim() !== ''))

  // Changer de mode replace le curseur sur le premier champ qui a bougé : le
  // prénom quand il apparaît, l'adresse quand il disparaît.
  useEffect(() => {
    first.current?.focus()
  }, [mode])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!complete || busy) return
    setBusy(true)
    setError(null)
    try {
      if (creating) {
        await sync.signUp(email.trim(), password, {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
        })
      } else {
        await sync.signIn(email.trim(), password)
      }
      onDone()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Échec de la connexion.')
      setBusy(false)
    }
  }

  return (
    <form className="account-page__form" onSubmit={submit}>
      <h1 className="account-page__title">{creating ? 'Créer un compte' : 'Se connecter'}</h1>
      <p className="account-page__lead">
        Un compte garde vos notes à jour sur tous vos appareils. Sans compte, Folio fonctionne
        exactement pareil — tout reste simplement sur celui-ci.
      </p>

      {creating && (
        <div className="account-page__pair">
          <label className="field">
            <span className="field__label">Prénom</span>
            <input
              ref={first}
              className="field__input"
              type="text"
              autoComplete="given-name"
              autoCapitalize="words"
              value={firstName}
              disabled={busy}
              onChange={(event) => setFirstName(event.target.value)}
            />
          </label>
          <label className="field">
            <span className="field__label">Nom</span>
            <input
              className="field__input"
              type="text"
              autoComplete="family-name"
              autoCapitalize="words"
              value={lastName}
              disabled={busy}
              onChange={(event) => setLastName(event.target.value)}
            />
          </label>
        </div>
      )}

      <label className="field">
        <span className="field__label">Adresse électronique</span>
        <input
          ref={creating ? undefined : first}
          className="field__input"
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          value={email}
          disabled={busy}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>

      <label className="field">
        <span className="field__label">Mot de passe</span>
        <input
          className="field__input"
          type="password"
          autoComplete={creating ? 'new-password' : 'current-password'}
          value={password}
          disabled={busy}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>

      {error && <p className="field__error">{error}</p>}

      <button type="submit" className="button is-primary account-page__submit" disabled={!complete || busy}>
        {busy ? 'Un instant…' : creating ? 'Créer le compte' : 'Se connecter'}
      </button>

      <button
        type="button"
        className="account-page__switch"
        disabled={busy}
        onClick={() => {
          setMode(creating ? 'signIn' : 'signUp')
          setError(null)
        }}
      >
        {creating ? 'J’ai déjà un compte' : 'Pas encore de compte ? En créer un'}
      </button>

      <p className="account-page__note">
        <IconLock />
        <span>
          <strong>Le mot de passe du compte n’est pas celui de vos notes verrouillées.</strong> Une
          note protégée voyage chiffrée : le serveur n’en voit que du bruit, et son mot de passe ne
          quitte jamais cet appareil.
        </span>
      </p>

      <button type="button" className="account-page__skip" disabled={busy} onClick={onDone}>
        Continuer sans compte
      </button>
    </form>
  )
}

/** Ce que l'on voit quand on est déjà connecté. */
function Connected({ onDone }: { onDone: () => void }) {
  const { sync } = useFolio()
  const [busy, setBusy] = useState(false)
  const account = sync.account
  if (!account) return null
  const { short, full } = nameOf(account)

  return (
    <div className="account-page__form">
      <h1 className="account-page__title">Bonjour {short}</h1>
      <p className="account-page__lead">
        Connecté en tant que <strong>{full}</strong>
        <br />
        {account.email}
      </p>

      <p className="account-page__state">
        {sync.status === 'synced' ? <IconCheck /> : <IconCloud />}
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

      <button type="button" className="button is-primary account-page__submit" onClick={onDone}>
        Revenir à mes notes
      </button>

      <button
        type="button"
        className="account-page__signout"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          await sync.signOut()
          onDone()
        }}
      >
        {busy ? 'Un instant…' : 'Se déconnecter'}
      </button>

      <p className="account-page__note">
        <IconLock />
        <span>
          La déconnexion laisse vos notes sur cet appareil. Elle efface seulement le lien avec le
          compte.
        </span>
      </p>
    </div>
  )
}
