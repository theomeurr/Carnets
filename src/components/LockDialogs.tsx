import { useState, type FormEvent } from 'react'
import { describeScope } from '../lib/locks'
import type { LockScope } from '../types'
import { IconLock } from './Icons'
import { Modal } from './Modal'

const MIN_LENGTH = 6

interface ProtectProps {
  scope: LockScope
  name: string
  /** Nombre de pages qui seront chiffrées, pour que l'ampleur soit visible. */
  pageCount: number
  onSubmit: (password: string) => Promise<void>
  onClose: () => void
}

/**
 * Pose d'un mot de passe. L'avertissement n'est pas décoratif : sans le mot de
 * passe, les notes sont réellement irrécupérables — il n'existe ni copie en
 * clair, ni question secrète, ni personne à qui demander.
 */
export function ProtectDialog({ scope, name, pageCount, onSubmit, onClose }: ProtectProps) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const problem =
    password.length > 0 && password.length < MIN_LENGTH
      ? `Au moins ${MIN_LENGTH} caractères.`
      : confirmation.length > 0 && confirmation !== password
        ? 'Les deux saisies diffèrent.'
        : null

  const ready = password.length >= MIN_LENGTH && confirmation === password && !busy

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!ready) return
    setBusy(true)
    setError(null)
    try {
      await onSubmit(password)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Le verrouillage a échoué.')
      setBusy(false)
    }
  }

  return (
    <Modal
      title={`Protéger ${describeScope(scope)} « ${name} »`}
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          <button type="button" className="button" onClick={onClose} disabled={busy}>
            Annuler
          </button>
          <button type="button" className="button is-primary" onClick={submit} disabled={!ready}>
            {busy ? 'Chiffrement…' : 'Protéger'}
          </button>
        </>
      }
    >
      <form onSubmit={submit}>
        <p className="dialog-lead">
          {pageCount > 1
            ? `Les ${pageCount} pages seront chiffrées — titre compris. Elles n’apparaîtront plus dans la recherche tant que le verrou est fermé.`
            : 'La page sera chiffrée — titre compris. Elle n’apparaîtra plus dans la recherche tant que le verrou est fermé.'}
        </p>

        <label className="field">
          <span className="field__label">Mot de passe</span>
          <input
            className="field__input"
            type="password"
            autoComplete="new-password"
            value={password}
            disabled={busy}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        <label className="field" style={{ marginTop: 12 }}>
          <span className="field__label">Confirmation</span>
          <input
            className="field__input"
            type="password"
            autoComplete="new-password"
            value={confirmation}
            disabled={busy}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </label>

        {(problem || error) && <p className="field__error">{error ?? problem}</p>}

        <p className="dialog-warning">
          <IconLock />
          <span>
            <strong>Ce mot de passe n’est enregistré nulle part.</strong> Si vous l’oubliez, ces
            notes sont définitivement perdues : il n’y a aucun moyen de les récupérer.
          </span>
        </p>
      </form>
    </Modal>
  )
}

interface UnlockProps {
  name: string
  scope: LockScope
  onSubmit: (password: string) => Promise<boolean>
  onClose: () => void
}

/** Saisie du mot de passe pour rouvrir un verrou le temps de la session. */
export function UnlockDialog({ name, scope, onSubmit, onClose }: UnlockProps) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!password || busy) return
    setBusy(true)
    setError(null)
    try {
      const opened = await onSubmit(password)
      if (!opened) {
        setError('Mot de passe incorrect.')
        setPassword('')
        setBusy(false)
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Le déverrouillage a échoué.')
      setBusy(false)
    }
  }

  return (
    <Modal
      title={`Déverrouiller ${describeScope(scope)} « ${name} »`}
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
            disabled={!password || busy}
          >
            {busy ? 'Vérification…' : 'Déverrouiller'}
          </button>
        </>
      }
    >
      <form onSubmit={submit}>
        <label className="field">
          <span className="field__label">Mot de passe</span>
          <input
            className="field__input"
            type="password"
            autoComplete="current-password"
            value={password}
            disabled={busy}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error && <p className="field__error">{error}</p>}
        <p className="dialog-lead" style={{ marginTop: 12 }}>
          Le déverrouillage dure le temps de cette session : recharger la page referme tout.
        </p>
      </form>
    </Modal>
  )
}
