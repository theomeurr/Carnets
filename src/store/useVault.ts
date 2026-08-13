import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
} from 'react'
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
import type { FolioState, Id, Lock, LockScope, Page } from '../types'
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

/**
 * Inactivité tolérée avant que tout se referme. Un onglet laissé ouvert sur une
 * note déverrouillée finit par se reverrouiller tout seul.
 */
export const IDLE_LIMIT_MS = 5 * 60_000

/** Fréquence de la vérification : borne le dépassement à quelques secondes. */
const IDLE_CHECK_MS = 5_000

/**
 * Ce qui compte comme présence. Le défilement est écouté en capture, car il ne
 * remonte pas jusqu'à la fenêtre depuis une colonne qui défile.
 */
const ACTIVITY_EVENTS = [
  'pointerdown',
  'pointermove',
  'keydown',
  'wheel',
  'touchstart',
  'scroll',
] as const

export interface Vault {
  /** Les verrous ouverts dans cette session, par identifiant de cible. */
  openLocks: ReadonlySet<Id>
  /**
   * Renseigné quand c'est l'inactivité qui a refermé, et non l'utilisateur :
   * l'interface peut alors expliquer pourquoi la note s'est refermée seule.
   */
  autoRelockedAt: number | null
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
export function useVault(latest: RefObject<FolioState>, dispatch: Dispatch<Action>): Vault {
  const [open, setOpen] = useState<Map<Id, OpenLock>>(() => new Map())
  const [autoRelockedAt, setAutoRelockedAt] = useState<number | null>(null)

  // Miroir synchrone, pour les fonctions asynchrones qui ne peuvent pas
  // attendre le prochain rendu pour connaître l'état des verrous.
  const openRef = useRef(open)
  openRef.current = open

  // ----- Reverrouillage après inactivité -----

  const lastActivity = useRef(Date.now())

  useEffect(() => {
    // Rien d'ouvert : pas de minuterie à faire tourner.
    if (open.size === 0) return

    // Ouvrir un verrou est en soi une activité : on repart du moment présent.
    lastActivity.current = Date.now()
    const bump = () => {
      lastActivity.current = Date.now()
    }
    for (const type of ACTIVITY_EVENTS) {
      window.addEventListener(type, bump, { passive: true, capture: true })
    }

    const timer = setInterval(() => {
      if (Date.now() - lastActivity.current < IDLE_LIMIT_MS) return
      // Les clés et les textes en clair sont lâchés : il n'en reste rien.
      setOpen((previous) => (previous.size === 0 ? previous : new Map()))
      setAutoRelockedAt(Date.now())
    }, IDLE_CHECK_MS)

    return () => {
      for (const type of ACTIVITY_EVENTS) {
        window.removeEventListener(type, bump, { capture: true })
      }
      clearInterval(timer)
    }
  }, [open.size])

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
        updatedAt: Date.now(),
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
      setAutoRelockedAt(null)
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
      setAutoRelockedAt(null)
      return true
    },
    [latest],
  )

  /** Referme : la clé et les textes en clair sont lâchés, il n'en reste rien. */
  const relock = useCallback((lockId?: Id) => {
    // Refermer soi-même n'a pas besoin d'être expliqué.
    setAutoRelockedAt(null)
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

      dispatch({ type: 'lock/remove', id: lockId, pages: cleared, now })
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
    () => ({ openLocks, autoRelockedAt, reveal, protect, unlock, relock, unprotect, seal }),
    [openLocks, autoRelockedAt, reveal, protect, unlock, relock, unprotect, seal],
  )
}
