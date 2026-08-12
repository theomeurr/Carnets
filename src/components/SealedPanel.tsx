import { useEffect, useRef, useState, type FormEvent } from 'react'
import { describeScope } from '../lib/locks'
import { useCarnets } from '../store/useCarnets'
import type { Lock } from '../types'
import { IconLock } from './Icons'

/**
 * Ce qui remplace l'éditeur quand la page ouverte est protégée et fermée.
 * Le déverrouillage se fait ici, sans boîte de dialogue : c'est l'endroit où
 * l'on est déjà, et la page attend derrière.
 */
export function SealedPanel({
  lock,
  accent,
  breadcrumb,
}: {
  lock: Lock
  accent: string
  breadcrumb: string
}) {
  const { state, vault } = useCarnets()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  // Changer de page verrouillée doit repartir d'un champ vide.
  useEffect(() => {
    setPassword('')
    setError(null)
    input.current?.focus()
  }, [lock.id])

  const name = targetName(state, lock)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!password || busy) return
    setBusy(true)
    setError(null)
    try {
      const opened = await vault.unlock(lock.id, password)
      if (!opened) {
        setError('Mot de passe incorrect.')
        setPassword('')
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Le déverrouillage a échoué.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      className="editor editor--sealed"
      aria-label="Page verrouillée"
      style={{ '--accent': accent } as React.CSSProperties}
    >
      <form className="sealed" onSubmit={submit}>
        <IconLock className="sealed__icon" />
        <p className="sealed__path">{breadcrumb}</p>
        <h2 className="sealed__title">
          {describeScope(lock.scope) === 'la page'
            ? 'Cette page est verrouillée'
            : `${capitalize(describeScope(lock.scope))} « ${name} » est verrouillée`}
        </h2>
        <p className="sealed__lead">
          Le contenu est chiffré. Saisissez le mot de passe pour le lire et le modifier.
        </p>

        <input
          ref={input}
          className="field__input sealed__input"
          type="password"
          autoComplete="current-password"
          aria-label="Mot de passe"
          placeholder="Mot de passe"
          value={password}
          disabled={busy}
          onChange={(event) => setPassword(event.target.value)}
        />
        {error && <p className="field__error sealed__error">{error}</p>}

        <button type="submit" className="button is-primary" disabled={!password || busy}>
          {busy ? 'Vérification…' : 'Déverrouiller'}
        </button>
      </form>
    </section>
  )
}

function targetName(state: ReturnType<typeof useCarnets>['state'], lock: Lock): string {
  if (lock.scope === 'notebook') {
    return state.notebooks.find((n) => n.id === lock.id)?.name ?? ''
  }
  if (lock.scope === 'section') {
    return state.sections.find((s) => s.id === lock.id)?.name ?? ''
  }
  return ''
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
