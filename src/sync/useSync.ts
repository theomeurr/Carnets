import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch } from 'react'
import type { Action } from '../store/reducer'
import type { FolioState } from '../types'
import { syncConfig } from './config'
import { syncOnce } from './engine'
import { readableAuthError, type Account, type Remote } from './remote'
import { supabaseRemote } from './supabase'

export type SyncStatus =
  /** Pas de compte : l'application est purement locale, comme avant. */
  | 'off'
  | 'syncing'
  | 'synced'
  | 'error'

export interface SyncApi {
  /** `null` si la synchronisation n'est pas configurée du tout. */
  available: boolean
  account: Account | null
  status: SyncStatus
  /** Renseigné quand `status` vaut `error`. */
  reason: string | null
  lastSyncAt: number | null

  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  /** Déclenche un tour immédiatement. */
  syncNow: () => void
}

/** Intervalle entre deux tours, quand rien ne les provoque. */
const PERIOD_MS = 20_000
/** Attente après une frappe avant d'envoyer, pour ne pas parler à chaque mot. */
const DEBOUNCE_MS = 3_000

/** Le curseur est propre à chaque compte : en changer ne doit rien mélanger. */
const cursorKey = (accountId: string) => `folio:sync-cursor:${accountId}`

function readCursor(accountId: string): number {
  try {
    return Number(localStorage.getItem(cursorKey(accountId)) ?? 0) || 0
  } catch {
    return 0
  }
}

function writeCursor(accountId: string, cursor: number): void {
  try {
    localStorage.setItem(cursorKey(accountId), String(cursor))
  } catch {
    // Sans stockage, on repartira de zéro au prochain lancement : la
    // synchronisation sera plus bavarde, mais restera correcte.
  }
}

/**
 * La synchronisation, branchée sur le magasin local.
 *
 * Elle ne fait jamais autorité : IndexedDB reste la source de vérité, et tout
 * continue de fonctionner sans compte et sans réseau. Un tour de
 * synchronisation ne fait qu'apporter ce que les autres appareils ont écrit,
 * puis proposer ce qu'on a écrit soi-même.
 */
export function useSync(
  latest: { current: FolioState },
  dispatch: Dispatch<Action>,
  ready: boolean,
): SyncApi {
  const remote = useMemo<Remote | null>(() => {
    const config = syncConfig()
    return config ? supabaseRemote(config) : null
  }, [])

  const [account, setAccount] = useState<Account | null>(null)
  const [status, setStatus] = useState<SyncStatus>('off')
  const [reason, setReason] = useState<string | null>(null)
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null)

  const accountRef = useRef(account)
  accountRef.current = account
  /** Les tours se suivent : jamais deux en même temps. */
  const running = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ----- Le compte -----

  useEffect(() => {
    if (!remote) return
    void remote.currentAccount().then(setAccount)
    return remote.onAccountChange(setAccount)
  }, [remote])

  // ----- Un tour -----

  const run = useCallback(async () => {
    const current = accountRef.current
    if (!remote || !current || running.current || !navigator.onLine) return

    running.current = true
    setStatus('syncing')
    try {
      const before = readCursor(current.id)
      const outcome = await syncOnce(remote, latest.current, before)
      // Ce qui arrive du serveur repasse par le reducer, donc par `settle` :
      // la page ouverte a pu être supprimée ailleurs.
      if (outcome.received) dispatch({ type: 'state/hydrate', state: outcome.state })
      writeCursor(current.id, outcome.cursor)
      setLastSyncAt(Date.now())
      setReason(null)
      setStatus('synced')
    } catch (error) {
      // Le curseur n'a pas bougé : ce qui n'est pas parti repartira.
      setReason(readableAuthError(error instanceof Error ? error.message : 'Échec inconnu.'))
      setStatus('error')
    } finally {
      running.current = false
    }
  }, [remote, latest, dispatch])

  const syncNow = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    void run()
  }, [run])

  // ----- Quand synchroniser -----

  useEffect(() => {
    if (!account) {
      setStatus('off')
      return
    }
    // À la connexion, tout de suite : c'est le moment où l'on attend ses notes.
    void run()
    const interval = setInterval(() => void run(), PERIOD_MS)
    const onOnline = () => void run()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void run()
    }
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(interval)
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [account, run])

  // Une modification locale déclenche un envoi, une fois la main arrêtée.
  const { notebooks, sections, pages, locks, tombstones } = latest.current
  useEffect(() => {
    if (!account || !ready) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void run(), DEBOUNCE_MS)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [account, ready, run, notebooks, sections, pages, locks, tombstones])

  // ----- Compte -----

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!remote) throw new Error('La synchronisation n’est pas configurée.')
      setAccount(await remote.signIn(email, password))
    },
    [remote],
  )

  const signUp = useCallback(
    async (email: string, password: string) => {
      if (!remote) throw new Error('La synchronisation n’est pas configurée.')
      setAccount(await remote.signUp(email, password))
    },
    [remote],
  )

  const signOut = useCallback(async () => {
    if (!remote) return
    const current = accountRef.current
    await remote.signOut()
    // Le curseur s'en va avec le compte : une reconnexion doit tout relire,
    // sans quoi les modifications survenues entre-temps seraient manquées.
    if (current) {
      try {
        localStorage.removeItem(cursorKey(current.id))
      } catch {
        // Sans importance : au pire on relira tout.
      }
    }
    setAccount(null)
    setStatus('off')
  }, [remote])

  return useMemo(
    () => ({
      available: remote !== null,
      account,
      status,
      reason,
      lastSyncAt,
      signIn,
      signUp,
      signOut,
      syncNow,
    }),
    [remote, account, status, reason, lastSyncAt, signIn, signUp, signOut, syncNow],
  )
}
