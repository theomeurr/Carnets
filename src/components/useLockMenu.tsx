import { useState, type ReactNode } from 'react'
import { lockObstacle, lockOn, pagesUnder } from '../lib/locks'
import { useCarnets } from '../store/useCarnets'
import type { Id, LockScope } from '../types'
import { ProtectDialog, UnlockDialog } from './LockDialogs'

export type LockStatus = 'none' | 'closed' | 'open'

export interface LockControls {
  status: LockStatus
  /** Ce qui interdit de poser un verrou ici, ou `null` si c'est possible. */
  obstacle: string | null
  onProtect: () => void
  onUnlock: () => void
  onRelock: () => void
  onUnprotect: () => void
}

/**
 * Fabrique les commandes de verrouillage d'une ligne et porte les boîtes de
 * dialogue. Les trois colonnes s'en servent à l'identique : un bloc-notes, une
 * section et une page se protègent exactement de la même façon.
 */
export function useLockMenu(): {
  controlsFor: (scope: LockScope, id: Id, name: string) => LockControls
  dialogs: ReactNode
} {
  const { state, vault } = useCarnets()
  const [pending, setPending] = useState<{
    mode: 'protect' | 'unlock'
    scope: LockScope
    id: Id
    name: string
  } | null>(null)

  const controlsFor = (scope: LockScope, id: Id, name: string): LockControls => {
    const lock = lockOn(state, scope, id)
    return {
      status: !lock ? 'none' : vault.openLocks.has(lock.id) ? 'open' : 'closed',
      obstacle: lock ? null : lockObstacle(state, scope, id),
      onProtect: () => setPending({ mode: 'protect', scope, id, name }),
      onUnlock: () => setPending({ mode: 'unlock', scope, id, name }),
      onRelock: () => vault.relock(id),
      onUnprotect: () => void vault.unprotect(id),
    }
  }

  const dialogs =
    pending?.mode === 'protect' ? (
      <ProtectDialog
        scope={pending.scope}
        name={pending.name}
        pageCount={pagesUnder(state, pending.scope, pending.id).length}
        onClose={() => setPending(null)}
        onSubmit={async (password) => {
          await vault.protect(pending.scope, pending.id, password)
          setPending(null)
        }}
      />
    ) : pending?.mode === 'unlock' ? (
      <UnlockDialog
        scope={pending.scope}
        name={pending.name}
        onClose={() => setPending(null)}
        onSubmit={async (password) => {
          const opened = await vault.unlock(pending.id, password)
          if (opened) setPending(null)
          return opened
        }}
      />
    ) : null

  return { controlsFor, dialogs }
}
