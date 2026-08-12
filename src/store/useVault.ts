import { useCallback, useMemo, useRef, useState, type Dispatch, type RefObject } from 'react'
import {
  checkVerifier,
  decrypt,
  deriveKey,
  encrypt,
  makeVerifier,
  newSalt,
  PBKDF2_ITERATIONS,
} from '../lib/crypto'
import { lockObstacle, lockOfPage, pagesUnder } from '../lib/locks'
import type { CarnetsState, Id, Lock, LockScope, Page } from '../types'
import type { Action } from './reducer'

/** Le titre et le contenu d'une page, en clair. */
export interface PageContent {
  title: string
  html: string
  text: string
}

interface OpenLock {
  /** La clé dérivée du mot de passe. Non exportable, et jamais enregistrée. */
  key: CryptoKey
  /** Le contenu déchiffré des pages protégées — mémoire seulement. */
  content: Map<Id, PageContent>
}

export interface Vault {
  /** Les verrous ouverts dans cette session, par identifiant de cible. */
  openLocks: ReadonlySet<Id>
  /**
   * Le contenu lisible d'une page : le sien si elle est en clair, celui de la
   * session si elle est déverrouillée, et `null` si elle est fermée.
   */
  reveal: (page: Page) => PageContent | null
  protect: (scope: LockScope, id: Id, password: string) => Promise<void>
  unlock: (lockId: Id, password: string) => Promise<boolean>
  relock: (lockId?: Id) => void
  unprotect: (lockId: Id) => Promise<void>
  /**
   * Enregistre le contenu d'une page protégée, chiffré. Rend `false` si la page
   * n'est sous aucun verrou : l'appelant écrit alors en clair, normalement.
   */
  seal: (pageId: Id, content: PageContent) => Promise<boolean>
}

/**
 * La session déverrouillée. Rien de ce qui est ici ne touche le disque : les
 * clés et les textes en clair disparaissent au rechargement de la page, ce qui
 * fait que tout se reverrouille tout seul.
 */
export function useVault(latest: RefObject<CarnetsState>, dispatch: Dispatch<Action>): Vault {
  const [open, setOpen] = useState<Map<Id, OpenLock>>(() => new Map())

  // Miroir synchrone, pour les fonctions asynchrones qui ne peuvent pas
  // attendre le prochain rendu pour connaître l'état des verrous.
  const openRef = useRef(open)
  openRef.current = open

  const reveal = useCallback(
    (page: Page): PageContent | null => {
      const lock = lockOfPage(latest.current, page)
      if (!lock) return { title: page.title, html: page.html, text: page.text }
      return open.get(lock.id)?.content.get(page.id) ?? null
    },
    [latest, open],
  )

  const protect = useCallback(
    async (scope: LockScope, id: Id, password: string): Promise<void> => {
      const state = latest.current
      const obstacle = lockObstacle(state, scope, id)
      if (obstacle) throw new Error(obstacle)

      const salt = newSalt()
      const key = await deriveKey(password, salt, PBKDF2_ITERATIONS)
      const lock: Lock = {
        id,
        scope,
        salt,
        iterations: PBKDF2_ITERATIONS,
        verifier: await makeVerifier(key),
        createdAt: Date.now(),
      }

      // Le contenu quitte les pages pour n'exister qu'en chiffré — titre compris.
      const content = new Map<Id, PageContent>()
      const sealed: Page[] = []
      for (const page of pagesUnder(state, scope, id)) {
        const clear = { title: page.title, html: page.html, text: page.text }
        content.set(page.id, clear)
        sealed.push({
          ...page,
          title: '',
          html: '',
          text: '',
          cipher: await encrypt(key, JSON.stringify(clear)),
          updatedAt: lock.createdAt,
        })
      }

      dispatch({ type: 'lock/add', lock, pages: sealed })
      // On reste ouvert juste après avoir posé le verrou : demander le mot de
      // passe à quelqu'un qui vient de le choisir n'apprendrait rien à personne.
      setOpen((previous) => new Map(previous).set(id, { key, content }))
    },
    [latest, dispatch],
  )

  const unlock = useCallback(
    async (lockId: Id, password: string): Promise<boolean> => {
      const state = latest.current
      const lock = state.locks.find((candidate) => candidate.id === lockId)
      if (!lock) return false

      const key = await deriveKey(password, lock.salt, lock.iterations)
      // Le témoin tranche sans toucher aux notes : mauvais mot de passe, on
      // s'arrête là.
      if (!(await checkVerifier(key, lock.verifier))) return false

      const content = new Map<Id, PageContent>()
      for (const page of pagesUnder(state, lock.scope, lock.id)) {
        content.set(
          page.id,
          page.cipher
            ? (JSON.parse(await decrypt(key, page.cipher)) as PageContent)
            : { title: page.title, html: page.html, text: page.text },
        )
      }

      setOpen((previous) => new Map(previous).set(lockId, { key, content }))
      return true
    },
    [latest],
  )

  /** Referme : la clé et les textes en clair sont lâchés, il n'en reste rien. */
  const relock = useCallback((lockId?: Id) => {
    setOpen((previous) => {
      if (!lockId) return previous.size === 0 ? previous : new Map()
      if (!previous.has(lockId)) return previous
      const next = new Map(previous)
      next.delete(lockId)
      return next
    })
  }, [])

  const unprotect = useCallback(
    async (lockId: Id): Promise<void> => {
      const state = latest.current
      const lock = state.locks.find((candidate) => candidate.id === lockId)
      const entry = openRef.current.get(lockId)
      if (!lock) return
      if (!entry) throw new Error('Déverrouillez d’abord pour pouvoir retirer la protection.')

      const now = Date.now()
      const cleared = pagesUnder(state, lock.scope, lock.id).map((page) => {
        const clear = entry.content.get(page.id) ?? { title: '', html: '', text: '' }
        return { ...page, ...clear, cipher: null, updatedAt: now }
      })

      dispatch({ type: 'lock/remove', id: lockId, pages: cleared })
      relock(lockId)
    },
    [latest, dispatch, relock],
  )

  const seal = useCallback(
    async (pageId: Id, content: PageContent): Promise<boolean> => {
      const state = latest.current
      const page = state.pages.find((candidate) => candidate.id === pageId)
      if (!page) return false

      const lock = lockOfPage(state, page)
      if (!lock) return false // page en clair : l'appelant suit le chemin normal.

      const entry = openRef.current.get(lock.id)
      // Verrouillée et fermée : il n'y a pas de clé pour écrire, et il ne
      // devrait pas y avoir de frappe à enregistrer non plus.
      if (!entry) return true

      const cipher = await encrypt(entry.key, JSON.stringify(content))
      dispatch({ type: 'page/sealed', id: pageId, cipher, now: Date.now() })
      setOpen((previous) => {
        const current = previous.get(lock.id)
        if (!current) return previous
        const next = new Map(previous)
        next.set(lock.id, { ...current, content: new Map(current.content).set(pageId, content) })
        return next
      })
      return true
    },
    [latest, dispatch],
  )

  const openLocks = useMemo(() => new Set(open.keys()), [open])

  return useMemo(
    () => ({ openLocks, reveal, protect, unlock, relock, unprotect, seal }),
    [openLocks, reveal, protect, unlock, relock, unprotect, seal],
  )
}
