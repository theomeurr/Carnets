import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch } from 'react'
import type { Action } from '../store/reducer'
import type { FolioState } from '../types'
import { syncConfig } from './config'
import { NEW_DEVICE, syncOnce, type Cursors } from './engine'
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

/**
 * Filet de sécurité, quand rien ne provoque de tour : la notification en
 * temps réel fait normalement le travail bien avant. Assez court pour que le
 * retard reste supportable si elle est indisponible — réseau d'entreprise qui
 * bloque les connexions persistantes, par exemple.
 */
const PERIOD_MS = 12_000
/** Attente après une frappe avant d'envoyer, pour ne pas parler à chaque mot. */
const DEBOUNCE_MS = 1_200
/** Regroupe les sonnettes rapprochées : un lot d'écritures ne fait qu'un tour. */
const BELL_MS = 250

/** Les repères sont propres à chaque compte : en changer ne doit rien mélanger. */
const cursorKey = (accountId: string) => `folio:sync-cursor:${accountId}`

function readCursors(accountId: string): Cursors {
  try {
    const raw = localStorage.getItem(cursorKey(accountId))
    if (!raw) return NEW_DEVICE
    const parsed = JSON.parse(raw) as Partial<Cursors>
    return {
      pulled: typeof parsed.pulled === 'number' ? parsed.pulled : 0,
      pushed: typeof parsed.pushed === 'number' ? parsed.pushed : 0,
    }
  } catch {
    // Illisible, ou écrit par la version à repère unique : on repart de zéro,
    // ce qui relit tout une fois et se remet d'aplomb.
    return NEW_DEVICE
  }
}

function writeCursors(accountId: string, cursors: Cursors): void {
  try {
    localStorage.setItem(cursorKey(accountId), JSON.stringify(cursors))
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
      const outcome = await syncOnce(remote, latest.current, readCursors(current.id))
      // Ce qui arrive du serveur repasse par le reducer, donc par `settle` :
      // la page ouverte a pu être supprimée ailleurs.
      if (outcome.received) dispatch({ type: 'state/hydrate', state: outcome.state })
      writeCursors(current.id, outcome.cursors)
      setLastSyncAt(Date.now())
      setReason(null)
      setStatus('synced')
    } catch (error) {
      // Les repères n'ont pas bougé : ce qui n'est pas parti repartira.
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
    // `focus` en plus de `visibilitychange` : deux fenêtres côte à côte sont
    // toutes deux « visibles », et passer de l'une à l'autre ne déclencherait
    // rien sans lui.
    window.addEventListener('online', onOnline)
    window.addEventListener('focus', onOnline)
    document.addEventListener('visibilitychange', onVisible)

    // La sonnette : un autre appareil a écrit, on va voir tout de suite.
    let bell: ReturnType<typeof setTimeout> | null = null
    const unsubscribe = remote?.onRemoteChange?.(() => {
      if (bell) clearTimeout(bell)
      bell = setTimeout(() => void run(), BELL_MS)
    })

    return () => {
      clearInterval(interval)
      if (bell) clearTimeout(bell)
      unsubscribe?.()
      window.removeEventListener('online', onOnline)
      window.removeEventListener('focus', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [account, run, remote])

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
